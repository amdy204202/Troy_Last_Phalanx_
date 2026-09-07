const BOSS_IDS = new Set([
  'paris',
  'sarpedon',
  'chariot',
  'aeneas',
  'penthesilea',
  'memnon',
  'hector'
]);

const PARRY_MISS_EXPOSURE_TICKS = 15;
const PARRY_MISS_DAMAGE_MULTIPLIER = 1.15;

export function normalizeShakeSettings(settings = {}) {
  if (settings.shakeV17Migrated === true) {
    return {
      ...settings,
      shake: settings.shake === true
    };
  }

  return {
    ...settings,
    shake: typeof settings.shake === 'boolean'
      ? settings.shake
      : false,
    shakeV17Migrated: true
  };
}

export function phaseProjectileMultiplier(phase = 1) {
  return phase >= 3
    ? 1.25
    : phase === 2
      ? 1.12
      : 1;
}

export function bossManifestPatternRuntime(pattern = {}, phase = 1) {
  const tokens = String(pattern.movement || 'stationary').split('-');

  const numbers = tokens
    .filter(token => /^\d+(?:\.\d+)?$/.test(token))
    .map(Number);

  const movement = tokens
    .filter(token => !/^\d+(?:\.\d+)?$/.test(token))
    .join('-') || 'stationary';

  const speed = numbers.at(-1) || 180;
  const distance = Math.max(1, Number(pattern.distance) || 1);

  const projectileSpeed =
    Math.round(
      speed * phaseProjectileMultiplier(phase) * 1000
    ) / 1000;

  return Object.freeze({
    movement,
    speed,
    distance,
    recoveryTicks: Math.max(
      1,
      Math.round(
        ((Number(pattern.recoveryMs) || 1000) / 1000) * 60
      )
    ),
    projectileSpeed,
    projectileLife: distance / projectileSpeed
  });
}

export function resolveShakeOffset({
  enabled = false,
  magnitude = 0,
  random = Math.random
} = {}) {
  if (!enabled || !(magnitude > 0)) {
    return { x: 0, y: 0 };
  }

  const sample = () =>
    (
      Math.max(
        0,
        Math.min(1, Number(random()) || 0)
      ) * 2 - 1
    ) * magnitude;

  return {
    x: sample(),
    y: sample()
  };
}

export function bossPatternProfile(
  bossId,
  {
    seed = 0,
    playerDiameter = 48,
    phase = 1
  } = {}
) {
  if (!BOSS_IDS.has(bossId)) {
    throw new TypeError(`Unknown boss: ${bossId}`);
  }

  const phaseSpeed = phaseProjectileMultiplier(phase);

  const profiles = {
    paris: {
      state: 'stealth',
      stealthTicks: 48,
      projectileSpeedMultiplier: 1.8,

      // 파리스 독 강화
      poisonTicks: 72,
      poisonIntervalTicks: 12,
      poisonDamageRatio: .12
    },

    sarpedon: {
      state: 'airborne',
      airborneTicks: 48,
      landingTelegraphTicks: 36,
      defenseTag: 'dodgeOnly',
      invulnerable: true
    },

    chariot: {
      state: 'windup',
      windupTicks: 42,
      chargeTicks: 51,
      retreatTicks: 30,
      reentryAngleOffset:
        Math.PI * (seed % 2 ? .42 : -.42)
    },

    aeneas: {
      state: 'guard',
      damageMultiplier: .05,
      guardBreakTicks: 120
    },

    penthesilea: {
      state: 'windup',
      shortTicks: 24,
      longTicks: 48,
      redirectTick: 12,
      feint: seed % 100 < 15
    },

    memnon: {
      state: 'corridor',
      minimumCorridorWidth: playerDiameter + 12,
      burnTicks: 180,
      compression: Math.min(.36, .12 * phase)
    },

    hector: {
      state: 'combo',
      combo: [
        'parryable',
        'dodgeOnly',
        'parryable'
      ]
    }
  };

  return Object.freeze({
    bossId,
    phaseSpeed,
    ...profiles[bossId]
  });
}

export function createBossAdaptation(bossId) {
  if (!BOSS_IDS.has(bossId)) {
    throw new TypeError(`Unknown boss: ${bossId}`);
  }

  return {
    bossId,
    consecutiveParries: 0,
    lastParryTick: -Infinity,
    counterNext: false
  };
}

export function applyBossParryResult(
  state,
  {
    type,
    tick
  }
) {
  if (
    type === 'dodge' ||
    tick - state.lastParryTick > 300
  ) {
    return {
      ...state,
      consecutiveParries: type === 'parry' ? 1 : 0,
      lastParryTick: type === 'parry'
        ? tick
        : -Infinity,
      counterNext: false
    };
  }

  if (type !== 'parry') {
    return state;
  }

  const consecutiveParries =
    state.consecutiveParries + 1;

  return {
    ...state,
    consecutiveParries,
    lastParryTick: tick,
    counterNext: consecutiveParries >= 2
  };
}

export function adaptBossIntent(
  state,
  intent,
  tick
) {
  if (
    !state.counterNext ||
    tick - state.lastParryTick > 300 ||
    intent.defenseTag !== 'parryable'
  ) {
    return {
      ...intent
    };
  }

  return {
    ...intent,
    defenseTag: 'dodgeOnly',
    counter: false,
    reflect: false,
    adapted: true
  };
}

export function consumeAdaptationAfterSpawn(
  state,
  intent,
  created
) {
  return created && intent?.adapted
    ? {
        ...state,
        counterNext: false,
        consecutiveParries: 0
      }
    : state;
}

/*
  파리스 독
  - 12% × 6회
  - 총 이론 피해: bossDamage의 72%
  - 12틱마다 피해
*/
export function applyPoisonHit(
  state,
  {
    tick,
    bossDamage,
    eventId
  }
) {
  if (state?.eventIds?.has(eventId)) {
    return state;
  }

  const eventIds = new Set(
    state?.eventIds || []
  );

  eventIds.add(eventId);

  return {
    active: true,
    stacks: 1,

    damage: bossDamage * .12,

    nextTick: tick + 12,

    expiresAt: tick + 72,

    ticksRemaining: 6,

    eventIds
  };
}

export function tickPoison(
  state,
  tick,
  hp
) {
  if (!state?.active) {
    return {
      state,
      hp
    };
  }

  let next = {
    ...state
  };

  while (
    next.ticksRemaining > 0 &&
    tick >= next.nextTick &&
    next.nextTick <= next.expiresAt
  ) {
    hp -= next.damage;

    next.ticksRemaining--;

    next.nextTick += 12;
  }

  if (
    next.ticksRemaining <= 0 ||
    tick >= next.expiresAt
  ) {
    next.active = false;
  }

  return {
    state: next,
    hp
  };
}

export function bossRelicDropCount({
  boss,
  roll
}) {
  return boss
    ? 1 + (roll < .25 ? 1 : 0)
    : 0;
}

export function createRecoveryLedger() {
  return {
    eventIds: new Set(),
    ambrosiaWindowStart: -Infinity,
    ambrosiaWindowUsed: 0
  };
}

export function consumeFleeceHeal(
  ledger,
  {
    eventId,
    boss = false,
    elite = false,
    relicLevel = 0
  }
) {
  if (
    ledger.eventIds.has(eventId) ||
    (!boss && !elite)
  ) {
    return 0;
  }

  ledger.eventIds.add(eventId);

  return (
    (boss ? 5 : 3) +
    relicLevel
  );
}

export function consumeAmbrosiaHeal(
  ledger,
  {
    eventId,
    tick,
    damage,
    boss = false,
    elite = false
  }
) {
  if (
    ledger.eventIds.has(eventId) ||
    (!boss && !elite)
  ) {
    return 0;
  }

  ledger.eventIds.add(eventId);

  if (
    tick - ledger.ambrosiaWindowStart >= 60
  ) {
    ledger.ambrosiaWindowStart = tick;
    ledger.ambrosiaWindowUsed = 0;
  }

  if (
    !Number.isFinite(
      ledger.ambrosiaWindowStart
    )
  ) {
    ledger.ambrosiaWindowStart = tick;
  }

  const amount = Math.min(
    2 - ledger.ambrosiaWindowUsed,
    damage * (boss ? .01 : .02)
  );

  ledger.ambrosiaWindowUsed +=
    Math.max(0, amount);

  return Math.max(
    0,
    amount
  );
}

export function enemyAttackTiming({
  bucket,
  seed = 0,
  attackOrdinal = 0,
  seconds
}) {
  const selected =
    bucket ??
    (
      Number(seed) +
      Number(attackOrdinal) * 37
    );

  const normalized =
    ((selected % 100) + 100) % 100;

  const threatTiers = Math.max(
    0,
    Math.floor(
      (seconds - 300) / 60
    ) + 1
  );

  return Object.freeze({
    cadenceMultiplier:
      normalized % 2 === 0
        ? .72
        : 1.28,

    feint:
      seconds >= 480 &&
      normalized < 15,

    projectileSpeedMultiplier:
      1 +
      Math.min(
        .4,
        threatTiers * .04
      )
  });
}

/*
  패링 실패
  - 노출 15틱 = 약 0.25초
  - 받는 피해 +15%
*/
export function parryMissPenalty({
  baseCooldownTicks = 54
} = {}) {
  return Object.freeze({
    exposedTicks:
      PARRY_MISS_EXPOSURE_TICKS,

    damageMultiplier:
      PARRY_MISS_DAMAGE_MULTIPLIER,

    cooldownTicks:
      baseCooldownTicks +
      PARRY_MISS_EXPOSURE_TICKS
  });
}

export function parryExposureAt(
  startTick,
  currentTick
) {
  return (
    currentTick >= startTick &&
    currentTick - startTick <
      PARRY_MISS_EXPOSURE_TICKS
  );
}

export function advanceParryExposure(
  exposedTicks,
  missed
) {
  return missed
    ? PARRY_MISS_EXPOSURE_TICKS
    : Math.max(
        0,
        (Number(exposedTicks) || 0) - 1
      );
}

export function consumeParryFailure(
  state,
  telemetryFailures
) {
  const handled = Math.max(
    0,
    Number(state?.handled) || 0
  );

  const observed = Math.max(
    0,
    Number(telemetryFailures) || 0
  );

  return Object.freeze({
    handled: Math.max(
      handled,
      observed
    ),

    missed:
      observed > handled
  });
}

export function advanceChargeState(
  state,
  dt
) {
  const next = {
    ...state
  };

  if (
    next.chargeWindup > 0
  ) {
    const before =
      next.chargeWindup;

    next.chargeWindup =
      Math.max(
        0,
        next.chargeWindup - dt
      );

    if (
      before > 0 &&
      next.chargeWindup === 0
    ) {
      next.phase =
        next.chargeTicks / 60;
    }
  }

  else if (
    next.phase > 0
  ) {
    next.phase =
      Math.max(
        0,
        next.phase - dt
      );
  }

  else if (
    next.retreatTicks > 0
  ) {
    next.retreatTicks--;

    if (
      next.retreatTicks === 0
    ) {
      next.chargeAngle =
        next.reentryAngle;

      next.chargeWindup = .6;
    }
  }

  return next;
}

export function bossDamageMultiplier(
  bossId,
  {
    guardBrokenTicks = 0,
    invulnerable = false
  } = {}
) {
  if (invulnerable) {
    return 0;
  }

  return (
    bossId === 'aeneas' &&
    guardBrokenTicks <= 0
  )
    ? .05
    : 1;
}

const MECHANIC_STAGES =
  Object.freeze({
    chariot: Object.freeze([
      ['windup', 42],
      ['charge', 51],
      ['retreat', 30],
      ['reentryWindup', 36],
      ['reentryCharge', 51]
    ]),

    paris: Object.freeze([
      ['stealth', 48],
      ['emerge', 1]
    ]),

    sarpedon: Object.freeze([
      ['airborne', 48],
      ['landingTell', 36],
      ['slam', 1]
    ]),

    penthesilea: Object.freeze([
      ['shortTell', 24],
      ['charge', 45]
    ])
  });

export function createBossMechanicState(
  bossId,
  {
    seed = 0,
    recoveryTicks = 60,
    feint = seed % 100 < 15
  } = {}
) {
  let stages =
    MECHANIC_STAGES[bossId] ||
    [['attack', 1]];

  if (
    bossId === 'penthesilea' &&
    feint
  ) {
    stages = [
      ['feintShort', 12],
      ['longTell', 48],
      ['charge', 45]
    ];
  }

  return {
    bossId,
    stage: stages[0][0],
    remaining: stages[0][1],
    stageIndex: 0,
    stages,
    recoveryTicks,
    complete: false,
    redirected: false,
    actionsFired: 0
  };
}

export function stepBossMechanic(
  state
) {
  if (state.complete) {
    return {
      state,
      actions: []
    };
  }

  const next = {
    ...state,
    remaining:
      state.remaining - 1
  };

  const actions = [];

  if (
    next.remaining > 0
  ) {
    return {
      state: next,
      actions
    };
  }

  const leaving =
    next.stage;

  if (
    leaving === 'stealth'
  ) {
    actions.push({
      type: 'paris-emerge'
    });
  }

  if (
    leaving === 'landingTell'
  ) {
    actions.push({
      type: 'sarpedon-slam'
    });
  }

  if (
    leaving === 'feintShort'
  ) {
    actions.push({
      type: 'redirect'
    });

    next.redirected = true;
  }

  if (
    leaving === 'windup'
  ) {
    actions.push({
      type: 'chariot-charge'
    });
  }

  if (
    leaving === 'reentryWindup'
  ) {
    actions.push({
      type: 'chariot-reentry'
    });
  }

  if (
    leaving === 'shortTell' ||
    leaving === 'longTell'
  ) {
    actions.push({
      type: 'penthesilea-charge'
    });
  }

  if (
    leaving === 'attack'
  ) {
    actions.push({
      type:
        `${state.bossId}-attack`
    });
  }

  const index =
    next.stageIndex + 1;

  if (
    index < next.stages.length
  ) {
    next.stageIndex = index;

    next.stage =
      next.stages[index][0];

    next.remaining =
      next.stages[index][1];
  }

  else if (
    next.stage !== 'recovery'
  ) {
    next.stage = 'recovery';

    next.remaining =
      next.recoveryTicks;
  }

  else {
    next.complete = true;
  }

  next.actionsFired +=
    actions.length;

  return {
    state: next,
    actions
  };
}

export function memnonCorridorGeometry({
  x,
  y,
  angle,
  playerDiameter,
  phase
}) {
  const gap =
    playerDiameter + 12;

  const compression =
    Math.min(
      .36,
      .12 * Math.max(1, phase)
    );

  const wallWidth =
    34 + compression * 50;

  const offset =
    gap / 2 +
    wallWidth / 2;

  const length =
    380 -
    compression * 120;

  const nx =
    -Math.sin(angle);

  const ny =
    Math.cos(angle);

  return {
    gap,
    compression,

    boundaries: [-1, 1].map(
      side => ({
        x:
          x +
          nx *
          offset *
          side,

        y:
          y +
          ny *
          offset *
          side,

        angle,
        width:
          wallWidth,

        length,

        offset:
          offset * side
      })
    )
  };
}