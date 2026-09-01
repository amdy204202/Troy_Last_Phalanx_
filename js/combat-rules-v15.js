export const DEFENSE_DEFAULTS = Object.freeze({
  parry: Object.freeze({ startupMs: 90, activeMs: 180, successMs: 120, recoveryMs: 260, cooldownMs: 900 }),
  dodge: Object.freeze({ startupMs: 45, activeMs: 240, recoveryMs: 210, cooldownMs: 780 }),
  hurt: Object.freeze({ recoveryMs: 260 }),
});

const TAGS = new Set(['parryable', 'reflectable', 'dodgeOnly', 'unavoidable']);
const MODES = new Set(['parry', 'dodge']);

export function createDefenseTelemetry() {
  return {
    parryAttempts: 0,
    parrySuccesses: 0,
    parryFailures: 0,
    defenseDamageTaken: 0,
    counterDamage: 0,
    dodgeAttempts: 0,
    dodgeDamageAvoided: 0,
    postDodgeHits: 0,
    supportDamage: 0,
    rejectedInputs: 0,
  };
}

export function createDefenseState(options = {}, telemetry = createDefenseTelemetry()) {
  return {
    mode: 'neutral',
    phase: 'neutral',
    elapsedMs: 0,
    startedAt: 0,
    lastDodgeEndedAt: Number.NEGATIVE_INFINITY,
    lastParrySuccessAt: Number.NEGATIVE_INFINITY,
    resolvedImpacts: new Map(),
    appliedImpacts: new Set(),
    telemetry,
    resources: {
      parryCharges: options.parryCharges ?? Number.POSITIVE_INFINITY,
      dodgeCharges: options.dodgeCharges ?? Number.POSITIVE_INFINITY,
    },
    tuning: {
      parry: { ...DEFENSE_DEFAULTS.parry, ...options.parry },
      dodge: { ...DEFENSE_DEFAULTS.dodge, ...options.dodge },
      hurt: { ...DEFENSE_DEFAULTS.hurt, ...options.hurt },
    },
  };
}

export function requestDefense(state, mode, nowMs = 0) {
  if (!MODES.has(mode)) throw new TypeError(`알 수 없는 방어 행동: ${mode}`);
  if (state.mode !== 'neutral' || state.resources[`${mode}Charges`] <= 0) {
    state.telemetry.rejectedInputs++;
    return false;
  }
  state.resources[`${mode}Charges`]--;
  state.mode = mode;
  state.phase = 'startup';
  state.elapsedMs = 0;
  state.startedAt = nowMs;
  state.lastParrySuccessAt=Number.NEGATIVE_INFINITY;
  state.resolvedImpacts.clear();
  state.telemetry[mode === 'parry' ? 'parryAttempts' : 'dodgeAttempts']++;
  return true;
}

export function enterHurtState(state,nowMs=0){
  state.mode='hurt';state.phase='recovery';state.elapsedMs=0;state.startedAt=nowMs;state.resolvedImpacts.clear();return true;
}

function phaseDuration(state) {
  if (state.mode === 'neutral') return Number.POSITIVE_INFINITY;
  if (state.mode === 'hurt') return state.tuning.hurt.recoveryMs;
  return state.tuning[state.mode][`${state.phase}Ms`] ?? 0;
}

function nextPhase(state, nowMs) {
  if (state.mode === 'hurt') {
    state.mode = 'neutral';
    state.phase = 'neutral';
    return;
  }
  if (state.phase === 'startup') state.phase = 'active';
  else if (state.mode === 'parry' && state.phase === 'success') state.phase = 'recovery';
  else if (state.phase === 'active') {
    if (state.mode === 'parry') state.telemetry.parryFailures++;
    state.phase = 'recovery';
  } else {
    if (state.mode === 'dodge') state.lastDodgeEndedAt = nowMs;
    state.mode = 'neutral';
    state.phase = 'neutral';
  }
}

export function advanceDefense(state, deltaMs, nowMs = state.startedAt + state.elapsedMs + deltaMs) {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new TypeError('deltaMs는 0 이상의 유한수여야 합니다.');
  state.elapsedMs += deltaMs;
  while (state.mode !== 'neutral' && state.elapsedMs >= phaseDuration(state)) {
    state.elapsedMs -= phaseDuration(state);
    nextPhase(state, nowMs);
  }
  return state;
}

export function makeAttackEvent(input) {
  const required = ['sourceKind', 'defenseTag', 'origin'];
  for (const key of required) if (input?.[key] == null) throw new TypeError(`공격 계약에 ${key}가 필요합니다.`);
  if (!TAGS.has(input.defenseTag)) throw new TypeError(`알 수 없는 defenseTag: ${input.defenseTag}`);
  if (!Number.isFinite(input.origin.x) || !Number.isFinite(input.origin.y)) throw new TypeError('origin은 유한한 x/y 좌표여야 합니다.');
  return Object.freeze({
    sourceKind: input.sourceKind,
    defenseTag: input.defenseTag,
    origin: Object.freeze({ x: input.origin.x, y: input.origin.y }),
    impactAt: input.impactAt ?? 0,
    threat: input.threat ?? 'low',
    impactId: input.impactId ?? `${input.sourceKind}:${input.impactAt ?? 0}:${input.origin.x}:${input.origin.y}`,
    damage: input.damage ?? 0,
  });
}

export function isInFrontCone(player, origin, halfAngleRad = Math.PI * 0.38) {
  const attackAngle = Math.atan2(origin.y - player.y, origin.x - player.x);
  const difference = Math.atan2(Math.sin(attackAngle - player.facing), Math.cos(attackAngle - player.facing));
  return Math.abs(difference) <= halfAngleRad;
}

export function resolveDefense(state, attack, context) {
  const alreadyResolved = state.resolvedImpacts.has(attack.impactId);
  if(alreadyResolved){const outcome=state.resolvedImpacts.get(attack.impactId);return{damageMultiplier:0,outcome,counter:false,reflect:false}}
  if (state.mode === 'dodge' && state.phase === 'active' && attack.defenseTag !== 'unavoidable') {
    state.telemetry.dodgeDamageAvoided += attack.damage;
    state.resolvedImpacts.set(attack.impactId,'dodged');
    return { damageMultiplier: 0, outcome: 'dodged', counter: false, reflect: false };
  }
  const parryable = attack.defenseTag === 'parryable' || attack.defenseTag === 'reflectable';
  const simultaneousParry=state.phase==='success'&&state.lastParrySuccessAt===attack.impactAt;
  if (state.mode === 'parry' && (state.phase === 'active'||simultaneousParry) && parryable && isInFrontCone(context.player, attack.origin)) {
    if (!alreadyResolved) {
      state.telemetry.parrySuccesses++;
      state.lastParrySuccessAt=attack.impactAt;
      state.phase = 'success';
      state.elapsedMs = 0;
      state.resolvedImpacts.set(attack.impactId,attack.defenseTag === 'reflectable' ? 'reflected' : 'parried');
    }
    return {
      damageMultiplier: 0,
      outcome: attack.defenseTag === 'reflectable' ? 'reflected' : 'parried',
      counter: !alreadyResolved && attack.defenseTag === 'parryable',
      reflect: !alreadyResolved && attack.defenseTag === 'reflectable',
    };
  }
  return { damageMultiplier: 1, outcome: 'hit', counter: false, reflect: false };
}

export function recordAppliedDamage(state,attack,appliedDamage){
  if(!Number.isFinite(appliedDamage)||appliedDamage<=0||state.appliedImpacts.has(attack.impactId))return false;
  state.appliedImpacts.add(attack.impactId);if(state.appliedImpacts.size>512)state.appliedImpacts.delete(state.appliedImpacts.values().next().value);
  state.telemetry.defenseDamageTaken+=appliedDamage;
  if(state.mode==='parry'){state.telemetry.parryFailures++}
  return true;
}

export function canScheduleHighThreat(activeHighThreats, candidate) {
  if (activeHighThreats.length >= 2) return false;
  if (activeHighThreats.some(threat => threat.boss) && !candidate.boss) {
    return activeHighThreats.filter(threat => !threat.boss).length < 1;
  }
  if (candidate.boss && activeHighThreats.some(threat => threat.boss)) return false;
  return true;
}

export function auditHighThreatBudget(activeHighThreats,{bossReady=false}={}){
  const failures=[],bosses=activeHighThreats.filter(threat=>threat.boss).length,normals=activeHighThreats.length-bosses;
  if(activeHighThreats.length>2)failures.push(`high 위협 예산 초과: ${activeHighThreats.length}/2`);
  if(bosses>1)failures.push(`보스 high 위협 중복: ${bosses}`);
  if(bosses>0&&normals>1)failures.push(`보스 high 중 일반 high 초과: ${normals}/1`);
  if(bossReady&&bosses===0&&normals>1)failures.push(`보스 high 예약 위반: 일반 high ${normals}/1`);
  return failures;
}

export function auditEntitySnapshot(snapshot) {
  const failures = [];
  if (snapshot.playerRenderEntities !== 1) failures.push(`플레이어 렌더 entity 오류: ${snapshot.playerRenderEntities}`);
  if (snapshot.followerEntities !== 0) failures.push(`추종 entity 오류: ${snapshot.followerEntities}`);
  if (snapshot.enemies > 360) failures.push(`적 개체 상한 초과: ${snapshot.enemies}`);
  if (snapshot.projectiles > 520) failures.push(`투사체 상한 초과: ${snapshot.projectiles}`);
  if (snapshot.particles > 900) failures.push(`파티클 상한 초과: ${snapshot.particles}`);
  return failures;
}
