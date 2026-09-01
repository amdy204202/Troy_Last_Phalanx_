import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DAILY_RULES,
  advanceRunClocks,
  applyDailyRule,
  canGorgonPetrify,
  createEventJournal,
  createDailySeed,
  createFixedStepAccumulator,
  lateThreatProfile,
  shouldTriggerGorgon,
  createRunSeed,
  createSeededRng,
  normalizeV15Meta,
  scoreDailyRun,
  settleVictoryOnce,
  transactPurchase,
} from '../js/run-rules-v15.js';

test('후반 위협 단계는 5분부터 개체 수 대신 체력·피해·정예 압박을 높인다', () => {
  assert.deepEqual(lateThreatProfile(299), {
    tier: 0, hp: 1, damage: 1, speed: 1, cadence: 1, spawnRate: 1, eliteChance: .02, dangerousWeight: 1,
  });
  const minuteFive = lateThreatProfile(300);
  const minuteEight = lateThreatProfile(480);
  const minuteFifteen = lateThreatProfile(900);
  assert.deepEqual(minuteFive, {
    tier: 1, hp: 1.22, damage: 1.11, speed: 1.025, cadence: 1.04, spawnRate: 1.035, eliteChance: .065, dangerousWeight: 1.18,
  });
  assert.ok(minuteEight.hp > minuteFive.hp);
  assert.ok(minuteEight.damage > minuteFive.damage);
  assert.ok(minuteEight.eliteChance > minuteFive.eliteChance);
  assert.ok(minuteFifteen.hp > minuteEight.hp);
  assert.ok(minuteFifteen.spawnRate <= 1.25);
  assert.ok(minuteFifteen.eliteChance <= .2);
});

test('고르곤 석화는 400킬마다 한 번 발동하고 보스에게는 적용되지 않는다', () => {
  for (const kills of [0, 20, 399, 401, 799]) assert.equal(shouldTriggerGorgon({ kills, relicLevel: 1 }), false);
  assert.equal(shouldTriggerGorgon({ kills: 400, relicLevel: 1 }), true);
  assert.equal(shouldTriggerGorgon({ kills: 800, relicLevel: 3 }), true);
  assert.equal(shouldTriggerGorgon({ kills: 400, relicLevel: 0 }), false);
  assert.equal(canGorgonPetrify({ dead: false, boss: false }), true);
  assert.equal(canGorgonPetrify({ dead: false, boss: true }), false);
  assert.equal(canGorgonPetrify({ dead: true, boss: false }), false);
});

test('일반 출전 seed는 매번 새 crypto 값을 쓰고 명시 fallback도 충돌하지 않는다', () => {
  let cryptoCall = 0;
  const cryptoSource = { getRandomValues(words) { cryptoCall += 1; words[0] = cryptoCall; words[1] = cryptoCall * 17; return words; } };
  const first = createRunSeed({ cryptoSource });
  const second = createRunSeed({ cryptoSource });
  assert.notEqual(first, second);
  assert.match(first, /^run-[0-9a-f]{16}$/);

  const fallbackA = createRunSeed({ cryptoSource: null, now: 100, monotonic: 5 });
  const fallbackB = createRunSeed({ cryptoSource: null, now: 100, monotonic: 5 });
  assert.notEqual(fallbackA, fallbackB);

  const collision = createRunSeed({ cryptoSource: { getRandomValues(words) { words[0] = 1; words[1] = 17; return words; } }, now: 101, monotonic: 6 });
  const thrown = createRunSeed({ cryptoSource: { getRandomValues() { throw new Error('crypto unavailable'); } }, now: 102, monotonic: 7 });
  assert.match(collision, /^run-[0-9a-f]{16}$/);
  assert.match(thrown, /^run-[0-9a-f]{16}$/);
  assert.notEqual(collision, first);
  assert.notEqual(thrown, collision);
});

test('30fps와 144fps 프레임 간격은 같은 60Hz tick과 첫 20 spawn 사건을 만든다', () => {
  const simulate = fps => {
    const rng = createSeededRng('fixed-step-audit');
    const spawns = [];
    const runner = createFixedStepAccumulator({
      stepSeconds: 1 / 60,
      onStep: (_dt, tick) => {
        if (tick % 18 === 0) spawns.push({ id: `spawn-${spawns.length + 1}`, value: Number(rng().toFixed(8)) });
      },
    });
    for (let frame = 0; frame < fps * 10; frame += 1) runner.advance(1 / fps);
    return { ticks: runner.ticks(), spawns: spawns.slice(0, 20), rngState: rng.state(), alpha: runner.alpha() };
  };

  const at30 = simulate(30);
  const at144 = simulate(144);
  assert.equal(at30.ticks, 600);
  assert.deepEqual(at144, at30);
});

test('사건 저널은 spawn·reward·crit·AI에 종류별 안정 ID와 복제된 값을 남긴다', () => {
  const journal = createEventJournal(['spawn', 'reward', 'crit', 'ai']);
  const mutable = { enemy: 'raider', roll: 0.25 };
  const recorded = [
    journal.record('spawn', mutable),
    journal.record('reward', { drop: 'xp', amount: 4 }),
    journal.record('crit', { source: 'spear', critical: false }),
    journal.record('ai', { enemy: 'raider', orbit: -1 }),
    journal.record('spawn', { enemy: 'archer', roll: 0.75 }),
  ];
  mutable.enemy = 'changed-after-record';

  assert.deepEqual(recorded.map(event => event.id), ['spawn-0001', 'reward-0001', 'crit-0001', 'ai-0001', 'spawn-0002']);
  assert.equal(journal.events('spawn')[0].value.enemy, 'raider');
  assert.deepEqual(journal.counts(), { spawn: 2, reward: 1, crit: 1, ai: 1 });
  assert.throws(() => journal.record('unknown', {}), /unknown event kind/);
});

test('play 시간은 일반전과 보스전의 세 시계를 각 정책대로 증가시킨다', () => {
  let clocks = { missionTime: 0, combatTime: 0, bossCombatTime: 0 };
  clocks = advanceRunClocks(clocks, { mode: 'play', bossAlive: false, dt: 30 });
  clocks = advanceRunClocks(clocks, { mode: 'play', bossAlive: true, dt: 20 });
  clocks = advanceRunClocks(clocks, { mode: 'choice', bossAlive: true, dt: 10 });
  clocks = advanceRunClocks(clocks, { mode: 'pause', bossAlive: false, dt: 10 });
  assert.deepEqual(clocks, { missionTime: 30, combatTime: 50, bossCombatTime: 20 });
});

test('UTC 날짜와 영웅·난이도·정렬 저주가 daily seed를 결정한다', () => {
  const first = createDailySeed({ utcDate: '2026-08-28', hero: 'hoplite', difficulty: 'heroic', curses: ['scarcity', 'haste'] });
  const reordered = createDailySeed({ utcDate: '2026-08-28', hero: 'hoplite', difficulty: 'heroic', curses: ['haste', 'scarcity'] });
  assert.equal(first, reordered);
  assert.notEqual(first, createDailySeed({ utcDate: '2026-08-29', hero: 'hoplite', difficulty: 'heroic', curses: ['haste', 'scarcity'] }));
  assert.notEqual(first, createDailySeed({ utcDate: '2026-08-28', hero: 'archer', difficulty: 'heroic', curses: ['haste', 'scarcity'] }));
  assert.notEqual(first, createDailySeed({ utcDate: '2026-08-28', hero: 'hoplite', difficulty: 'mythic', curses: ['haste', 'scarcity'] }));
});

test('seeded game RNG는 30·60·144fps와 low·high 시각 난수 소비량에 영향받지 않는다', () => {
  const seed = createDailySeed({ utcDate: '2026-08-28', hero: 'swordsman', difficulty: 'bronze', curses: [] });
  const simulate = (fps, quality) => {
    const gameRng = createSeededRng(seed);
    const visualRng = createSeededRng(`${seed}:visual`);
    const events = [];
    for (let i = 0; i < 90; i += 1) {
      const visualDraws = Math.ceil(fps / 30) * (quality === 'high' ? 9 : 1);
      for (let j = 0; j < visualDraws; j += 1) visualRng();
      events.push(Number(gameRng().toFixed(8)));
    }
    return { events, gameState: gameRng.state() };
  };
  const baseline = simulate(30, 'low');
  for (const fps of [30, 60, 144]) for (const quality of ['low', 'high']) assert.deepEqual(simulate(fps, quality), baseline);
});

test('daily 세 규칙은 명시된 전투 배율만 적용한다', () => {
  assert.equal(DAILY_RULES.enemyVitality.multiplier, 1.15);
  assert.equal(DAILY_RULES.hostileVelocity.multiplier, 1.2);
  assert.equal(DAILY_RULES.elitePressure.multiplier, 1.5);
  assert.ok(Math.abs(applyDailyRule('enemyVitality', 'enemyHp', 100) - 115) < Number.EPSILON * 100);
  assert.ok(Math.abs(applyDailyRule('hostileVelocity', 'hostileProjectileSpeed', 100) - 120) < Number.EPSILON * 100);
  assert.ok(Math.abs(applyDailyRule('elitePressure', 'eliteWeight', 2) - 3) < Number.EPSILON * 10);
  assert.equal(applyDailyRule('enemyVitality', 'eliteWeight', 2), 2);
});

test('보급 구매는 충분한 잔액에서 요청 ID당 정확히 한 번만 적용된다', () => {
  const initial = { drachma: 100, purchases: {}, stats: { maxHp: 100 } };
  const choice = { id: 'bronze-aegis', price: 40, effect: { stat: 'maxHp', amount: 20 } };
  const first = transactPurchase(initial, choice, 'request-1');
  const duplicate = transactPurchase(first.state, choice, 'request-1');
  assert.equal(first.ok, true);
  assert.equal(first.state.drachma, 60);
  assert.equal(first.state.stats.maxHp, 120);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'duplicate');
  assert.deepEqual(duplicate.state, first.state);
});

test('보급 구매는 잔액이 부족하면 잔액과 효과를 모두 보존한다', () => {
  const initial = { drachma: 39, purchases: {}, stats: { damage: 1 } };
  const choice = { id: 'whetstone', price: 40, effect: { stat: 'damage', amount: 0.15 } };
  const result = transactPurchase(initial, choice, 'request-2');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'insufficient');
  assert.deepEqual(result.state, initial);
});

test('헥토르 승리 정산은 반복 사망 이벤트에서도 보상을 한 번만 지급한다', () => {
  const initial = { victorySettled: false, victoryReward: 0, victories: 4, laurels: 10 };
  const first = settleVictoryOnce(initial, { reward: 14 });
  const duplicate = settleVictoryOnce(first.state, { reward: 14 });
  assert.equal(first.settled, true);
  assert.deepEqual(first.state, { victorySettled: true, victoryReward: 14, victories: 5, laurels: 24 });
  assert.equal(duplicate.settled, false);
  assert.deepEqual(duplicate.state, first.state);
});

test('V14 저장은 핵심 기록을 보존하고 V15 런 필드를 안전한 기본값으로 채운다', () => {
  const migrated = normalizeV15Meta({ schemaVersion: 14, hero: 'archer', laurels: 37, might: 3, achievements: { first: 1 } });
  assert.equal(migrated.schemaVersion, 15);
  assert.equal(migrated.hero, 'archer');
  assert.equal(migrated.laurels, 37);
  assert.equal(migrated.might, 3);
  assert.deepEqual(migrated.achievements, { first: 1 });
  assert.deepEqual(migrated.dailyScores, {});
  assert.equal(migrated.lastVictory, null);
  assert.equal(migrated.lastRunSeed, null);
  assert.deepEqual(migrated.runTimes, { missionTime: 0, combatTime: 0, bossCombatTime: 0 });
  assert.equal(normalizeV15Meta({ lastRunSeed: 'run-saved' }).lastRunSeed, 'run-saved');
});

test('daily 점수 시간 항은 missionTime 대신 combatTime 내림값을 사용한다', () => {
  assert.equal(scoreDailyRun({ combatTime: 50.9, missionTime: 999, kills: 12, bossKills: 2 }), 1170);
});

test('경계 입력은 시간·seed·점수를 안전한 기본값으로 정규화한다', () => {
  assert.deepEqual(advanceRunClocks(null, { mode: 'play', bossAlive: false, dt: -5 }), { missionTime: 0, combatTime: 0, bossCombatTime: 0 });
  assert.equal(createDailySeed({ utcDate: null, hero: null, difficulty: null, curses: 'haste' }), createDailySeed({ utcDate: '', hero: 'hoplite', difficulty: 'bronze', curses: [] }));
  assert.equal(scoreDailyRun({ combatTime: 'invalid', kills: -2, bossKills: null }), 0);
});

test('잘못된 구매 요청과 빈 요청 ID는 상태를 바꾸지 않는다', () => {
  const emptyId = transactPurchase({ drachma: 100 }, { id: 'x', price: 10, effect: { stat: 'damage', amount: 1 } }, '');
  assert.equal(emptyId.reason, 'duplicate');
  const invalid = transactPurchase(null, { id: '', price: -1, effect: { stat: '', amount: NaN } }, 'request');
  assert.equal(invalid.reason, 'invalid');
  const fresh = transactPurchase({ drachma: 10 }, { id: 'speed', price: 5, effect: { stat: 'speed', amount: 2 } }, 'fresh');
  assert.deepEqual(fresh.state, { drachma: 5, purchases: { fresh: 'speed' }, stats: { speed: 2 } });
});

test('비정상 저장과 승리 보상은 음수·배열·누락 값을 안전하게 처리한다', () => {
  const migrated = normalizeV15Meta({ hero: 'unknown', laurels: -20, achievements: [], dailyScores: [], lastVictory: 'bad', runTimes: { missionTime: -1, combatTime: 'bad', bossCombatTime: 4 } });
  assert.equal(migrated.hero, 'hoplite');
  assert.equal(migrated.laurels, 0);
  assert.deepEqual(migrated.achievements, {});
  assert.deepEqual(migrated.dailyScores, {});
  assert.equal(migrated.lastVictory, null);
  assert.deepEqual(migrated.runTimes, { missionTime: 0, combatTime: 0, bossCombatTime: 4 });
  assert.deepEqual(settleVictoryOnce(null, { reward: -10 }).state, { victorySettled: true, victoryReward: 0, victories: 1, laurels: 0 });
  assert.equal(normalizeV15Meta([]).schemaVersion, 15);
});
