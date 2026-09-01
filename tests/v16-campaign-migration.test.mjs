import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacyStorage, migrateV15Save, migrateV15Storage } from '../js/save-migration-v16.js';

test('migration preserves valid V15 values, backs up first and clears run state', () => {
  const raw = {
    schemaVersion: 15, hero: 'archer', difficulty: 'heroic', curses: ['fire','fire','armor'], laurels: 8,
    might: 1, vigor: 2, wisdom: 3, haste: 4, cadence: 5, reach: 6, velocity: 7, duration: 8,
    amount: 9, magnet: 10, fortune: 11, resolve: 12, recovery: 13, revival: 14, renown: 15,
    victories: 2, bestKills: 99, bestLevel: 7, achievements: { a: true }, seen: { b: 1 }, defeated: { c: 2 }, dailyScores: { d: 3 },
    lastVictory: { hero: 'archer' }, lastRunSeed: 'abc', runTimes: { missionTime: 5, combatTime: 4, bossCombatTime: 3 },
    settings: { master: .5, music: .4, sfx: .3, quality: 'high', targetPriority: 'nearest', shake: false, numbers: false, colorblind: true, uiScale: 1.2 },
    objective: { bad: true }, shop: { bad: true }, banished: ['might'],
  };
  const migrated = migrateV15Save(raw);
  assert.equal(migrated.schemaVersion, 16);
  assert.deepEqual(migrated.curses, ['fire','armor']);
  assert.deepEqual(Object.fromEntries(Array.from({ length: 15 }, (_, i) => [['might','vigor','wisdom','haste','cadence','reach','velocity','duration','amount','magnet','fortune','resolve','recovery','revival','renown'][i], migrated[['might','vigor','wisdom','haste','cadence','reach','velocity','duration','amount','magnet','fortune','resolve','recovery','revival','renown'][i]]])), Object.fromEntries(Array.from({ length: 15 }, (_, i) => [['might','vigor','wisdom','haste','cadence','reach','velocity','duration','amount','magnet','fortune','resolve','recovery','revival','renown'][i], i + 1])));
  assert.equal(migrated.settings.ambientVolume, .4);
  assert.equal(migrated.settings.uiVolume, .3);
  assert.equal(migrated.campaignVersion, 1);
  assert.ok(!('objective' in migrated) && !('shop' in migrated) && !('banished' in migrated));

  const values = new Map([['troy_save_v15', JSON.stringify(raw)]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  migrateV15Storage(storage);
  assert.equal(values.get('troy_save_v15_backup'), JSON.stringify(raw));
  assert.equal(JSON.parse(values.get('troy_save_v16')).schemaVersion, 16);
});

test('live migration preserves a corrupt V16 payload before recovering a fresh save', () => {
  const values = new Map([['troy_save_v16', '{corrupt']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const migrated = migrateLegacyStorage(storage);
  assert.equal(values.get('troy_save_v16_corrupt_backup'), '{corrupt');
  assert.equal(migrated.schemaVersion, 16);
  assert.equal(JSON.parse(values.get('troy_save_v16')).schemaVersion, 16);
});

test('migration normalizes every corrupt class and does not overwrite source on failure', () => {
  const corrupt = migrateV15Save({ hero: 'enemy', difficulty: 'x', curses: {}, laurels: NaN, might: -1, victories: -9, bestLevel: 2.2, achievements: [], runTimes: { missionTime: -1 }, settings: { master: 9, music: -2, quality: 'cinema', shake: 'yes', uiScale: 9 } });
  assert.equal(corrupt.hero, 'hoplite'); assert.equal(corrupt.difficulty, 'bronze'); assert.deepEqual(corrupt.curses, []);
  assert.equal(corrupt.laurels, 0); assert.equal(corrupt.might, 0); assert.equal(corrupt.victories, 0); assert.equal(corrupt.bestLevel, 1);
  assert.deepEqual(corrupt.achievements, {}); assert.deepEqual(corrupt.runTimes, { missionTime: 0, combatTime: 0, bossCombatTime: 0 });
  assert.equal(corrupt.settings.master, 1); assert.equal(corrupt.settings.music, 0); assert.equal(corrupt.settings.quality, 'auto'); assert.equal(corrupt.settings.shake, true); assert.equal(corrupt.settings.uiScale, 1.35);
  const values = new Map([['troy_save_v15', '{bad json']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.throws(() => migrateV15Storage(storage), /V15 save JSON/);
  assert.equal(values.get('troy_save_v15'), '{bad json');
  assert.equal(values.get('troy_save_v15_backup'), '{bad json');
  assert.equal(values.get('troy_save_v16'), undefined);
});
