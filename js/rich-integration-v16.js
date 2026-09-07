import { AttackIntentScheduler, createAttackIntent } from './attack-intent-v16.js';
import { HERO_DOCTRINES, createDefenseState, requestDefense, resolveDefenseImpact, stepDefense } from './defense-doctrine-v16.js';
import { createCampaignState, stepCampaign, transitionCampaignStage } from './battlefield-rules-v16.js';
import { applyObjectiveProgress, createObjectiveForStage, settleObjectiveReward } from './objective-rules-v16.js';
import { applyShopAction, createWarShop, shopSnapshot } from './war-shop-rules-v16.js';
import { createBossState, createPatternIntents, reduceBoss } from './boss-fsm-v16.js';
import { createAudioDirector, reduceAudioDirector } from './audio-director-v16.js';

const HEROES = Object.freeze({
  hoplite: Object.freeze({ hero: 'hoplite', name: '테라몬', combatKey: 'shield' }),
  swordsman: Object.freeze({ hero: 'swordsman', name: '아킬레온', combatKey: 'sword' }),
  archer: Object.freeze({ hero: 'archer', name: '칼카스', combatKey: 'bow' }),
});

export function canonicalHero(hero) { return HEROES[hero] ?? HEROES.hoplite; }

export function richEntityAudit(hero) {
  return Object.freeze({ activePlayerState: 1, playerRenderEntities: 1, playerHitTargets: 1, hero: canonicalHero(hero).hero });
}

export function canonicalShopRngState(value) {
  try { return (BigInt(typeof value === 'string' ? `0x${value.replace(/^0x/i, '')}` : Number(value) >>> 0) & ((1n << 64n) - 1n)).toString(16).padStart(16, '0'); }
  catch { return '0000000000000001'; }
}

const FIXED_TICK_MS = 1000 / 60;
const PROJECTILE_TERMINALS = new Set(['impact', 'shield-block', 'obstacle', 'expired', 'miss']);

export function projectileIntercept({ projectile, player }) {
  const rx = projectile.x - player.x, ry = projectile.y - player.y;
  const rvx = projectile.vx - (player.vx ?? 0), rvy = projectile.vy - (player.vy ?? 0);
  const speed2 = rvx * rvx + rvy * rvy;
  const seconds = speed2 > 0 ? -(rx * rvx + ry * rvy) / speed2 : -1;
  const closestApproach = seconds >= 0 ? Math.hypot(rx + rvx * seconds, ry + rvy * seconds) : Math.hypot(rx, ry);
  const sourceBearing = Math.atan2(ry, rx), playerAim = player.aim ?? 0;
  const angleDelta = Math.atan2(Math.sin(sourceBearing - playerAim), Math.cos(sourceBearing - playerAim));
  return Object.freeze({
    collisionCourse: seconds >= 0 && closestApproach <= projectile.r + player.r,
    timeToClosestTicks: seconds >= 0 ? Math.max(0, Math.ceil(seconds * 60)) : 0,
    closestApproach: Number(closestApproach.toFixed(3)), sourceBearing, playerAim, angleDelta,
  });
}

export function projectileTerminalEvent({ tick, impactId, reason, defensePhase, sourceBearing, playerAim, closestApproach }) {
  if (!PROJECTILE_TERMINALS.has(reason)) throw new RangeError(`unknown projectile terminal reason: ${reason}`);
  return Object.freeze({ type: reason, tick, impactId: String(impactId), defensePhase, sourceBearing, playerAim,
    angleDelta: Math.atan2(Math.sin(sourceBearing - playerAim), Math.cos(sourceBearing - playerAim)), closestApproach: Number(closestApproach.toFixed(3)) });
}

export function defenseImpactContext(state, source, player) {
  const direction = state?.direction ?? { x: 0, y: 0 };
  const facing = Math.hypot(direction.x, direction.y) > 0 ? Math.atan2(direction.y, direction.x) : (player.aim ?? 0);
  return Object.freeze({ facing, player: Object.freeze({ x: player.x, y: player.y }), origin: Object.freeze({ x: source.x, y: source.y }) });
}

export function resolveSpatialEvade({ intent, defense, dodgeStart, hazard, player, playerRadius, tick }) {
  const miss = Object.freeze({ outcome: 'miss', playerDamage: 0, evadeKind: null });
  if (!intent?.impactId || intent.defenseTag !== 'dodgeOnly' || defense?.action !== 'dodge' || !['active','recovery'].includes(defense.phase)) return miss;
  if (!dodgeStart || dodgeStart.tick !== defense.startTick || tick < dodgeStart.tick) return miss;
  const radius = hazard.r + playerRadius;
  const startedInside = Math.hypot(dodgeStart.x - hazard.x, dodgeStart.y - hazard.y) <= radius;
  const endedOutside = Math.hypot(player.x - hazard.x, player.y - hazard.y) > radius;
  return startedInside && endedOutside ? Object.freeze({ outcome: 'dodged', playerDamage: 0, evadeKind: 'displacement' }) : miss;
}

export function defenseStatusSnapshot(state) {
  state = stepDefense(state, state.tick);
  if (!state.action || state.phase === 'ready') return Object.freeze({ source: 'v16', mode: 'neutral', action: null, phase: 'ready', phaseElapsedMs: 0, phaseDurationMs: 0, cooldownTicks: 0 });
  const base = HERO_DOCTRINES[state.hero][state.action];
  const doctrine = {...base,activeMs:base.activeMs+(state.action==='parry'?(state.windowBonusMs||0):0)};
  const elapsedMs = Math.max(0, (state.tick - state.startTick) * FIXED_TICK_MS);
  const phaseOffsetMs = state.phase === 'active' ? doctrine.startupMs : state.phase === 'recovery' ? doctrine.startupMs + doctrine.activeMs : 0;
  const phaseDurationMs = doctrine[`${state.phase}Ms`] ?? 0;
  const totalMs = doctrine.startupMs + doctrine.activeMs + doctrine.recoveryMs;
  return Object.freeze({
    source: 'v16', mode: state.action, action: state.action, phase: state.phase,
    phaseElapsedMs: Math.max(0, elapsedMs - phaseOffsetMs), phaseDurationMs,
    cooldownTicks: Math.max(0, Math.ceil((totalMs - elapsedMs) / FIXED_TICK_MS)),
  });
}

// @MX:ANCHOR: [AUTO] The rich runtime consumes all V16 pure rules through this one stateless bridge.
// @MX:REASON: Combat, campaign, shop, boss and audio commands must not create a second game loop or state owner.
export function createRichPorts(hero) {
  return Object.freeze({
    hero: canonicalHero(hero),
    intent: Object.freeze({ create: createAttackIntent, Scheduler: AttackIntentScheduler }),
    defense: Object.freeze({ create: createDefenseState, request: requestDefense, step: stepDefense, resolve: resolveDefenseImpact, snapshot: defenseStatusSnapshot }),
    campaign: Object.freeze({ create: createCampaignState, step: stepCampaign, transition: transitionCampaignStage }),
    objective: Object.freeze({ create: createObjectiveForStage, progress: applyObjectiveProgress, settle: settleObjectiveReward }),
    shop: Object.freeze({ create: createWarShop, apply: applyShopAction, snapshot: shopSnapshot, rngState: canonicalShopRngState }),
    boss: Object.freeze({ create: createBossState, reduce: reduceBoss, intents: createPatternIntents }),
    audio: Object.freeze({ create: createAudioDirector, reduce: reduceAudioDirector }),
  });
}
