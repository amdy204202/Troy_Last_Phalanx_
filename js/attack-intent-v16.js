const SOURCE_KINDS = new Set(['melee', 'projectile', 'area', 'boss', 'hazard']);
const DEFENSE_TAGS = new Set(['parryable', 'reflectable', 'dodgeOnly', 'unavoidable']);
const THREATS = new Set(['low', 'high']);
const REQUIRED = ['sourceKind', 'defenseTag', 'origin', 'impactAt', 'threat', 'telegraphId', 'impactId'];

function invalid(message, options) {
  if (options.mode === 'production') return null;
  const location = options.file || options.callsite ? ` at ${options.file ?? 'unknown'}:${options.callsite ?? 'unknown'}` : '';
  throw new TypeError(`${message}${location}`);
}

// @MX:ANCHOR: [AUTO] All V16 player-damage candidates cross this immutable contract.
// @MX:REASON: Combat creation, telegraph rendering, scheduling, replay, and defense resolution share this boundary.
export function createAttackIntent(input, options = { mode: 'development' }) {
  for (const field of REQUIRED) if (input?.[field] === undefined || input?.[field] === null) return invalid(`attack intent missing ${field}`, options);
  if (!SOURCE_KINDS.has(input.sourceKind)) return invalid(`sourceKind is not registered: ${input.sourceKind}`, options);
  if (!DEFENSE_TAGS.has(input.defenseTag)) return invalid(`defenseTag is not registered: ${input.defenseTag}`, options);
  if (!THREATS.has(input.threat)) return invalid(`threat is not registered: ${input.threat}`, options);
  if (!Number.isFinite(input.origin.x) || !Number.isFinite(input.origin.y)) return invalid('origin requires finite x/y', options);
  if (!Number.isInteger(input.impactAt) || input.impactAt < 0) return invalid('impactAt requires a non-negative fixed tick', options);
  const origin = Object.freeze({ x: input.origin.x, y: input.origin.y });
  return Object.freeze({
    sourceKind: input.sourceKind,
    defenseTag: input.defenseTag,
    origin,
    direction: Number.isFinite(input.direction) ? input.direction : 0,
    range: Number.isFinite(input.range) && input.range >= 0 ? input.range : 0,
    radius: Number.isFinite(input.radius) && input.radius >= 0 ? input.radius : 0,
    impactAt: input.impactAt,
    threat: input.threat,
    telegraphId: String(input.telegraphId),
    impactId: String(input.impactId),
    damage: Math.max(0, Number(input.damage) || 0),
  });
}

const SHAPES = Object.freeze({
  parryable: 'forward-wedge', reflectable: 'double-arrow', dodgeOnly: 'split-chevron', unavoidable: 'broken-ring',
});

export function telegraphForIntent(intent) {
  return Object.freeze({
    telegraphId: intent.telegraphId, impactId: intent.impactId, defenseTag: intent.defenseTag,
    origin: intent.origin, direction: intent.direction, range: intent.range, radius: intent.radius,
    impactAt: intent.impactAt, shape: SHAPES[intent.defenseTag],
  });
}

function slotFor(intent) {
  return intent.sourceKind === 'boss' ? 'boss' : 'normal';
}

export class AttackIntentScheduler {
  #records = [];
  #history = [];
  #tick = 0;

  schedule(intent) {
    if (!Object.isFrozen(intent)) throw new TypeError('scheduler requires an immutable attack intent');
    if (this.#records.some(record => record.intent.telegraphId === intent.telegraphId || record.intent.impactId === intent.impactId)) {
      throw new Error(`duplicate intent id: ${intent.telegraphId}/${intent.impactId}`);
    }
    const record = { intent, state: 'scheduled', slot: slotFor(intent), cancelledAt: null };
    this.#records.push(record);
    return intent.telegraphId;
  }

  cancel(telegraphId) {
    const record = this.#records.find(candidate => candidate.intent.telegraphId === telegraphId);
    if (!record || ['impacted', 'cancelled', 'expired'].includes(record.state)) return false;
    record.state = 'cancelled';
    record.cancelledAt = this.#tick;
    return true;
  }

  consume(impactId, tick) {
    if (!Number.isInteger(tick) || tick < this.#tick) throw new RangeError('scheduler tick must be monotonic');
    this.#tick = tick;
    const index = this.#records.findIndex(record => record.intent.impactId === impactId && !['impacted', 'cancelled', 'expired'].includes(record.state));
    if (index < 0) return null;
    const [record] = this.#records.splice(index, 1);
    record.state = 'impacted';
    this.#history.push(record);
    if (this.#history.length > 256) this.#history.splice(0, this.#history.length - 256);
    return record.intent;
  }

  advance(tick) {
    if (!Number.isInteger(tick) || tick < this.#tick) throw new RangeError('scheduler tick must be monotonic');
    this.#tick = tick;
    for (const record of this.#records) {
      if (record.state === 'scheduled' && record.intent.impactAt < tick) record.state = 'expired';
      else if (record.state === 'scheduled') record.state = 'telegraphing';
    }
    for (const slot of ['boss', 'normal']) {
      const committed = this.#records.some(record => record.state === 'committed' && record.slot === slot && record.intent.threat === 'high');
      if (!committed) {
        const candidate = this.#records.find(record => record.state === 'telegraphing' && record.slot === slot && record.intent.threat === 'high');
        if (candidate) candidate.state = 'committed';
      }
    }
    for (const record of this.#records) if (record.state === 'telegraphing' && record.intent.threat === 'low') record.state = 'committed';
    const impacts = [];
    for (const record of this.#records) {
      if (record.state === 'committed' && record.intent.impactAt <= tick) {
        record.state = 'impacted';
        impacts.push(record.intent);
      }
    }
    const terminal = this.#records.filter(record => ['impacted', 'cancelled', 'expired'].includes(record.state));
    this.#history.push(...terminal);
    if (this.#history.length > 256) this.#history.splice(0, this.#history.length - 256);
    this.#records = this.#records.filter(record => !['impacted', 'cancelled', 'expired'].includes(record.state));
    return impacts;
  }

  snapshot() {
    return [...this.#records, ...this.#history].map(record => ({
      telegraphId: record.intent.telegraphId, impactId: record.intent.impactId,
      state: record.state, slot: record.slot, impactAt: record.intent.impactAt,
    }));
  }

  activeSnapshot() {
    return this.#records.map(record => ({
      telegraphId: record.intent.telegraphId, impactId: record.intent.impactId,
      state: record.state, slot: record.slot, impactAt: record.intent.impactAt,
    }));
  }
}
