// ---------------------------------------------------------------------------
// Connectivity self-test.
//
// "Multiplayer doesn't work" has three completely different causes with the
// same symptom, and no amount of staring at the game tells you which one you
// have. So ask the network directly: gather ICE candidates and see which kinds
// come back.
//
//   host  only          - nothing outbound is working at all.
//   host + srflx        - STUN works. You can reach most people directly, but
//                         not behind symmetric NAT or a strict firewall.
//   host + srflx + relay- a TURN relay answered. You can reach anyone.
//
// Both players should run this. One of you having no relay is enough to break
// the pair, which is why the result names who needs to fix what.
// ---------------------------------------------------------------------------

import { ICE_SERVERS, TURN_SERVERS } from './config.js';

const GATHER_MS = 9000;

export async function checkConnectivity() {
  if (typeof RTCPeerConnection === 'undefined') {
    return { verdict: 'bad', headline: 'This browser has no WebRTC at all.', lines: [] };
  }

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const types = new Set();
  const errors = new Set();

  pc.onicecandidate = (e) => {
    if (!e.candidate) return;
    const m = / typ (\w+)/.exec(e.candidate.candidate);
    if (m) types.add(m[1]);
  };
  // Chrome reports per-server failures here; Firefox mostly stays silent, so
  // this enriches the message where it can and is never load-bearing.
  pc.onicecandidateerror = (e) => {
    const where = (e.url || '').split('?')[0];
    if (/^turns?:/.test(where)) errors.add(`${where}: ${e.errorText || e.errorCode}`);
  };

  try {
    pc.createDataChannel('probe');
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((done) => {
      const t = setTimeout(done, GATHER_MS);
      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') { clearTimeout(t); done(); }
      };
    });
  } finally {
    pc.close();
  }

  const srflx = types.has('srflx');
  const relay = types.has('relay');
  const turnConfigured = TURN_SERVERS.length > 0;
  const lines = [
    `Your network: ${srflx ? 'reachable (STUN answered)' : 'STUN did not answer'}`,
    `Relay (TURN): ${relay ? 'working' : turnConfigured ? 'configured but NOT working' : 'none configured'}`,
  ];
  // Only surface per-server errors when they explain a failure. A working
  // relay still logs one: the IPv6 half of a dual-stack lookup fails while
  // IPv4 succeeds, and showing that under a green verdict just scares people.
  if (!relay && errors.size) lines.push(...[...errors].slice(0, 3));

  if (relay) {
    return { verdict: 'ok', headline: 'You can connect to anyone.', lines };
  }
  if (srflx && !turnConfigured) {
    return {
      verdict: 'warn',
      headline: 'Direct play works with most people - but not all.',
      lines: [...lines,
        'If a specific friend cannot connect, one of you is behind strict NAT',
        'or a firewall. Add TURN credentials in src/config.js to cover that.'],
    };
  }
  if (srflx && turnConfigured) {
    return {
      verdict: 'bad',
      headline: 'Your TURN credentials are not working.',
      lines: [...lines, 'Check the username/credential in src/config.js.'],
    };
  }
  return {
    verdict: 'bad',
    headline: 'Nothing outbound is getting through.',
    lines: [...lines, 'A firewall, VPN or extension is blocking WebRTC entirely.'],
  };
}
