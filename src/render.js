// ---------------------------------------------------------------------------
// Canvas 2D renderer.
//
// The whole arena is always on screen (no camera), which is deliberate: in
// co-op everyone must see the same field or callouts are meaningless, and it
// removes an entire class of "where is my teammate" problems. The canvas is
// scaled to fit and letterboxed, so 1600x900 world units mean the same thing
// on every machine.
//
// Nothing here is loaded from disk - every sprite is drawn from primitives.
// A deploy is therefore just HTML/CSS/JS with zero binary assets to 404.
// ---------------------------------------------------------------------------

import { ARENA, CHARACTERS, ENEMIES, TIER_COLOR } from './data.js';
import { FX, PROJ_KINDS } from './protocol.js';

const TAU = Math.PI * 2;

// Budgets, not guesses: a wave-20 minigun build pushes ~1400 damage numbers a
// second through here, and canvas text (stroke + fill) plus shadowBlur are by
// far the most expensive things this renderer can do. Past these counts the
// extra draws are illegible anyway, so they buy nothing but frame time.
const MAX_PARTS = 320;
const MAX_FLOATS = 80;
const GLOW_PROJ_LIMIT = 60;    // above this many bullets, bullets lose their glow
const GLOW_ENEMY_LIMIT = 55;   // above this many enemies, only bosses glow
const OUTLINE_LIMIT = 34;      // above this many floats, drop the text outline

export class Renderer {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.parts = [];
    this.floats = [];
    this.heavyProj = false;
    this.heavyEnemy = false;
    this.shake = 0;
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.t = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = this.c.clientWidth, h = this.c.clientHeight;
    this.c.width = Math.max(1, Math.round(w * dpr));
    this.c.height = Math.max(1, Math.round(h * dpr));
    this.dpr = dpr;
    this.scale = Math.min(w / ARENA.w, h / ARENA.h);
    this.ox = (w - ARENA.w * this.scale) / 2;
    this.oy = (h - ARENA.h * this.scale) / 2;
  }

  /** Screen (CSS px) -> world coords, for aiming with the mouse. */
  toWorld(sx, sy) {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  // ------------------------------------------------------------------- fx
  spawnFx(list) {
    for (const f of list) {
      switch (f.t) {
        case FX.HIT:
          this.burst(f.x, f.y, 4, '#ffd98a', 130, 0.22, 2);
          break;
        case FX.EXPLODE:
          if (this.parts.length < MAX_PARTS) this.parts.push({ kind: 'ring', x: f.x, y: f.y, r: 6, max: f.a, life: 0.35, maxLife: 0.35, col: '#ff9a4a' });
          this.burst(f.x, f.y, 16, '#ff7a3c', 320, 0.5, 4);
          this.shake = Math.max(this.shake, 7);
          break;
        case FX.BEAM:
          if (this.parts.length < MAX_PARTS) this.parts.push({ kind: 'beam', x: f.x, y: f.y, x2: f.x2, y2: f.y2, life: 0.16, maxLife: 0.16, col: '#9ee6ff' });
          break;
        case FX.LEVELUP:
          if (this.parts.length < MAX_PARTS) this.parts.push({ kind: 'ring', x: f.x, y: f.y, r: 8, max: 90, life: 0.6, maxLife: 0.6, col: '#ffe066' });
          this.float({ x: f.x, y: f.y - 34, text: 'LEVEL UP', col: '#ffe066', life: 1.1, maxLife: 1.1, size: 20, vy: -26 });
          break;
        case FX.PICKUP:
          this.burst(f.x, f.y, 3, '#8dffb0', 90, 0.2, 2);
          break;
        case FX.DEATH:
          this.burst(f.x, f.y, Math.min(20, 6 + f.a / 6), '#ff6b6b', 190, 0.45, 3);
          break;
        case FX.HEAL:
          this.float({ x: f.x, y: f.y - 26, text: '+', col: '#8dffb0', life: 0.6, maxLife: 0.6, size: 18, vy: -40 });
          break;
        case FX.DODGE:
          this.float({ x: f.x, y: f.y - 26, text: 'DODGE', col: '#7ec8ff', life: 0.7, maxLife: 0.7, size: 14, vy: -34 });
          break;
        case FX.DAMAGE: {
          const crit = f.x2 === 1;
          this.float({
            x: f.x + (Math.random() - 0.5) * 16, y: f.y, text: String(f.a),
            col: crit ? '#ffd166' : '#ffffff', life: crit ? 0.8 : 0.55,
            maxLife: crit ? 0.8 : 0.55, size: crit ? 20 : 13, vy: -46,
          });
          break;
        }
        default: break;
      }
    }
  }

  burst(x, y, n, col, spd, life, size) {
    // Thin the burst rather than refusing it: a half-density explosion still
    // reads as an explosion, an absent one does not.
    const head = MAX_PARTS - this.parts.length;
    if (head <= 0) return;
    if (n > head) n = head;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = spd * (0.4 + Math.random() * 0.6);
      this.parts.push({
        kind: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.6), maxLife: life, col, size,
      });
    }
  }

  float(f) {
    if (this.floats.length >= MAX_FLOATS) this.floats.shift();
    this.floats.push(f);
  }

  stepFx(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      if (p.kind === 'dot') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
      else if (p.kind === 'ring') p.r += (p.max - p.r) * Math.min(1, dt * 9);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      if (f.life <= 0) { this.floats.splice(i, 1); continue; }
      f.y += f.vy * dt;
      f.vy *= 0.94;
    }
    this.shake *= Math.pow(0.0015, dt);
    if (this.shake < 0.2) this.shake = 0;
  }

  // ----------------------------------------------------------------- draw
  draw(view, ctxInfo, dt) {
    const g = this.ctx;
    this.t += dt;
    this.stepFx(dt);

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#07080d';
    g.fillRect(0, 0, this.c.clientWidth, this.c.clientHeight);

    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    g.save();
    g.translate(this.ox + sx, this.oy + sy);
    g.scale(this.scale, this.scale);

    this.drawFloor(ctxInfo);
    if (!view) { g.restore(); return; }

    this.heavyProj = view.projs.length > GLOW_PROJ_LIMIT;
    this.heavyEnemy = view.enemies.length > GLOW_ENEMY_LIMIT;

    for (const p of view.pickups) this.drawPickup(p);
    for (const b of view.projs) if (b.flags & 1) this.drawProj(b);
    for (const e of view.enemies) this.drawEnemy(e);
    for (const p of view.players) this.drawPlayer(p, ctxInfo);
    for (const b of view.projs) if (!(b.flags & 1)) this.drawProj(b);
    this.drawParticles();
    this.drawFloats();

    g.restore();
  }

  drawFloor(info) {
    const g = this.ctx;
    // The gradient never changes; building one per frame was pure waste.
    if (!this._floorGrd) {
      const grd = g.createRadialGradient(ARENA.w / 2, ARENA.h / 2, 100, ARENA.w / 2, ARENA.h / 2, ARENA.w * 0.72);
      grd.addColorStop(0, '#181d2b');
      grd.addColorStop(1, '#0b0d15');
      this._floorGrd = grd;
    }
    g.fillStyle = this._floorGrd;
    g.fillRect(0, 0, ARENA.w, ARENA.h);

    g.strokeStyle = 'rgba(255,255,255,0.035)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let x = 0; x <= ARENA.w; x += 80) { g.moveTo(x, 0); g.lineTo(x, ARENA.h); }
    for (let y = 0; y <= ARENA.h; y += 80) { g.moveTo(0, y); g.lineTo(ARENA.w, y); }
    g.stroke();

    // Border pulses red as the wave timer runs down.
    const danger = info?.danger || 0;
    g.strokeStyle = `rgba(${120 + danger * 135},${60 - danger * 40},${90 - danger * 60},${0.5 + danger * 0.4})`;
    g.lineWidth = 5;
    g.strokeRect(2.5, 2.5, ARENA.w - 5, ARENA.h - 5);
  }

  drawPickup(p) {
    const g = this.ctx;
    const bob = Math.sin(this.t * 6 + p.id) * 2;
    if (p.type === 0) {
      g.fillStyle = '#8dffb0';
      g.shadowColor = '#8dffb0'; g.shadowBlur = 10;
      g.beginPath();
      g.moveTo(p.x, p.y - 6 + bob); g.lineTo(p.x + 5, p.y + bob);
      g.lineTo(p.x, p.y + 6 + bob); g.lineTo(p.x - 5, p.y + bob);
      g.closePath(); g.fill();
      g.shadowBlur = 0;
    } else {
      g.fillStyle = '#ff5c7a';
      g.shadowColor = '#ff5c7a'; g.shadowBlur = 12;
      g.fillRect(p.x - 8, p.y - 3 + bob, 16, 6);
      g.fillRect(p.x - 3, p.y - 8 + bob, 6, 16);
      g.shadowBlur = 0;
    }
  }

  drawEnemy(e) {
    const g = this.ctx;
    const def = ENEMIES[e.type] || ENEMIES[0];
    const elite = e.flags & 1;
    const hit = e.flags & 2;
    const windup = e.flags & 4;
    const r = def.r * (elite ? 1.5 : 1);

    if (windup) {
      g.strokeStyle = 'rgba(255,80,80,0.85)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(e.x, e.y, r + 8 + Math.sin(this.t * 30) * 3, 0, TAU); g.stroke();
    }
    // Elite glow is a nicety; boss glow is information. Under load, keep the
    // one that tells you where the thing that kills you is.
    if (def.boss || (elite && !this.heavyEnemy)) {
      g.shadowColor = def.color;
      g.shadowBlur = def.boss ? 30 : 16;
    }

    g.fillStyle = hit ? '#ffffff' : def.color;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 2;
    const sides = def.boss ? 8 : 3 + (e.type % 5);
    g.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = e.ang + (i / sides) * TAU;
      const rr = def.boss && i % 2 ? r * 0.72 : r;
      const px = e.x + Math.cos(a) * rr, py = e.y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill(); g.stroke();
    g.shadowBlur = 0;

    // eye, so you can read which way it is heading
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.beginPath();
    g.arc(e.x + Math.cos(e.ang) * r * 0.42, e.y + Math.sin(e.ang) * r * 0.42, Math.max(2, r * 0.2), 0, TAU);
    g.fill();

    if (e.hpPct < 255) {
      const w = r * 2.2;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(e.x - w / 2, e.y - r - 11, w, 4);
      g.fillStyle = def.boss ? '#ff3b6b' : elite ? '#ffc857' : '#7ee081';
      g.fillRect(e.x - w / 2, e.y - r - 11, w * (e.hpPct / 255), 4);
    }
    if (elite && !def.boss) {
      g.fillStyle = '#ffc857';
      g.font = 'bold 11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('ELITE', e.x, e.y - r - 15);
    }
    if (def.boss) {
      g.fillStyle = '#ff3b6b';
      g.font = 'bold 14px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(def.name.toUpperCase(), e.x, e.y - r - 18);
    }
  }

  drawPlayer(p, info) {
    const g = this.ctx;
    const ch = CHARACTERS[p.char] || CHARACTERS[0];
    const dead = p.flags & 1;
    const hurt = p.flags & 2;
    const inv = p.flags & 4;
    const isMe = p.id === info?.pid;
    const name = info?.roster?.get(p.id)?.name || '';

    if (dead) {
      g.globalAlpha = 0.35;
      g.fillStyle = '#555b6e';
      g.beginPath(); g.arc(p.x, p.y, 12, 0, TAU); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#8b90a0';
      g.font = 'bold 12px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(`${name} (down)`, p.x, p.y - 22);
      return;
    }

    if (isMe) {
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, 22 + Math.sin(this.t * 3) * 1.5, 0, TAU); g.stroke();
    }

    if (inv && !hurt) g.globalAlpha = 0.55 + Math.sin(this.t * 40) * 0.25;

    g.shadowColor = ch.color; g.shadowBlur = 14;
    g.fillStyle = hurt ? '#ffffff' : ch.color;
    g.beginPath(); g.arc(p.x, p.y, 14, 0, TAU); g.fill();
    g.shadowBlur = 0;

    // aim wedge
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(p.x + Math.cos(p.ang) * 20, p.y + Math.sin(p.ang) * 20);
    g.lineTo(p.x + Math.cos(p.ang + 2.5) * 11, p.y + Math.sin(p.ang + 2.5) * 11);
    g.lineTo(p.x + Math.cos(p.ang - 2.5) * 11, p.y + Math.sin(p.ang - 2.5) * 11);
    g.closePath(); g.fill();
    g.globalAlpha = 1;

    // health bar + name
    const w = 40;
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(p.x - w / 2, p.y - 26, w, 5);
    g.fillStyle = p.hp / p.maxHp < 0.3 ? '#ff5c5c' : '#7ee081';
    g.fillRect(p.x - w / 2, p.y - 26, w * Math.max(0, p.hp / p.maxHp), 5);
    if (name) {
      g.fillStyle = isMe ? '#ffffff' : 'rgba(220,225,240,0.75)';
      g.font = `bold ${isMe ? 13 : 12}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText(name, p.x, p.y - 31);
    }
  }

  drawProj(b) {
    const g = this.ctx;
    const kind = PROJ_KINDS[b.type] || 'bullet';
    if (kind === 'swing') {
      const r = b.size;
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(b.x, b.y, r * 0.85, b.ang - 0.35, b.ang + 0.35);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 12;
      g.beginPath();
      g.arc(b.x, b.y, r * 0.7, b.ang - 0.5, b.ang + 0.5);
      g.stroke();
      return;
    }

    const col = PROJ_COLOR[kind] || '#ffe9a8';
    g.save();
    g.translate(b.x, b.y);
    g.rotate(b.ang);
    if (!this.heavyProj) { g.shadowColor = col; g.shadowBlur = 8; }
    g.fillStyle = b.flags & 2 ? '#ffd166' : col;

    switch (kind) {
      case 'laser':
        g.fillRect(-16, -1.6, 32, 3.2);
        break;
      case 'rocket':
        g.fillRect(-9, -4, 18, 8);
        g.fillStyle = 'rgba(255,170,80,0.8)';
        g.fillRect(-16, -2.5, 7, 5);
        break;
      case 'flame':
        g.globalAlpha = 0.75;
        g.beginPath(); g.arc(0, 0, b.size + Math.random() * 3, 0, TAU); g.fill();
        break;
      case 'star':
        g.rotate(this.t * 22);
        for (let i = 0; i < 4; i++) { g.rotate(TAU / 4); g.fillRect(-1.8, -9, 3.6, 18); }
        break;
      case 'orb':
        g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
        break;
      case 'enemy':
        g.fillStyle = '#ff5c7a';
        g.beginPath(); g.arc(0, 0, b.size, 0, TAU); g.fill();
        break;
      case 'pellet':
        g.fillRect(-4, -2, 8, 4);
        break;
      default:
        g.fillRect(-6, -2, 12, 4);
    }
    g.restore();
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  }

  drawParticles() {
    const g = this.ctx;
    for (const p of this.parts) {
      const a = p.life / p.maxLife;
      g.globalAlpha = Math.max(0, Math.min(1, a));
      if (p.kind === 'dot') {
        g.fillStyle = p.col;
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.kind === 'ring') {
        g.strokeStyle = p.col;
        g.lineWidth = 3 * a + 1;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.stroke();
      } else if (p.kind === 'beam') {
        g.strokeStyle = p.col;
        g.lineWidth = 3 + a * 4;
        g.shadowColor = p.col; g.shadowBlur = 12;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x2, p.y2); g.stroke();
        g.shadowBlur = 0;
      }
    }
    g.globalAlpha = 1;
  }

  drawFloats() {
    const g = this.ctx;
    g.textAlign = 'center';
    // strokeText costs about as much as fillText, so the outline is the first
    // thing to go once the screen is already a wall of numbers.
    const outline = this.floats.length <= OUTLINE_LIMIT;
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    let font = '';
    for (const f of this.floats) {
      const a = f.life / f.maxLife;
      g.globalAlpha = Math.max(0, Math.min(1, a * 1.4));
      const want = `bold ${f.size}px system-ui, sans-serif`;
      if (want !== font) { font = want; g.font = want; }
      if (outline) g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.col;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
  }
}

const PROJ_COLOR = {
  bullet: '#ffe9a8', pellet: '#ffb37a', laser: '#66f0ff', rocket: '#ff9f6b',
  flame: '#ff7a45', orb: '#c39bff', star: '#c8e6ff', enemy: '#ff5c7a', spit: '#7ed957',
};

export { TIER_COLOR };
