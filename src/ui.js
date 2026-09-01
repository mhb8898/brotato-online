// ---------------------------------------------------------------------------
// DOM UI. Kept strictly separate from the simulation: this file only ever
// reads the 'you' / 'shop' / 'lobby' control messages the host sends, so a
// client can render the full interface without owning any game state.
// ---------------------------------------------------------------------------

import {
  CHARACTERS, WEAPONS, ITEMS, STAT_LABEL, STAT_PCT, BASE_STATS,
  TIER_COLOR, TIER_NAME, MAX_WEAPONS, MAX_WEAPON_LVL, ROMAN,
  weaponAt, weaponName, weaponDps,
} from './data.js';
import { renderPortrait } from './render.js';
import { renderIcon } from './icons.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Which damage stats actually feed this weapon - the thing shop cards hid. */
function scaleText(def) {
  const out = [];
  if (def.scale.m) out.push(`Melee &times;${def.scale.m}`);
  if (def.scale.r) out.push(`Ranged &times;${def.scale.r}`);
  if (def.scale.e) out.push(`Elemental &times;${def.scale.e}`);
  return out.join(' &middot; ') || 'flat damage only';
}

/** Short behaviour tags: everything the raw numbers do not say out loud. */
function weaponTags(def) {
  const t = [];
  if (def.count) t.push(`${def.count} projectiles`);
  if (def.pierce) t.push(def.pierce >= 99 ? 'pierces all' : `pierces ${def.pierce}`);
  if (def.chain) t.push(`chains ${def.chain}`);
  if (def.aoe) t.push(`${def.aoe} blast`);
  if (def.homing) t.push('homing');
  if (def.knock) t.push('knockback');
  if (def.lifesteal) t.push(`${def.lifesteal}% lifesteal`);
  if (def.crit) t.push(`+${def.crit}% crit`);
  if (def.spread) t.push('spread');
  return t;
}

/** The full stat block for one weapon at one level. */
function weaponBody(id, lvl) {
  const def = weaponAt(id, lvl);
  const tags = weaponTags(def).map((x) => `<span class="tag">${x}</span>`).join('');
  return (
    `<p class="wdesc">${WEAPONS[id].desc}</p>` +
    `<div class="wstat">` +
    `<span>${def.cls === 'melee' ? 'Melee' : 'Ranged'}</span>` +
    `<span><b>${def.dmg}</b> dmg &times; <b>${(1 / def.cd).toFixed(1)}</b>/s ` +
    `= <b>${Math.round(weaponDps(def))}</b> dps</span>` +
    `<span><b>${def.range}</b> range</span>` +
    `<span class="scale">Scales with ${scaleText(def)}</span>` +
    `</div>` +
    (tags ? `<div class="tags">${tags}</div>` : '')
  );
}

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

    $('btnNetTest').onclick = () => c.onNetTest();

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

  netTest(state, res) {
    const box = $('netTest');
    box.classList.remove('hidden');
    $('btnNetTest').disabled = state === 'running';
    if (state === 'running') {
      box.className = 'net-test';
      box.innerHTML = '<b>Testing…</b><span>Asking STUN and TURN what they can do for you.</span>';
      return;
    }
    box.className = `net-test ${res.verdict}`;
    box.innerHTML = `<b>${esc(res.headline)}</b>`
      + res.lines.map((l) => `<span>${esc(l)}</span>`).join('');
  }
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
        .map(([k, v]) => `<div class="mod ${v > 0 ? 'up' : 'down'}"><span>${STAT_LABEL[k]}</span><b>${fmtStat(k, v)}</b></div>`)
        .join('');
      node.innerHTML =
        `<canvas class="portrait" width="128" height="128"></canvas>` +
        `<h4>${ch.name}</h4><p>${ch.desc}</p>` +
        `<div class="pill wpn" title="${WEAPONS[ch.weapon].desc}"><canvas class="icon xs" width="48" height="48"></canvas>${WEAPONS[ch.weapon].name}</div>` +
        `<div class="mods">${mods}</div>` +
        `<p class="starter">${WEAPONS[ch.weapon].desc}</p>`;
      node.onclick = () => { this.selChar = ch.id; this.markChar(); this.cb.onChar(ch.id); };
      grid.appendChild(node);
      renderPortrait(node.querySelector('.portrait'), ch.id);
      renderIcon(node.querySelector('.icon'), 'weapon', ch.weapon);
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
      const key = you.weapons.map((w) => `${w.id}${w.lvl}`).join(',');
      if (key !== this._wkey) {
        this._wkey = key;
        $('weaponRow').innerHTML = you.weapons
          .map((w) => `<span class="weapon-chip" style="border-color:${TIER_COLOR[w.tier - 1]}66"><canvas class="icon xs" width="48" height="48"></canvas>${w.name}</span>`)
          .join('');
        $('weaponRow').querySelectorAll('.icon').forEach((c, i) => renderIcon(c, 'weapon', you.weapons[i].id, you.weapons[i].lvl));
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
        `<div class="bar"><i style="width:${down ? 100 : Math.round(Math.max(0, (p.hp / p.maxHp) * 100))}%"></i></div></div>`;
    }
    // Reparsing this every frame forced a full layout 60x a second for nothing.
    if (html !== this._teamHtml) { this._teamHtml = html; tp.innerHTML = html; }
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

    const freeRoll = shop.reroll === 0;
    $('rerollCost').textContent = freeRoll ? 'FREE' : shop.reroll;
    $('btnReroll').disabled = you.mats < shop.reroll;
    $('btnReroll').classList.toggle('primary', freeRoll);
    $('btnReroll').title = freeRoll ? 'You bought the whole shop - this roll is on the house' : '';
    $('wslots').textContent = `${you.weapons.length} / ${MAX_WEAPONS}`;

    const me = roster.get(myPid);
    $('btnGo').textContent = me?.ready ? 'Waiting for others…' : 'Ready for next wave';
    $('btnGo').classList.toggle('primary', !me?.ready);

    // Rebuilding the offer grid every frame would kill click targets mid-press,
    // so only redraw when something actually changed.
    const key = JSON.stringify([shop.offers.map((o) => o && [o.id, o.sold]), shop.locked,
      you.mats, you.weapons.map((w) => `${w.id}${w.lvl}`), you.items.length]);
    if (key === this.lastShopKey) return;
    this.lastShopKey = key;

    const box = $('offers');
    box.innerHTML = '';
    shop.offers.forEach((o, i) => {
      const card = el('div', `offer ${o?.sold ? 'sold' : ''}`);
      if (!o) { box.appendChild(card); return; }
      card.style.borderTopColor = TIER_COLOR[o.tier];

      // Buying a duplicate merges instead of taking a slot, so it stays legal
      // at full slots - and saying so is the only way anyone would try it.
      const merges = o.kind === 'weapon' && you.weapons.some((w) => w.id === o.id && w.lvl === 1);
      let body;
      if (o.kind === 'weapon') {
        body = weaponBody(o.id, 1);
        if (merges) {
          body += `<div class="merge">Combines with your ${WEAPONS[o.id].name}` +
            ` &rarr; <b>${weaponName(o.id, 2)}</b></div>`;
        }
      } else {
        body = `<div class="mods">${Object.entries(o.mods)
          .map(([k, v]) => `<div class="mod ${v > 0 ? 'up' : 'down'}"><span>${STAT_LABEL[k]}</span><b>${fmtStat(k, v)}</b></div>`)
          .join('')}</div>`;
      }

      const afford = you.mats >= o.price;
      const full = o.kind === 'weapon' && you.weapons.length >= MAX_WEAPONS && !merges;
      const locked = !!shop.locked[i];
      card.classList.toggle('locked', locked);
      card.innerHTML =
        `<button class="lock ${locked ? 'on' : ''}" aria-pressed="${locked}" ` +
        `title="${locked ? 'Locked - kept through rerolls and into the next wave' : 'Lock: keep this through rerolls and into the next wave'}">` +
        `${locked ? '&#128274;' : '&#128275;'}</button>` +
        `<div class="offer-head"><canvas class="icon" width="112" height="112"></canvas>` +
        `<div class="offer-title"><span class="kind" style="color:${TIER_COLOR[o.tier]}">${TIER_NAME[o.tier]} ${o.kind}</span>` +
        `<h4>${o.name}</h4></div></div>${body}` +
        `<button class="btn buy ${afford && !o.sold && !full ? 'primary' : ''}" ${o.sold || !afford || full ? 'disabled' : ''}>` +
        `${o.sold ? 'Bought' : full ? 'Slots full' : merges ? `Combine ${o.price}` : `Buy ${o.price}`}</button>`;
      renderIcon(card.querySelector('.icon'), o.kind, o.id);
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
      const def = weaponAt(w.id, w.lvl);
      const row = el('div', 'inv-row wpn');
      const dupe = you.weapons.some((o, j) => j !== i && o.id === w.id && o.lvl === w.lvl);
      row.innerHTML =
        `<canvas class="icon sm" width="72" height="72"></canvas>` +
        `<span class="wname">${WEAPONS[w.id].name}${w.lvl > 1 ? ` <b class="lvl">${ROMAN[w.lvl - 1]}</b>` : ''}` +
        `<small>${def.dmg} dmg &middot; ${(1 / def.cd).toFixed(1)}/s &middot; ${Math.round(weaponDps(def))} dps</small></span>` +
        `<button class="btn tiny sell" ${you.weapons.length <= 1 ? 'disabled' : ''}>Sell ${w.sell}</button>`;
      row.title = `${WEAPONS[w.id].desc}\nScales with ${scaleText(def).replace(/&times;/g, 'x').replace(/&middot;/g, ',')}`
        + (dupe && w.lvl < MAX_WEAPON_LVL ? '\nYou own two of these - they will combine.' : '');
      renderIcon(row.querySelector('.icon'), 'weapon', w.id, w.lvl);
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
        `<canvas class="icon sm" width="72" height="72"></canvas><span>${it.name}</span>` +
        `<button class="btn tiny sell">Sell ${Math.floor((def?.price || 10) * 0.5)}</button>`;
      row.title = Object.entries(it.mods || {})
        .map(([k, v]) => `${STAT_LABEL[k]} ${fmtStat(k, v)}`).join('\n');
      renderIcon(row.querySelector('.icon'), 'item', it.id);
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
