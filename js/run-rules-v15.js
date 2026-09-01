export const DAILY_RULES = Object.freeze({
  enemyVitality: Object.freeze({ id: 'enemyVitality', name: '붉은 달', description: '적 최대 체력 +15%', target: 'enemyHp', multiplier: 1.15 }),
  hostileVelocity: Object.freeze({ id: 'hostileVelocity', name: '폭풍의 날', description: '적대 투사체 속도 +20%', target: 'hostileProjectileSpeed', multiplier: 1.2 }),
  elitePressure: Object.freeze({ id: 'elitePressure', name: '황금 징조', description: '정예 출현 가중치 +50%', target: 'eliteWeight', multiplier: 1.5 }),
});

const finiteNonNegative = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallback;

const threatProfiles = new Map();
const calmThreatProfile = Object.freeze({ tier: 0, hp: 1, damage: 1, speed: 1, cadence: 1, spawnRate: 1, eliteChance: .02, dangerousWeight: 1 });

export function lateThreatProfile(seconds) {
  const elapsed = finiteNonNegative(seconds);
  if (elapsed < 300) return calmThreatProfile;
  const tier = Math.floor((elapsed - 300) / 60) + 1;
  if (threatProfiles.has(tier)) return threatProfiles.get(tier);
  const profile = Object.freeze({
    tier,
    hp: Number((1 + tier * .22).toFixed(3)),
    damage: Number((1 + tier * .11).toFixed(3)),
    speed: Number((1 + Math.min(tier * .025, .18)).toFixed(3)),
    cadence: Number((1 + Math.min(tier * .04, .32)).toFixed(3)),
    spawnRate: Number((1 + Math.min(tier * .035, .25)).toFixed(3)),
    eliteChance: Number(Math.min(.04 + tier * .025, .2).toFixed(3)),
    dangerousWeight: Number((1 + Math.min(tier * .18, 1.2)).toFixed(3)),
  });
  threatProfiles.set(tier, profile);
  return profile;
}

export function shouldTriggerGorgon({ kills, relicLevel }) {
  const count = Math.floor(finiteNonNegative(kills));
  return finiteNonNegative(relicLevel) > 0 && count > 0 && count % 400 === 0;
}

export function canGorgonPetrify(target) {
  return !!target && !target.dead && !target.boss;
}

export function createFixedStepAccumulator({ stepSeconds = 1 / 60, maxFrameSeconds = .25, onStep } = {}) {
  const step = Number(stepSeconds);
  const frameCap = Number(maxFrameSeconds);
  if (!(step > 0) || !(frameCap >= step) || typeof onStep !== 'function') throw new TypeError('invalid fixed-step configuration');
  const epsilon = step * 1e-7;
  const maxSteps = Math.ceil(frameCap / step);
  let accumulator = 0;
  let tickCount = 0;
  return Object.freeze({
    advance(frameSeconds) {
      accumulator += Math.min(frameCap, finiteNonNegative(frameSeconds));
      let steps = 0;
      while (accumulator + epsilon >= step && steps < maxSteps) {
        tickCount += 1;
        onStep(step, tickCount);
        accumulator -= step;
        if (Math.abs(accumulator) < epsilon) accumulator = 0;
        steps += 1;
      }
      if (steps === maxSteps && accumulator + epsilon >= step) accumulator %= step;
      return steps;
    },
    reset() { accumulator = 0; tickCount = 0; },
    alpha() { return Number((accumulator / step).toFixed(12)); },
    ticks() { return tickCount; },
  });
}

const cloneEventValue = value => {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneEventValue);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneEventValue(item)]));
};

export function createEventJournal(kinds = ['spawn', 'reward', 'crit', 'ai'], maxEvents = 4096) {
  const allowed = new Set(kinds.map(kind => String(kind).toLowerCase()));
  const counters = Object.fromEntries([...allowed].map(kind => [kind, 0]));
  const log = [];
  return Object.freeze({
    record(kind, value) {
      const normalized = String(kind).toLowerCase();
      if (!allowed.has(normalized)) throw new TypeError(`unknown event kind: ${kind}`);
      counters[normalized] += 1;
      const event = Object.freeze({ kind: normalized, id: `${normalized}-${String(counters[normalized]).padStart(4, '0')}`, value: cloneEventValue(value) });
      log.push(event);
      if (log.length > maxEvents) log.splice(0, Math.max(1, Math.floor(maxEvents / 4)));
      return event;
    },
    events(kind = null) { return log.filter(event => kind == null || event.kind === String(kind).toLowerCase()).map(event => ({ ...event, value: cloneEventValue(event.value) })); },
    counts() { return { ...counters }; },
    clear() { log.length = 0; for (const kind of allowed) counters[kind] = 0; },
  });
}

export function advanceRunClocks(clocks, { mode, bossAlive, dt }) {
  const next = {
    missionTime: finiteNonNegative(clocks?.missionTime),
    combatTime: finiteNonNegative(clocks?.combatTime),
    bossCombatTime: finiteNonNegative(clocks?.bossCombatTime),
  };
  const elapsed = finiteNonNegative(dt);
  if (mode !== 'play' || elapsed === 0) return next;
  next.combatTime += elapsed;
  if (bossAlive) next.bossCombatTime += elapsed;
  else next.missionTime += elapsed;
  return next;
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

let fallbackRunCounter = 0;
const issuedRunSeeds = new Set();

export function createRunSeed({ cryptoSource = globalThis.crypto, now = Date.now(), monotonic = globalThis.performance?.now?.() ?? 0 } = {}) {
  if (typeof cryptoSource?.getRandomValues === 'function') {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const words = cryptoSource.getRandomValues(new Uint32Array(2));
        const seed = `run-${[words[0], words[1]].map(word => Number(word >>> 0).toString(16).padStart(8, '0')).join('')}`;
        if (!issuedRunSeeds.has(seed)) { issuedRunSeeds.add(seed); return seed; }
      } catch { break; }
    }
  }
  fallbackRunCounter += 1;
  const material = `${Number(now) || 0}:${Number(monotonic) || 0}:${fallbackRunCounter}`;
  const seed = `run-${hashString(material).toString(16).padStart(8, '0')}${hashString(`${material}:fallback`).toString(16).padStart(8, '0')}`;
  issuedRunSeeds.add(seed);
  return seed;
}

export function createDailySeed({ utcDate, hero, difficulty, curses = [] }) {
  const date = String(utcDate || '').slice(0, 10);
  const normalizedCurses = [...new Set(Array.isArray(curses) ? curses.map(String) : [])].sort();
  return hashString([date, hero || 'hoplite', difficulty || 'bronze', normalizedCurses.join(',')].join('|'));
}

export function createSeededRng(seed) {
  let state = hashString(seed) || 0x6d2b79f5;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  random.state = () => state >>> 0;
  return random;
}

export function applyDailyRule(ruleId, target, value) {
  const rule = DAILY_RULES[ruleId];
  return rule?.target === target ? value * rule.multiplier : value;
}

export function transactPurchase(state, choice, requestId) {
  const current = state && typeof state === 'object' ? state : {};
  const id = String(requestId || '');
  if (!id || current.purchases?.[id]) return { ok: false, reason: 'duplicate', state: current };
  const price = finiteNonNegative(choice?.price, NaN);
  const stat = choice?.effect?.stat;
  const amount = Number(choice?.effect?.amount);
  if (!choice?.id || !Number.isFinite(price) || price <= 0 || !stat || !Number.isFinite(amount)) return { ok: false, reason: 'invalid', state: current };
  if (finiteNonNegative(current.drachma) < price) return { ok: false, reason: 'insufficient', state: current };
  return {
    ok: true,
    reason: null,
    state: {
      ...current,
      drachma: finiteNonNegative(current.drachma) - price,
      purchases: { ...(current.purchases || {}), [id]: choice.id },
      stats: { ...(current.stats || {}), [stat]: Number(current.stats?.[stat] || 0) + amount },
    },
  };
}

export function settleVictoryOnce(state, { reward }) {
  const current = state && typeof state === 'object' ? state : {};
  if (current.victorySettled) return { settled: false, state: current };
  const payout = Math.floor(finiteNonNegative(reward));
  return {
    settled: true,
    state: {
      ...current,
      victorySettled: true,
      victoryReward: payout,
      victories: Math.floor(finiteNonNegative(current.victories)) + 1,
      laurels: Math.floor(finiteNonNegative(current.laurels)) + payout,
    },
  };
}

export function normalizeV15Meta(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    ...source,
    schemaVersion: 15,
    hero: ['hoplite', 'swordsman', 'archer'].includes(source.hero) ? source.hero : 'hoplite',
    laurels: Math.floor(finiteNonNegative(source.laurels)),
    achievements: source.achievements && typeof source.achievements === 'object' && !Array.isArray(source.achievements) ? { ...source.achievements } : {},
    dailyScores: source.dailyScores && typeof source.dailyScores === 'object' && !Array.isArray(source.dailyScores) ? { ...source.dailyScores } : {},
    lastVictory: source.lastVictory && typeof source.lastVictory === 'object' ? { ...source.lastVictory } : null,
    lastRunSeed: typeof source.lastRunSeed === 'string' || Number.isFinite(source.lastRunSeed) ? source.lastRunSeed : null,
    runTimes: {
      missionTime: finiteNonNegative(source.runTimes?.missionTime),
      combatTime: finiteNonNegative(source.runTimes?.combatTime),
      bossCombatTime: finiteNonNegative(source.runTimes?.bossCombatTime),
    },
  };
}

export function scoreDailyRun({ combatTime, kills, bossKills }) {
  return Math.floor(finiteNonNegative(combatTime)) + Math.floor(finiteNonNegative(kills)) * 10 + Math.floor(finiteNonNegative(bossKills)) * 500;
}
