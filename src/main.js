// ---------------------------------------------------------------------------
// Entry point. Owns the game loop and decides, per mode, who simulates.
//
//   SOLO   - you run the world and consume your own snapshots.
//   HOST   - same, plus you serve every connected client.
//   CLIENT - you run no simulation at all: send inputs, render snapshots.
//
// Note that SOLO and HOST take the identical code path, right down to encoding
// a snapshot to bytes and decoding it back before rendering. That is a couple
// of hundred microseconds per tick spent buying a guarantee: a protocol bug
// cannot survive a solo playtest, and the host always sees exactly what a
// remote client sees.
// ---------------------------------------------------------------------------

import { World, TICK, PHASE } from './world.js';
import { Host, Client, makeRoomCode } from './net.js';
import { ClientState } from './clientstate.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { encodeSnapshot, decodeSnapshot, encodeInput, decodeInput, asView, MSG, FX } from './protocol.js';
import { INPUT_HZ } from './config.js';
import { sfx, unlock, setMuted } from './audio.js';
import { ARENA } from './data.js';

const MODE = { MENU: 0, SOLO: 1, HOST: 2, CLIENT: 3 };
const LOCAL_PID = 1;

/**
 * A timer that keeps running when the tab is not visible.
 *
 * requestAnimationFrame is the natural game-loop clock, but browsers pause it
 * outright in background tabs - and a paused HOST freezes the world for every
 * other player in the room. setInterval on the main thread is throttled to
 * ~1 Hz for the same reason. Timers inside a dedicated Worker are not, so the
 * simulation is driven from there and only rendering stays on rAF (where
 * pausing is exactly what we want).
 */
function makeTicker(intervalMs, onTick) {
  const src = `let id = null;
    self.onmessage = (e) => {
      if (e.data && e.data.start) { clearInterval(id); id = setInterval(() => self.postMessage(0), e.data.start); }
      else { clearInterval(id); id = null; }
    };`;
  try {
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = onTick;
    w.postMessage({ start: intervalMs });
    return { stop: () => { w.postMessage({ stop: true }); w.terminate(); } };
  } catch {
    // Workers blocked (strict CSP, ancient browser): degrade to a throttled
    // main-thread timer. Foreground play is unaffected; background hosting is.
    const id = setInterval(onTick, intervalMs);
    return { stop: () => clearInterval(id) };
  }
}

class Game {
  constructor() {
    this.mode = MODE.MENU;
    this.world = null;
    this.host = null;
    this.client = null;
    this.state = new ClientState((fx) => this.onFx(fx));
    this.renderer = new Renderer(document.getElementById('game'));
    this.ui = new UI(this.uiCallbacks());
    this.shop = null;
    this.levelMsg = null;
    this.overMsg = null;
    this.seq = 0;
    this.simAcc = 0;
    this.inpAcc = 0;
    this.lastHp = null;
    this.lastPickSfx = 0;
    this.keys = new Set();
    this.mouse = { x: ARENA.w / 2, y: 0, active: false };
    this.touch = null;
    this.muted = false;

    this.bindInput();
    this.ui.screen('menu');

    // ?r=CODE deep link: an invite link should drop you straight at the code box.
    const room = new URLSearchParams(location.search).get('r');
    if (room) {
      document.getElementById('codeInput').value = room.toUpperCase().slice(0, 5);
      this.ui.pane('menuJoin');
    }

    this.last = performance.now();
    this.lastSim = performance.now();
    this.ticker = makeTicker(16, () => this.tick());
    requestAnimationFrame((t) => this.frame(t));

    // A hidden tab receives no keyup events, so a held key would stick down
    // forever and walk the player into a wall while you are away.
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.keys.clear(); });
  }

  get isSim() { return this.mode === MODE.SOLO || this.mode === MODE.HOST; }
  get myPid() { return this.mode === MODE.CLIENT ? (this.client?.pid || 0) : LOCAL_PID; }

  // =========================================================================
  // Mode setup
  // =========================================================================
  uiCallbacks() {
    return {
      onSolo: () => this.startSolo(),
      onHost: () => this.startHost(),
      onJoin: (code) => this.startClient(code),
      onCancel: () => this.teardown(),
      onLeave: () => this.teardown(),
      onChar: (id) => this.sendControl({ t: 'char', id }),
      onReady: () => {
        const me = this.state.roster.get(this.myPid);
        this.sendControl({ t: 'ready', v: !me?.ready });
      },
      onShopReady: () => {
        const me = this.state.roster.get(this.myPid);
        this.sendControl({ t: 'shopready', v: !me?.ready });
      },
      onBuy: (slot) => { unlock(); this.sendControl({ t: 'buy', slot }); },
      onSell: (kind, idx) => this.sendControl({ t: 'sell', kind, idx }),
      onReroll: () => { unlock(); this.sendControl({ t: 'reroll' }); },
      onLock: (slot) => this.sendControl({ t: 'lock', slot }),
      onPick: (idx) => { sfx.buy(); this.sendControl({ t: 'levelpick', idx }); },
      onRestart: () => this.sendControl({ t: 'restart' }),
      onCopyLink: () => this.copyLink(),
      onMute: () => {
        this.muted = !this.muted;
        setMuted(this.muted);
        document.getElementById('btnMute').textContent = this.muted ? '\u{1F507}' : '\u{1F50A}';
      },
    };
  }

  makeWorld() {
    this.world = new World((pid, msg) => {
      if (pid === null) { this.onControl(msg); this.host?.sendControl(null, msg); }
      else if (pid === LOCAL_PID) this.onControl(msg);
      else this.host?.sendControl(pid, msg);
    });
    this.world.addPlayer(LOCAL_PID, this.ui.playerName);
    this.world.onControl(LOCAL_PID, { t: 'char', id: this.ui.selChar });
  }

  startSolo() {
    unlock();
    this.teardownNet();
    this.mode = MODE.SOLO;
    this.state.reset();
    this.state.pid = LOCAL_PID;
    this.makeWorld();
    this.ui.setRoom(null);
    this.ui.setLobbySub('Solo run. Pick a character and hit Ready.');
    this.ui.screen('lobby');
  }

  async startHost() {
    unlock();
    this.teardownNet();
    this.ui.connecting('Reserving a room…');
    const code = makeRoomCode();
    this.host = new Host(code, {
      onJoin: (pid, name) => {
        this.world.addPlayer(pid, name);
        for (const p of this.world.players.values()) this.world.pushYou(p);
        sfx.join();
        this.ui.toast(`${name} joined`);
      },
      onLeave: (pid) => {
        const p = this.world?.players.get(pid);
        this.world?.removePlayer(pid);
        sfx.leave();
        this.ui.toast(`${p?.name || 'A player'} left`, 'warn');
      },
      onControl: (pid, msg) => this.world?.onControl(pid, msg),
      onInput: (pid, data) => {
        const v = asView(data);
        if (v && v.getUint8(0) === MSG.INPUT) this.world?.setInput(pid, decodeInput(v));
      },
      onStatus: (t, k) => this.ui.toast(t, k),
    });

    try {
      await this.host.start();
    } catch (err) {
      this.host = null;
      this.ui.joinError(err.message || 'Could not reach the signalling server.');
      this.ui.pane('menuMain');
      this.ui.toast(err.message || 'Hosting failed', 'bad');
      return;
    }

    this.mode = MODE.HOST;
    this.state.reset();
    this.state.pid = LOCAL_PID;
    this.makeWorld();
    this.ui.setRoom(code, this.linkFor(code));
    this.ui.setLobbySub('Share the code. The run starts when everyone is ready.');
    this.ui.screen('lobby');
  }

  async startClient(code) {
    unlock();
    if (!/^[A-Z0-9]{5}$/.test(code)) { this.ui.joinError('Room codes are 5 characters.'); return; }
    this.teardownNet();
    this.ui.connecting(`Connecting to ${code}…`);

    this.client = new Client(code, this.ui.playerName, {
      onControl: (msg) => this.onControl(msg),
      onState: (data) => {
        const v = asView(data);
        if (v && v.getUint8(0) === MSG.SNAPSHOT) this.state.pushSnapshot(decodeSnapshot(v));
      },
      onStatus: (t, k) => this.ui.toast(t, k),
      onClose: () => {
        this.ui.toast('Host closed the game.', 'bad');
        this.teardown();
      },
    });

    try {
      await this.client.start();
    } catch (err) {
      this.client = null;
      this.ui.joinError(err.message || 'Connection failed.');
      return;
    }

    this.mode = MODE.CLIENT;
    this.state.reset();
    this.state.pid = this.client.pid;
    this.ui.setRoom(code, this.linkFor(code));
    this.ui.setLobbySub('Connected. Pick a character and hit Ready.');
    this.ui.screen('lobby');
    this.sendControl({ t: 'char', id: this.ui.selChar });
  }

  teardownNet() {
    this.host?.close(); this.host = null;
    this.client?.close(); this.client = null;
    this.world = null;
  }

  teardown() {
    this.teardownNet();
    this.mode = MODE.MENU;
    this.state.reset();
    this.state.roster.clear();
    this.state.you = null;
    this.shop = null;
    this.levelMsg = null;
    this.ui.renderLevelup(null);
    this.ui.netBadge(null);
    this.ui.pane('menuMain');
    this.ui.screen('menu');
  }

  linkFor(code) { return `${location.origin}${location.pathname}?r=${code}`; }

  async copyLink() {
    const link = this.ui.inviteLink;
    try {
      await navigator.clipboard.writeText(link);
      this.ui.toast('Invite link copied');
    } catch {
      // Clipboard API needs a secure context; fall back to a selectable prompt.
      window.prompt('Copy this invite link:', link);
    }
  }

  // =========================================================================
  // Messaging
  // =========================================================================
  sendControl(msg) {
    if (this.mode === MODE.CLIENT) this.client?.sendControl(msg);
    else this.world?.onControl(LOCAL_PID, msg);
  }

  /** Handles control messages on the CLIENT side of every mode. */
  onControl(msg) {
    if (!msg) return;
    switch (msg.t) {
      case 'lobby': {
        const next = new Map();
        for (const p of msg.players) next.set(p.id, p);
        this.state.roster = next;
        this.ui.renderPlayers(next, this.myPid);
        if (msg.phase === PHASE.LOBBY) {
          this.ui.screen('lobby');
          this.ui.renderLevelup(null);
        }
        break;
      }
      case 'you':
        this.state.you = msg;
        break;
      case 'v':
        // Vitals arrive before the first full 'you' on a fresh join; ignore
        // them until we have something to merge into.
        if (this.state.you) Object.assign(this.state.you, msg, { t: 'you' });
        break;
      case 'shop':
        this.shop = msg;
        break;
      case 'level':
        this.levelMsg = msg.options ? msg : null;
        this.ui.renderLevelup(this.levelMsg);
        break;
      case 'wave':
        this.shop = null;
        this.levelMsg = null;
        this.ui.renderLevelup(null);
        this.ui.screen('game');
        this.ui.toast(msg.boss ? `Wave ${msg.wave} - BOSS` : `Wave ${msg.wave}`, msg.boss ? 'warn' : '');
        if (msg.boss) sfx.boss(); else sfx.wave();
        break;
      case 'shopopen':
        this.ui.screen('shop');
        this.ui.lastShopKey = '';
        sfx.shop();
        break;
      case 'over':
        this.overMsg = msg;
        this.ui.renderOver(msg, true);
        this.ui.screen('over');
        if (msg.win) sfx.win(); else sfx.over();
        break;
      case 'down':
        if (msg.id === this.myPid) { this.ui.toast('You are down - back up at the shop', 'bad'); }
        else this.ui.toast(`${msg.name} went down`, 'warn');
        sfx.down();
        break;
      case 'toast':
        this.ui.toast(msg.msg, 'warn');
        sfx.deny();
        break;
      default: break;
    }
  }

  onFx(list) {
    this.renderer.spawnFx(list);
    const now = performance.now();
    for (const f of list) {
      if (f.t === FX.LEVELUP) sfx.level();
      else if (f.t === FX.PICKUP && now - this.lastPickSfx > 70) { this.lastPickSfx = now; sfx.pick(); }
    }
  }

  // =========================================================================
  // Input
  // =========================================================================
  bindInput() {
    const canvas = document.getElementById('game');

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
      unlock();
      // 1-4 pick a level-up without reaching for the mouse.
      if (this.levelMsg && k >= '1' && k <= '4') {
        const i = +k - 1;
        if (this.levelMsg.options[i]) { sfx.buy(); this.sendControl({ t: 'levelpick', idx: i }); }
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());

    addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const w = this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
      this.mouse.x = w.x; this.mouse.y = w.y; this.mouse.active = true;
    });
    canvas.addEventListener('mousedown', () => unlock());

    // -------- touch: left half drives a virtual stick, aim follows movement
    const stick = document.getElementById('stick');
    const nub = document.getElementById('stickNub');
    canvas.addEventListener('touchstart', (e) => {
      unlock();
      const t = e.changedTouches[0];
      this.touch = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
      stick.style.left = `${t.clientX - 64}px`;
      stick.style.top = `${t.clientY - 64}px`;
      stick.classList.remove('hidden');
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      if (!this.touch) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== this.touch.id) continue;
        const dx = t.clientX - this.touch.ox, dy = t.clientY - this.touch.oy;
        const d = Math.hypot(dx, dy);
        const max = 58;
        const k = d > max ? max / d : 1;
        this.touch.dx = (dx * k) / max;
        this.touch.dy = (dy * k) / max;
        nub.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      }
      e.preventDefault();
    }, { passive: false });
    const end = () => { this.touch = null; stick.classList.add('hidden'); nub.style.transform = ''; };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  readInput() {
    let mx = 0, my = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (k.has('w') || k.has('arrowup')) my -= 1;
    if (k.has('s') || k.has('arrowdown')) my += 1;
    if (this.touch) { mx += this.touch.dx; my += this.touch.dy; }

    const pos = this.state.predictedPos(performance.now());
    let aim;
    if (this.touch && (this.touch.dx || this.touch.dy)) aim = Math.atan2(this.touch.dy, this.touch.dx);
    else if (this.mouse.active) aim = Math.atan2(this.mouse.y - pos.y, this.mouse.x - pos.x);
    else aim = Math.atan2(my, mx || 0.0001);

    return { seq: ++this.seq, mx, my, aim };
  }

  // =========================================================================
  // Loop
  //
  // Two clocks on purpose:
  //   tick()  - worker-driven, fixed step: input and simulation. Runs even
  //             when the tab is hidden, so hosting survives an alt-tab.
  //   frame() - rAF: rendering only. Correctly idles when nothing is visible.
  // =========================================================================
  tick() {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastSim) / 1000);
    this.lastSim = now;
    if (this.mode === MODE.MENU) return;

    // Fixed-rate input so the client's prediction replay matches the host's
    // integration exactly - a variable step here would drift every frame.
    const step = 1 / INPUT_HZ;
    this.inpAcc += dt;
    let guard = 0;
    while (this.inpAcc >= step && guard++ < 4) {
      this.inpAcc -= step;
      const inp = this.readInput();
      this.state.applyLocalInput(inp);
      if (this.mode === MODE.CLIENT) this.client?.sendState(encodeInput(inp));
      else this.world?.setInput(LOCAL_PID, inp);
    }
    if (guard >= 4) this.inpAcc = 0;

    if (this.isSim && this.world) {
      this.simAcc += dt;
      let steps = 0;
      // Cap catch-up: after a long stall we skip time rather than spiral
      // through a hundred ticks in one go.
      while (this.simAcc >= TICK && steps++ < 4) {
        this.simAcc -= TICK;
        this.world.step();
        const bytes = encodeSnapshot(this.world.snapshot());
        this.host?.broadcastState(bytes);
        this.state.pushSnapshot(decodeSnapshot(asView(bytes)));
      }
      if (steps >= 4) this.simAcc = 0;
    }
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    if (this.mode === MODE.MENU) { this.renderer.draw(null, null, dt); return; }

    const view = this.state.sample(performance.now());
    const info = { pid: this.myPid, roster: this.state.roster, danger: 0 };
    if (view && view.phase === PHASE.WAVE) {
      const dur = Math.min(50, 18 + view.wave * 2);
      info.danger = 1 - Math.max(0, Math.min(1, view.timeLeft / dur));
    }
    this.renderer.draw(view, info, dt);

    if (view) {
      this.ui.updateHud(view, this.state.you, this.state.roster, this.myPid);
      if (view.phase === PHASE.SHOP) {
        this.ui.renderShop(this.shop, this.state.you, view.wave, view.timeLeft, this.state.roster, this.myPid);
      }
      const me = view.players.find((p) => p.id === this.myPid);
      if (me) {
        if (this.lastHp !== null && me.hp < this.lastHp - 0.01) {
          sfx.hurt();
          this.renderer.shake = Math.max(this.renderer.shake, 9);
        }
        this.lastHp = me.hp;
      }
    }

    if (this.mode === MODE.CLIENT) {
      this.ui.netBadge(this.state.stale ? 'Connection unstable…' : null);
    }
  }
}

window.addEventListener('load', () => {
  if (typeof Peer === 'undefined') {
    document.getElementById('joinErr').textContent =
      'PeerJS failed to load - online play is unavailable, but solo works.';
  }
  window.game = new Game();
});
