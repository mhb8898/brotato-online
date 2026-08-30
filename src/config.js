// ---------------------------------------------------------------------------
// Deployment knobs. Edit this file, not the engine, when self-hosting.
// ---------------------------------------------------------------------------

// PeerJS signalling. `null` = PeerJS's free public cloud broker, which needs no
// server of your own and is what makes a pure GitHub Pages deploy possible.
// To run your own: `npx peerjs --port 9000 --key peerjs --path /myapp` and set
//   export const PEER_SERVER = { host: 'you.example.com', port: 443, path: '/myapp', secure: true };
export const PEER_SERVER = null;

// STUN lets peers discover their public address; that is enough for most home
// networks. It is NOT enough for symmetric NAT (common on mobile data and some
// ISP routers) or for corporate/school firewalls - those pairs can find each
// other and still never open a channel. That failure is now reported as such
// instead of a generic timeout, and the fix is always the same: a TURN relay,
// which forwards the traffic instead of connecting the two peers directly.
//
// >>> PASTE YOUR TURN CREDENTIALS INTO TURN_SERVERS BELOW <<<
//
// There is no longer a working no-signup public TURN relay. The one everybody
// links to (openrelay.metered.ca with openrelayproject/openrelayproject) now
// answers an allocate request with "400" - the server is up, the credentials
// are dead. Listing a dead relay is worse than listing none, because ICE waits
// on it before giving up, so this array ships empty.
//
// Getting real credentials takes about two minutes and costs nothing:
//
//   metered.ca  -> free account, ~50 GB/month, hands you a ready-made array
//                  in exactly this shape. Easiest option.
//   Cloudflare  -> free TURN on any account (Realtime / TURN service).
//   your own    -> `apt install coturn`, then:
//                  { urls: 'turn:you.example.com:3478',
//                    username: 'user', credential: 'pass' }
//
// List several transports when your provider offers them - they fail in
// different places. UDP/80 is fastest, TCP/443 survives UDP-blocking
// firewalls, and TLS/443 looks like plain HTTPS to the strictest ones. ICE
// races all of them and keeps whichever wins, so extra entries cost nothing.
//
// "Test my connection" on the main menu tells you whether this is working,
// and whether you even need it.
// ExpressTURN free tier. Verified working: an Allocate with these credentials
// returns a relay address on 3478 over both UDP and TCP.
//
// Note that 3478 is ALL this server offers - ports 80, 443 and 5349 do not
// answer, so there is no TLS-on-443 entry to hide behind. Home networks and
// mobile data are fine; a corporate or school firewall that only permits
// 80/443 will still block the relay, and "Test my connection" will say so.
export const TURN_SERVERS = [
  { urls: 'turn:free.expressturn.com:3478?transport=udp', username: '000000002103478469', credential: 'sP6MJOqN9sJyhoACLJX98Mwg9R4=' },
  { urls: 'turn:free.expressturn.com:3478?transport=tcp', username: '000000002103478469', credential: 'sP6MJOqN9sJyhoACLJX98Mwg9R4=' },
];

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  ...TURN_SERVERS,
];

export const SNAPSHOT_HZ = 30;   // host -> clients
export const INPUT_HZ = 30;      // clients -> host
export const INTERP_MS = 90;     // render this far in the past to hide jitter
