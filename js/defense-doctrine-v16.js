const TICK_MS = 1000 / 60;

export const HERO_DOCTRINES = Object.freeze({
  hoplite: Object.freeze({
    parry: Object.freeze({ startupMs: 90, activeMs: 220, recoveryMs: 300, coneDeg: 150, counter: 1, successStunRadius: 180, successStunMs: 450 }),
    dodge: Object.freeze({ startupMs: 70, activeMs: 240, recoveryMs: 300, distance: 150, recoveryReductionMs: 0, attackSpeedMultiplier: 1, attackSpeedMs: 0 }),
  }),
  swordsman: Object.freeze({
    parry: Object.freeze({ startupMs: 70, activeMs: 140, recoveryMs: 220, coneDeg: 80, counter: 1.8, successStunRadius: 0, successStunMs: 120 }),
    dodge: Object.freeze({ startupMs: 50, activeMs: 180, recoveryMs: 220, distance: 120, recoveryReductionMs: 40, attackSpeedMultiplier: 1, attackSpeedMs: 0 }),
  }),
  archer: Object.freeze({
    parry: Object.freeze({ startupMs: 85, activeMs: 170, recoveryMs: 250, coneDeg: 110, counter: .75, successStunRadius: 0, successStunMs: 0 }),
    dodge: Object.freeze({ startupMs: 45, activeMs: 280, recoveryMs: 240, distance: 220, recoveryReductionMs: 0, attackSpeedMultiplier: 1.25, attackSpeedMs: 750 }),
  }),
});

function phaseAt(action, elapsedMs, doctrine) {
  if (elapsedMs < doctrine.startupMs) return 'startup';
  if (elapsedMs < doctrine.startupMs + doctrine.activeMs) return 'active';
  if (elapsedMs < doctrine.startupMs + doctrine.activeMs + doctrine.recoveryMs) return 'recovery';
  return 'ready';
}

export function createDefenseState(hero) {
  if (!HERO_DOCTRINES[hero]) throw new RangeError(`unknown hero: ${hero}`);
  return Object.freeze({ hero, action: null, phase: 'ready', startTick: -1, tick: 0, direction: Object.freeze({ x: 0, y: 0 }) });
}

export function requestDefense(state, action, tick, direction = { x: 0, y: 0 }) {
  if (!['parry', 'dodge'].includes(action)) throw new RangeError(`unknown defense action: ${action}`);
  if (state.phase !== 'ready') return state;
  return Object.freeze({ ...state, action, phase: 'startup', startTick: tick, tick, direction: Object.freeze({ x: direction.x, y: direction.y }) });
}

// @MX:NOTE: [AUTO] Logical defense time is always the fixed 60 Hz simulation tick; render delta is intentionally ignored.
export function stepDefense(state, tick, _renderDeltaMs = 0) {
  if (!state.action || state.phase === 'ready') return Object.freeze({ ...state, tick });
  const doctrine = HERO_DOCTRINES[state.hero][state.action];
  const phase = phaseAt(state.action, (tick - state.startTick) * TICK_MS, doctrine);
  return Object.freeze({ ...state, action: phase === 'ready' ? null : state.action, phase, tick });
}

function angularDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function commandsFor(outcome, state, intent) {
  if (outcome === 'parried') return ['success-pose', 'collision-vfx', 'hit-stop', 'directional-sfx', 'hud-mark'].map(type => Object.freeze({ impactId: intent.impactId, action: 'parry', type, hero: state.hero }));
  if (outcome === 'dodged') return ['dodge-success-pose', 'afterimage-vfx', 'dodge-sfx', 'hud-mark'].map(type => Object.freeze({ impactId: intent.impactId, action: 'dodge', type, hero: state.hero }));
  return [];
}

// @MX:ANCHOR: [AUTO] All fixed-tick parry/dodge outcomes are resolved here before presentation.
// @MX:REASON: Gameplay, tutorial, replay, and HUD consume the same outcome and command contract.
export function resolveDefenseImpact(state, intent, { tick = state.tick, facing = 0, player = { x: 0, y: 0 } } = {}) {
  const current = stepDefense(state, tick);
  const base = { impactId: intent.impactId, defenseTag: intent.defenseTag, damage: intent.damage, counterDamage: 0, outcome: 'hit', commands: [] };
  if (intent.defenseTag === 'unavoidable') return Object.freeze(base);
  if (current.phase !== 'active') return Object.freeze(base);
  if (current.action === 'dodge') {
    const outcome = 'dodged';
    return Object.freeze({ ...base, damage: 0, outcome, commands: Object.freeze(commandsFor(outcome, current, intent)) });
  }
  const doctrine = HERO_DOCTRINES[current.hero].parry;
  const sourceAngle = Math.atan2(intent.origin.y - player.y, intent.origin.x - player.x);
  const insideCone = angularDistance(sourceAngle, facing) <= doctrine.coneDeg * Math.PI / 360;
  if (current.action === 'parry' && insideCone && ['parryable', 'reflectable'].includes(intent.defenseTag)) {
    const outcome = 'parried';
    return Object.freeze({
      ...base, damage: 0, counterDamage: intent.damage * doctrine.counter, outcome,
      reflected: intent.defenseTag === 'reflectable', stunRadius: doctrine.successStunRadius,
      stunMs: doctrine.successStunMs, commands: Object.freeze(commandsFor(outcome, current, intent)),
    });
  }
  return Object.freeze(base);
}

function transitionCommand(actionId, type, stage, hero) {
  return Object.freeze({ impactId: actionId, action: 'dodge', type, stage, hero });
}

export function defenseTransitionCommands(previous, current, actionId) {
  if (previous.phase === current.phase) return Object.freeze([]);
  const hero = current.hero ?? previous.hero;
  if (previous.phase === 'ready' && current.action === 'dodge' && current.phase === 'startup') return Object.freeze([
    transitionCommand(actionId, 'dodge-start-pose', 'start', hero), transitionCommand(actionId, 'dust-vfx', 'start', hero),
    transitionCommand(actionId, 'dodge-start-sfx', 'start', hero), transitionCommand(actionId, 'hud-mark', 'start', hero),
  ]);
  if (previous.phase === 'startup' && current.action === 'dodge' && current.phase === 'active') return Object.freeze([transitionCommand(actionId, 'dodge-movement-clip', 'active', hero)]);
  if (previous.phase === 'active' && previous.action === 'dodge' && current.phase === 'recovery') return Object.freeze([transitionCommand(actionId, 'dodge-invuln-end', 'recovery', hero)]);
  if (previous.phase === 'recovery' && previous.action === 'dodge' && current.phase === 'ready') return Object.freeze([
    transitionCommand(actionId, 'dodge-end-pose', 'end', hero), transitionCommand(actionId, 'dodge-end-sfx', 'end', hero), transitionCommand(actionId, 'hud-mark', 'end', hero),
  ]);
  return Object.freeze([]);
}

export function createPresentationQueue() {
  const consumed = new Set();
  return Object.freeze({
    consume(commands) {
      const emitted = [];
      for (const command of commands) {
        const key = `${command.impactId}:${command.action}:${command.stage ?? 'impact'}:${command.type}`;
        if (!consumed.has(key)) { consumed.add(key); emitted.push(command); }
      }
      return emitted;
    },
  });
}

export function entityAuditSnapshot({ selectedHero }) {
  if (!HERO_DOCTRINES[selectedHero]) throw new RangeError(`unknown hero: ${selectedHero}`);
  return Object.freeze({ rosterHeroes: 3, activeHero: selectedHero, playerRender: 1, hitTarget: 1, followerHero: 0 });
}
