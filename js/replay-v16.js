export const ACTIONS = Object.freeze({ MOVE: 'MOVE', DEFENSE_PARRY: 'DEFENSE_PARRY', DEFENSE_DODGE: 'DEFENSE_DODGE' });
const ACTION_VALUES = new Set(Object.values(ACTIONS));
const MASK_64 = (1n << 64n) - 1n;

function normalize(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(6)) : null;
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

function rotateRight(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

// Small self-contained SHA-256 keeps reducers independent from platform random/time APIs.
function sha256Hex(text) {
  const bytes = [...new TextEncoder().encode(text)];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 255);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 255);
  const constants = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Uint32Array(64);
    for (let index = 0; index < 16; index += 1) {
      const at = offset + index * 4;
      words[index] = ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15], y = words[index - 2];
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choose + constants[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    [a,b,c,d,e,f,g,h].forEach((value,index) => { hash[index] = (hash[index] + value) >>> 0; });
  }
  return hash.map(value => value.toString(16).padStart(8, '0')).join('');
}

// @MX:ANCHOR: [AUTO] Campaign, combat, shop, boss and visual streams derive from this stable root material.
// @MX:REASON: Replay fidelity and subsystem RNG isolation depend on an identical cross-platform seed contract.
export function createRootSeed(material) {
  const curses = [...(material.curses ?? [])].sort().join(',');
  const text = [material.schema, material.mode, material.utcDate, material.hero, material.difficulty, curses, material.inputSeed].join('|');
  return sha256Hex(text).slice(0, 16);
}

export function deriveSeedStreams(rootSeed) {
  return Object.freeze(Object.fromEntries(['gameplay', 'shop', 'boss', 'visual'].map(label => [label, sha256Hex(`${rootSeed}|${label}`).slice(0, 16)])));
}

export function recordTapeAction(tape, tick, action, payload = {}) {
  if (!Number.isInteger(tick) || tick < 0 || (tape.length && tick < tape.at(-1).tick)) throw new RangeError('tape tick must be a non-negative monotonic integer');
  if (!ACTION_VALUES.has(action)) throw new RangeError(`unknown action: ${action}`);
  return Object.freeze([...tape, Object.freeze({ tick, action, payload: Object.freeze(normalize(payload)) })]);
}

export function serializeTape(tape) {
  return tape.map(entry => canonicalJson(entry)).join('\n');
}

export function parseTape(text) {
  let tape = [];
  if (!text.trim()) return tape;
  for (const line of text.trim().split(/\r?\n/)) {
    const entry = JSON.parse(line);
    tape = recordTapeAction(tape, entry.tick, entry.action, entry.payload);
  }
  return tape;
}

function nextSeed(seed) {
  let value = (seed + 0x9e3779b97f4a7c15n) & MASK_64;
  value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
  value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
  return (value ^ (value >> 31n)) & MASK_64;
}

export function runCombatReplay({ rootSeed, tape }) {
  let seed = BigInt(`0x${deriveSeedStreams(rootSeed).gameplay}`);
  return tape.map(entry => {
    seed = nextSeed(seed ^ BigInt(entry.tick));
    return Object.freeze({ tick: entry.tick, action: entry.action, payload: entry.payload, roll: Number(seed & 0xffffn) });
  });
}
