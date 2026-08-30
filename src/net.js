// ---------------------------------------------------------------------------
// WebRTC transport.
//
// Topology is a star: the host is the authority and every client holds exactly
// one connection, to the host. That is O(n) connections instead of the O(n^2)
// a full mesh would need, and it is the only topology where "who decides what
// actually happened" has a single answer.
//
// Each peer pair opens TWO data channels, because the two kinds of traffic want
// opposite guarantees:
//
//   's' (state)   unordered, 0 retransmits  - snapshots and inputs. A late
//                 snapshot is worse than no snapshot; head-of-line blocking on
//                 a reliable channel would stall every later packet behind one
//                 lost frame. Losing one is invisible: another arrives in 33ms.
//
//   'c' (control) ordered + reliable, JSON  - shop, level-ups, wave changes.
//                 Rare, and losing one desynchronises the game permanently.
//
// PeerJS supplies the signalling (SDP/ICE exchange) over its public broker.
// After the handshake nothing but game traffic flows, and it flows peer-to-peer.
// ---------------------------------------------------------------------------

import { PEER_SERVER, ICE_SERVERS } from './config.js';
import { SIGNAL_PREFIX, PROTO_VERSION } from './data.js';

const peerOpts = () => ({
  debug: 1,
  config: { iceServers: ICE_SERVERS, sdpSemantics: 'unified-plan' },
  ...(PEER_SERVER || {}),
});

export function makeRoomCode() {
  // Ambiguity-free alphabet: no O/0, no I/1 - people read these aloud.
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[(Math.random() * A.length) | 0];
  return s;
}

const STATE_OPTS = { label: 's', reliable: false, serialization: 'binary' };
const CTRL_OPTS = { label: 'c', reliable: true, serialization: 'json' };

// ===========================================================================
// Host
// ===========================================================================
export class Host {
  /**
   * @param code  room code players type in
   * @param cb    { onJoin(pid,name), onLeave(pid), onControl(pid,msg),
   *                onInput(pid,bytes), onStatus(text,kind) }
   */
  constructor(code, cb) {
    this.code = code;
    this.cb = cb;
    this.peer = null;
    this.peers = new Map();      // peerId -> { pid, name, ctrl, state, alive }
    this.nextPid = 2;            // host is always pid 1
    this.open = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line no-undef
      this.peer = new Peer(SIGNAL_PREFIX + this.code, peerOpts());
      const timer = setTimeout(() => reject(new Error('Signalling server timed out')), 20000);

      this.peer.on('open', () => { clearTimeout(timer); this.open = true; resolve(this.code); });
      this.peer.on('error', (err) => {
        clearTimeout(timer);
        if (err.type === 'unavailable-id') reject(new Error('That room code is already in use'));
        else if (!this.open) reject(err);
        else this.cb.onStatus?.(`Network: ${err.type}`, 'warn');
      });
      this.peer.on('connection', (conn) => this._accept(conn));
      this.peer.on('disconnected', () => {
        this.cb.onStatus?.('Lost signalling server - reconnecting', 'warn');
        try { this.peer.reconnect(); } catch { /* already gone */ }
      });
    });
  }

  _accept(conn) {
    let rec = this.peers.get(conn.peer);
    if (!rec) {
      rec = { pid: 0, name: null, ctrl: null, state: null, joined: false };
      this.peers.set(conn.peer, rec);
    }
    if (conn.label === 'c') {
      rec.ctrl = conn;
      conn.on('data', (d) => this._onCtrl(conn.peer, d));
      conn.on('close', () => this._drop(conn.peer));
      conn.on('error', () => this._drop(conn.peer));
    } else {
      rec.state = conn;
      conn.on('data', (d) => {
        const r = this.peers.get(conn.peer);
        if (r && r.joined) this.cb.onInput?.(r.pid, d);
      });
    }
  }

  _onCtrl(peerId, msg) {
    const rec = this.peers.get(peerId);
    if (!rec) return;
    if (msg && msg.t === 'hello') {
      if (msg.ver !== PROTO_VERSION) {
        rec.ctrl?.send({ t: 'reject', reason: 'Version mismatch - both sides need to reload the page (hard refresh).' });
        setTimeout(() => this._drop(peerId), 400);
        return;
      }
      if (this.peers.size > 8) {
        rec.ctrl?.send({ t: 'reject', reason: 'Room is full (8 players max).' });
        setTimeout(() => this._drop(peerId), 400);
        return;
      }
      rec.pid = this.nextPid++;
      rec.name = String(msg.name || 'Player').slice(0, 14);
      rec.joined = true;
      rec.ctrl.send({ t: 'welcome', pid: rec.pid, code: this.code });
      this.cb.onJoin?.(rec.pid, rec.name);
      return;
    }
    if (rec.joined) this.cb.onControl?.(rec.pid, msg);
  }

  _drop(peerId) {
    const rec = this.peers.get(peerId);
    if (!rec) return;
    this.peers.delete(peerId);
    try { rec.ctrl?.close(); rec.state?.close(); } catch { /* noop */ }
    if (rec.joined) this.cb.onLeave?.(rec.pid);
  }

  sendControl(pid, msg) {
    for (const rec of this.peers.values()) {
      if (!rec.joined) continue;
      if (pid !== null && rec.pid !== pid) continue;
      if (rec.ctrl?.open) { try { rec.ctrl.send(msg); } catch { /* dropped */ } }
    }
  }

  broadcastState(bytes) {
    for (const rec of this.peers.values()) {
      if (rec.joined && rec.state?.open) {
        try { rec.state.send(bytes); } catch { /* unreliable, fine */ }
      }
    }
  }

  close() {
    for (const id of [...this.peers.keys()]) this._drop(id);
    try { this.peer?.destroy(); } catch { /* noop */ }
  }
}

// ===========================================================================
// Client
// ===========================================================================
export class Client {
  /** @param cb { onControl(msg), onState(bytes), onStatus(text,kind), onClose() } */
  constructor(code, name, cb) {
    this.code = code.toUpperCase().trim();
    this.name = name;
    this.cb = cb;
    this.peer = null;
    this.ctrl = null;
    this.state = null;
    this.pid = 0;
  }

  start() {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line no-undef
      this.peer = new Peer(null, peerOpts());
      const fail = (m) => { try { this.peer.destroy(); } catch { /* noop */ } reject(new Error(m)); };
      const timer = setTimeout(() => fail('Could not reach the host. Check the room code, or the host may be offline.'), 25000);
      let settled = false;

      this.peer.on('error', (err) => {
        if (settled) { this.cb.onStatus?.(`Network: ${err.type}`, 'warn'); return; }
        clearTimeout(timer);
        if (err.type === 'peer-unavailable') fail('No room with that code is open right now.');
        else fail(err.message || err.type);
      });

      this.peer.on('open', () => {
        const host = SIGNAL_PREFIX + this.code;
        this.ctrl = this.peer.connect(host, CTRL_OPTS);
        this.state = this.peer.connect(host, STATE_OPTS);

        this.ctrl.on('open', () => {
          this.ctrl.send({ t: 'hello', name: this.name, ver: PROTO_VERSION });
        });
        this.ctrl.on('data', (msg) => {
          if (msg && msg.t === 'welcome') {
            settled = true;
            clearTimeout(timer);
            this.pid = msg.pid;
            resolve(msg);
            return;
          }
          if (msg && msg.t === 'reject') {
            clearTimeout(timer);
            if (!settled) fail(msg.reason);
            else this.cb.onStatus?.(msg.reason, 'warn');
            return;
          }
          this.cb.onControl?.(msg);
        });
        this.ctrl.on('close', () => { if (settled) this.cb.onClose?.(); });
        this.ctrl.on('error', () => { if (!settled) fail('Connection to host failed.'); });

        this.state.on('data', (d) => this.cb.onState?.(d));
      });
    });
  }

  sendControl(msg) {
    if (this.ctrl?.open) { try { this.ctrl.send(msg); } catch { /* noop */ } }
  }

  sendState(bytes) {
    if (this.state?.open) { try { this.state.send(bytes); } catch { /* noop */ } }
  }

  close() {
    try { this.peer?.destroy(); } catch { /* noop */ }
  }
}
