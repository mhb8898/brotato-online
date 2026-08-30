// ---------------------------------------------------------------------------
// DOM UI. Kept strictly separate from the simulation: this file only ever
// reads the 'you' / 'shop' / 'lobby' control messages the host sends, so a
// client can render the full interface without owning any game state.
// ---------------------------------------------------------------------------

import {
  CHARACTERS, WEAPONS, ITEMS, STAT_LABEL, STAT_PCT, BASE_STATS,
  TIER_COLOR, TIER_NAME, MAX_WEAPONS,
} from './data.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fmtStat(k, v) {
  const sign = v > 0 ? '+' : '';
  if (k === 'hpRegen') return `${sign}${v.toFixed(1)}/s`;
  if (STAT_PCT.has(k)) return `${sign}${Math.round(v)}%`;
  return `${sign}${Math.round(v)}`;
}

export class UI {
  constructor(cb) {
    this.cb = cb;
    this.selChar = 0;
    this.lastShopKey = '';
    this.bind();
    this.buildChars();
  }

  bind() {
    const c = this.cb;
    $('btnSolo').onclick = () => c.onSolo();
    $('btnHost').onclick = () => c.onHost();
    $('btnJoinPane').onclick = () => { this.pane('menuJoin'); $('codeInput').focus(); };
    $('btnBack').onclick = () => this.pane('menuMain');
    $('btnJoin').onclick = () => c.onJoin($('codeInput').value.trim().toUpperCase());
    $('btnCancel').onclick = () => c.onCancel();
    $('codeInput').onkeydown = (e) => { if (e.key === 'Enter') $('btnJoin').click(); };
    $('nameInput').oninput = () => localStorage.setItem('pr_name', $('nameInput').value);

    $('btnReady').onclick = () => c.onReady();
    $('btnLeave').onclick = () => c.onLeave();
    $('btnCopy').onclick = () => c.onCopyLink();

    $('btnReroll').onclick = () => c.onReroll();
    $('btnGo').onclick = () => c.onShopReady();
    $('btnAgain').onclick = () => c.onRestart();
    $('btnQuit').onclick = () => c.onLeave();
    $('btnMute').onclick = () => c.onMute();

    $('nameInput').value = localStorage.getItem('pr_name') || '';
  }

  // ------------------------------------------------------------- screens
  pane(id) {
    for (const p of ['menuMain', 'menuJoin', 'menuConnecting']) $(p).classList.toggle('hidden', p !== id);
  }

  screen(name) {
    for (const s of ['menu', 'lobby', 'shop', 'over']) $(s).classList.toggle('hidden', s !== name);
    $('hud').classList.toggle('hidden', name === 'menu' || name === 'over');
    if (name !== 'shop') this.lastShopKey = '';
  }

  connecting(text) { this.pane('menuConnecting'); $('connTxt').textContent = text; }
  joinError(text) { this.pane('menuJoin'); $('joinErr').textContent = text; }
  get playerName() { return ($('nameInput').value || '').trim().slice(0, 14) || 'Spud'; }

  // -------------------------------------------------------------- lobby
  buildChars() {
    const grid = $('charGrid');
    grid.innerHTML = '';
    for (const ch of CHARACTERS) {
      const node = el('button', 'char');
      node.dataset.id = ch.id;
      const mods = Object.entries(ch.mods)
        .map(([k, v]) => `<span class="pill ${v > 0 ? 'up' : 'down'}">${STAT_LABEL[k]} ${fmtStat(k, v)}</span>`)
        .join('');
      node.innerHTML =
        `<div class="dot" style="background:${ch.color};box-shadow:0 0 14px ${ch.color}"></div>` +
        `<h4>${ch.name}</h4><p>${ch.desc}</p>` +
        `<div class="mods"><span class="pill">${WEAPONS[ch.weapon].name}</span>${mods}</div>`;
      node.onclick = () => { this.selChar = ch.id; this.markChar(); this.cb.onChar(ch.id); };
      grid.appendChild(node);
    }
    this.markChar();
  }

  markChar() {
    for (const n of $('charGrid').children) n.classList.toggle('sel', +n.dataset.id === this.selChar);
  }

  setRoom(code, link) {
    $('roomBox').classList.toggle('hidden', !code);
    if (code) { $('roomCode').textContent = code; this.inviteLink = link; }
  }

  setLobbySub(t) { $('lobbySub').textContent = t; }

  renderPlayers(roster, myPid) {
    const list = $('playerList');
    list.innerHTML = '';
    for (const [pid, p] of roster) {
      const ch = CHARACTERS[p.char] || CHARACTERS[0];
      const li = el('li');
      li.innerHTML =
        `<span class="dot" style="background:${ch.color}"></span>` +
        `<span>${esc(p.name)}${pid === myPid ? ' <small style="color:#98a0b5">(you)</small>' : ''}</span>` +
        `<span class="tick ${p.ready ? 'ok' : ''}">${p.ready ? 'READY' : 'picking…'}</span>`;
      list.appendChild(li);
    }
    const me = roster.get(myPid);
    $('btnReady').textContent = me?.ready ? 'Not ready' : 'Ready';
    $('btnReady').classList.toggle('primary', !me?.ready);
  }

  // ---------------------------------------------------------------- HUD
  updateHud(view, you, roster, pid) {
    if (!view) return;
    $('waveNum').textContent = view.wave || 1;
    const dur = Math.min(50, 18 + (view.wave || 1) * 2);
    const frac = Math.max(0, Math.min(1, view.timeLeft / dur));
    $('timerFill').style.width = `${frac * 100}%`;
    $('timerFill').style.background = frac < 0.25
      ? 'linear-gradient(90deg,#d64b4b,#ff7e7e)'
      : 'linear-gradient(90deg,#4b7bd6,#7ea6ff)';
    $('timerTxt').textContent = Math.ceil(view.timeLeft);

    const me = view.players.find((p) => p.id === pid);
    if (me) {
      const pct = Math.max(0, me.hp / me.maxHp) * 100;
      $('hpFill').style.width = `${pct}%`;
      $('hpFill').style.background = pct < 30
        ? 'linear-gradient(90deg,#a33f3f,#ff5c5c)'
        : 'linear-gradient(90deg,#3fa34d,#7ee081)';
      $('hpTxt').textContent = `${Math.ceil(me.hp)} / ${me.maxHp}`;
    }
    if (you) {
      $('matNum').textContent = you.mats;
      $('lvlNum').textContent = you.level;
      $('xpFill').style.width = `${(you.xp / you.xpNeed) * 100}%`;
      const key = you.weapons.map((w) => w.id).join(',');
      if (key !== this._wkey) {
        this._wkey = key;
        $('weaponRow').innerHTML = you.weapons
          .map((w) => `<span class="weapon-chip" style="border-color:${TIER_COLOR[w.tier - 1]}55">${w.name}</span>`)
          .join('');
      }
    }

    // Teammates panel is pointless in a solo run.
    const tp = $('teamPanel');
    if (roster.size <= 1) { tp.innerHTML = ''; return; }
    let html = '';
    for (const p of view.players) {
      const info = roster.get(p.id);
      if (!info) continue;
      const ch = CHARACTERS[info.char] || CHARACTERS[0];
      const down = p.flags & 1;
      html +=
        `<div class="team-row ${down ? 'down' : ''}">` +
        `<div class="nm"><span class="dot" style="background:${ch.color}"></span>${esc(info.name)}</div>` +
        `<div class="bar"><i style="width:${down ? 100 : Math.max(0, (p.hp / p.maxHp) * 100)}%"></i></div></div>`;
    }
    tp.innerHTML = html;
  }

  netBadge(text) {
    const b = $('netBadge');
    b.classList.toggle('hidden', !text);
    if (text) b.textContent = text;
  }

  // --------------------------------------------------------------- shop
  renderShop(shop, you, wave, timeLeft, roster, myPid) {
    $('shopNext').textContent = wave + 1;
    $('shopMats').textContent = you ? you.mats : 0;
    $('shopTimer').textContent = timeLeft > 0 ? `${Math.ceil(timeLeft)}s` : '--';
    if (!shop || !you) return;

    $('rerollCost').textContent = shop.reroll;
    $('btnReroll').disabled = you.mats < shop.reroll;
    $('wslots').textContent = `${you.weapons.length} / ${MAX_WEAPONS}`;

    const me = roster.get(myPid);
    $('btnGo').textContent = me?.ready ? 'Waiting for others…' : 'Ready for next wave';
    $('btnGo').classList.toggle('primary', !me?.ready);

    // Rebuilding the offer grid every frame would kill click targets mid-press,
    // so only redraw when something actually changed.
    const key = JSON.stringify([shop.offers.map((o) => o && [o.id, o.sold]), shop.locked, you.mats, you.weapons.length]);
    if (key === this.lastShopKey) return;
    this.lastShopKey = key;

    const box = $('offers');
    box.innerHTML = '';
    shop.offers.forEach((o, i) => {
      const card = el('div', `offer ${o?.sold ? 'sold' : ''}`);
      if (!o) { box.appendChild(card); return; }
      card.style.borderTopColor = TIER_COLOR[o.tier];

      let body;
      if (o.kind === 'weapon') {
        const w = WEAPONS[o.id];
        body = `<div class="wstat">${w.cls === 'melee' ? 'Melee' : 'Ranged'} &middot; ${w.dmg} dmg<br>` +
          `${(1 / w.cd).toFixed(1)} atk/s &middot; ${w.range} range` +
          `${w.count ? `<br>${w.count} projectiles` : ''}` +
          `${w.pierce ? `<br>pierces ${w.pierce >= 99 ? 'everything' : w.pierce}` : ''}` +
          `${w.aoe ? `<br>${w.aoe} blast radius` : ''}` +
          `${w.chain ? `<br>chains to ${w.chain}` : ''}` +
          `${w.homing ? '<br>homing' : ''}</div>`;
      } else {
        body = `<div class="mods">${Object.entries(o.mods)
          .map(([k, v]) => `<div class="${v > 0 ? 'up' : 'down'}">${STAT_LABEL[k]} ${fmtStat(k, v)}</div>`)
          .join('')}</div>`;
      }

      const afford = you.mats >= o.price;
      const full = o.kind === 'weapon' && you.weapons.length >= MAX_WEAPONS;
      card.innerHTML =
        `<button class="lock ${shop.locked[i] ? 'on' : ''}" title="Lock through rerolls">&#128274;</button>` +
        `<span class="kind" style="color:${TIER_COLOR[o.tier]}">${TIER_NAME[o.tier]} ${o.kind}</span>` +
        `<h4>${o.name}</h4>${body}` +
        `<button class="btn buy ${afford && !o.sold && !full ? 'primary' : ''}" ${o.sold || !afford || full ? 'disabled' : ''}>` +
        `${o.sold ? 'Bought' : full ? 'Slots full' : `Buy ${o.price}`}</button>`;
      card.querySelector('.lock').onclick = () => this.cb.onLock(i);
      card.querySelector('.buy').onclick = () => this.cb.onBuy(i);
      box.appendChild(card);
    });

    this.renderInventory(you);
    this.renderStats(you);
  }

  renderInventory(you) {
    const wbox = $('invWeapons');
    wbox.innerHTML = '';
    you.weapons.forEach((w, i) => {
      const row = el('div', 'inv-row');
      row.innerHTML =
        `<span class="swatch" style="background:${TIER_COLOR[w.tier - 1]}"></span><span>${w.name}</span>` +
        `<button class="btn tiny sell" ${you.weapons.length <= 1 ? 'disabled' : ''}>Sell ${Math.floor(WEAPONS[w.id].price * 0.5)}</button>`;
      row.querySelector('.sell').onclick = () => this.cb.onSell('weapon', i);
      wbox.appendChild(row);
    });

    const ibox = $('invItems');
    ibox.innerHTML = '';
    if (!you.items.length) ibox.appendChild(el('div', 'empty', 'Nothing yet.'));
    you.items.forEach((it, i) => {
      const def = ITEMS.find((x) => x.id === it.id);
      const row = el('div', 'inv-row');
      row.innerHTML =
        `<span class="swatch" style="background:${TIER_COLOR[it.tier - 1]}"></span><span>${it.name}</span>` +
        `<button class="btn tiny sell">Sell ${Math.floor((def?.price || 10) * 0.5)}</button>`;
      row.querySelector('.sell').onclick = () => this.cb.onSell('item', i);
      ibox.appendChild(row);
    });
  }

  renderStats(you) {
    const box = $('statList');
    box.innerHTML = '';
    for (const k of Object.keys(BASE_STATS)) {
      const v = you.stats[k];
      if (v === BASE_STATS[k] && v === 0) continue;   // hide untouched zero stats
      const d = el('div');
      const cls = v > BASE_STATS[k] ? 'up' : v < BASE_STATS[k] ? 'down' : '';
      const shown = k === 'hpRegen' ? `${v.toFixed(1)}/s`
        : STAT_PCT.has(k) ? `${Math.round(v)}%` : Math.round(v);
      d.innerHTML = `<span>${STAT_LABEL[k]}</span><b class="${cls}">${shown}</b>`;
      box.appendChild(d);
    }
  }

  // ----------------------------------------------------------- level up
  renderLevelup(msg) {
    const box = $('levelup');
    if (!msg || !msg.options) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    $('luLevel').textContent = msg.level;
    $('luPending').textContent = msg.pending > 1 ? `(${msg.pending} pending)` : '';
    const opts = $('luOptions');
    opts.innerHTML = '';
    msg.options.forEach((o, i) => {
      const [k, v] = Object.entries(o.mods)[0];
      const b = el('button', 'lu-opt');
      b.innerHTML = `<span class="k">${STAT_LABEL[k]}</span><span class="v">${fmtStat(k, v)}</span>`;
      b.onclick = () => this.cb.onPick(i);
      opts.appendChild(b);
    });
  }

  // ---------------------------------------------------------- game over
  renderOver(msg, canRestart) {
    $('overTitle').textContent = msg.win ? 'You survived!' : 'Wiped out';
    $('overSub').textContent = msg.win
      ? `All ${msg.wave} waves cleared.`
      : `The squad went down on wave ${msg.wave}.`;
    const list = $('scoreList');
    list.innerHTML = '';
    for (const s of msg.scores || []) {
      const ch = CHARACTERS[s.char] || CHARACTERS[0];
      const li = el('li');
      li.innerHTML =
        `<span class="dot" style="background:${ch.color}"></span><b>${esc(s.name)}</b>` +
        `<span class="k">${s.kills} kills &middot; lv ${s.level}</span>`;
      list.appendChild(li);
    }
    $('btnAgain').classList.toggle('hidden', !canRestart);
    $('overHint').textContent = canRestart ? '' : 'Waiting for the host to start a new run.';
  }

  toast(text, kind) {
    const t = el('div', `toast ${kind || ''}`, esc(text));
    $('toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2400);
    setTimeout(() => t.remove(), 2800);
  }
}
