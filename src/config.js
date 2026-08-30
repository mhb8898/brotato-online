// ---------------------------------------------------------------------------
// Deployment knobs. Edit this file, not the engine, when self-hosting.
// ---------------------------------------------------------------------------

// PeerJS signalling. `null` = PeerJS's free public cloud broker, which needs no
// server of your own and is what makes a pure GitHub Pages deploy possible.
// To run your own: `npx peerjs --port 9000 --key peerjs --path /myapp` and set
//   export const PEER_SERVER = { host: 'you.example.com', port: 443, path: '/myapp', secure: true };
export const PEER_SERVER = null;

// STUN lets peers discover their public address. These are free and public.
// Roughly 10-15% of connections (symmetric NAT, strict corporate firewalls)
// additionally need a TURN relay - add credentials below if you hit that.
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  // { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' },
];

export const SNAPSHOT_HZ = 30;   // host -> clients
export const INPUT_HZ = 30;      // clients -> host
export const INTERP_MS = 90;     // render this far in the past to hide jitter
