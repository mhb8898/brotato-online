// ---------------------------------------------------------------------------
// Binary wire format for the high-frequency channel.
//
// Snapshots go out ~20x/second to every peer. JSON would cost roughly 6-8 KB
// per snapshot with 80 enemies on screen; this packs the same state into
// ~1.2 KB by writing fixed-width fields into an ArrayBuffer. Positions are
// int16 because the arena is 1600x900, angles are one byte (256 steps is far
// below what the eye resolves at these sizes).
//
// Low-frequency control messages (shop, level-ups, lobby) travel as JSON on a
// separate *reliable* channel - they are rare and must never be dropped.
// ---------------------------------------------------------------------------

export const MSG = { SNAPSHOT: 1, INPUT: 2 };

const SNAP_MAX = 64 * 1024;

// Reusable scratch buffer: allocating 20 ArrayBuffers/second per peer would
// keep the GC busy for no reason.
const scratch = new ArrayBuffer(SNAP_MAX);
const scratchView = new DataView(scratch);

class Writer {
  constructor(view) { this.v = view; this.o = 0; }
  u8(x)  { this.v.setUint8(this.o, x & 255); this.o += 1; }
  u16(x) { this.v.setUint16(this.o, x & 65535); this.o += 2; }
  u32(x) { this.v.setUint32(this.o, x >>> 0); this.o += 4; }
  i16(x) { this.v.setInt16(this.o, Math.max(-32768, Math.min(32767, x | 0))); this.o += 2; }
  i8(x)  { this.v.setInt8(this.o, Math.max(-128, Math.min(127, x | 0))); this.o += 1; }
  ang(a) { this.u8(Math.round(((a % TAU) + TAU) % TAU / TAU * 255)); }
}

class Reader {
  constructor(view) { this.v = view; this.o = 0; }
  u8()  { const x = this.v.getUint8(this.o); this.o += 1; return x; }
  u16() { const x = this.v.getUint16(this.o); this.o += 2; return x; }
  u32() { const x = this.v.getUint32(this.o); this.o += 4; return x; }
  i16() { const x = this.v.getInt16(this.o); this.o += 2; return x; }
  i8()  { const x = this.v.getInt8(this.o); this.o += 1; return x; }
  ang() { return this.u8() / 255 * TAU; }
  get done() { return this.o >= this.v.byteLength; }
}

const TAU = Math.PI * 2;

/**
 * Pack a world snapshot. Returns a *copy* sized to the payload, because the
 * DataChannel send is async and would otherwise race the next frame's write.
 */
export function encodeSnapshot(snap) {
  const w = new Writer(scratchView);
  w.u8(MSG.SNAPSHOT);
  w.u32(snap.tick);
  w.u8(snap.phase);           // 0 lobby, 1 wave, 2 shop, 3 over
  w.u8(snap.wave);
  w.u16(Math.max(0, Math.round(snap.timeLeft * 10)));  // deciseconds

  w.u8(snap.players.length);
  for (const p of snap.players) {
    w.u8(p.id);
    w.i16(p.x); w.i16(p.y);
    w.ang(p.ang);
    w.u16(Math.max(0, Math.ceil(p.hp)));
    w.u16(Math.max(1, Math.ceil(p.maxHp)));
    w.u8(p.flags);            // 1 dead, 2 hurt-flash, 4 invulnerable
    w.u8(p.char);
    w.u32(p.ack);             // last input sequence the host consumed
  }

  w.u16(snap.enemies.length);
  for (const e of snap.enemies) {
    w.u16(e.id);
    w.u8(e.type);
    w.i16(e.x); w.i16(e.y);
    w.ang(e.ang);
    w.u8(e.hpPct);            // 0..255
    w.u8(e.flags);            // 1 elite, 2 hit-flash, 4 winding up
  }

  w.u16(snap.projs.length);
  for (const b of snap.projs) {
    w.u16(b.id);
    w.u8(b.type);             // index into PROJ_KINDS
    w.i16(b.x); w.i16(b.y);
    w.ang(b.ang);
    w.u8(b.flags);            // 1 hostile, 2 crit
    w.u8(b.size);
  }

  w.u16(snap.pickups.length);
  for (const p of snap.pickups) {
    w.u16(p.id);
    w.u8(p.type);             // 0 material, 1 health, 2 crate
    w.i16(p.x); w.i16(p.y);
  }

  w.u16(snap.fx.length);
  for (const f of snap.fx) {
    w.u8(f.t);
    w.i16(f.x); w.i16(f.y);
    w.i16(f.x2 || 0); w.i16(f.y2 || 0);
    w.u8(f.a || 0);
  }

  return new Uint8Array(scratch.slice(0, w.o));
}

export function decodeSnapshot(view) {
  const r = new Reader(view);
  r.u8(); // message type, already dispatched on
  const snap = {
    tick: r.u32(), phase: r.u8(), wave: r.u8(), timeLeft: r.u16() / 10,
    players: [], enemies: [], projs: [], pickups: [], fx: [],
  };

  let n = r.u8();
  for (let i = 0; i < n; i++) {
    snap.players.push({
      id: r.u8(), x: r.i16(), y: r.i16(), ang: r.ang(),
      hp: r.u16(), maxHp: r.u16(), flags: r.u8(), char: r.u8(), ack: r.u32(),
    });
  }

  n = r.u16();
  for (let i = 0; i < n; i++) {
    snap.enemies.push({
      id: r.u16(), type: r.u8(), x: r.i16(), y: r.i16(),
      ang: r.ang(), hpPct: r.u8(), flags: r.u8(),
    });
  }

  n = r.u16();
  for (let i = 0; i < n; i++) {
    snap.projs.push({
      id: r.u16(), type: r.u8(), x: r.i16(), y: r.i16(),
      ang: r.ang(), flags: r.u8(), size: r.u8(),
    });
  }

  n = r.u16();
  for (let i = 0; i < n; i++) {
    snap.pickups.push({ id: r.u16(), type: r.u8(), x: r.i16(), y: r.i16() });
  }

  n = r.u16();
  for (let i = 0; i < n; i++) {
    snap.fx.push({ t: r.u8(), x: r.i16(), y: r.i16(), x2: r.i16(), y2: r.i16(), a: r.u8() });
  }

  return snap;
}

// Input packet: 8 bytes. Sent 30x/second, so it stays tiny.
const inputBuf = new ArrayBuffer(8);
const inputView = new DataView(inputBuf);

export function encodeInput(inp) {
  const w = new Writer(inputView);
  w.u8(MSG.INPUT);
  w.u32(inp.seq);
  w.i8(Math.round(inp.mx * 100));
  w.i8(Math.round(inp.my * 100));
  w.ang(inp.aim);
  return new Uint8Array(inputBuf.slice(0, 8));
}

export function decodeInput(view) {
  const r = new Reader(view);
  r.u8();
  return { seq: r.u32(), mx: r.i8() / 100, my: r.i8() / 100, aim: r.ang() };
}

/** PeerJS hands us ArrayBuffer, Uint8Array or Blob depending on the path. */
export function asView(data) {
  if (data instanceof ArrayBuffer) return new DataView(data);
  if (ArrayBuffer.isView(data)) return new DataView(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

// Visual effect ids, shared by world.js (producer) and render.js (consumer).
export const FX = {
  HIT: 0, EXPLODE: 1, BEAM: 2, LEVELUP: 3, PICKUP: 4,
  DEATH: 5, HEAL: 6, DODGE: 7, DAMAGE: 8, SWING: 9,
};

// Projectile visual kinds.
export const PROJ_KINDS = [
  'bullet', 'pellet', 'laser', 'rocket', 'flame', 'orb', 'star', 'enemy', 'spit', 'swing',
];
