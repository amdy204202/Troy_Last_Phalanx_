const META_KEYS = Object.freeze(['might','vigor','wisdom','haste','cadence','reach','velocity','duration','amount','magnet','fortune','resolve','recovery','revival','renown']);
const OBJECT_KEYS = Object.freeze(['achievements','seen','defeated','dailyScores']);
const HEROES = new Set(['hoplite','swordsman','archer']);
const DIFFICULTIES = new Set(['bronze','heroic','mythic']);
const QUALITIES = new Set(['auto','low','high']);
const TARGETS = new Set(['threat','nearest','lowest']);
const finite = (value, fallback = 0) => Number.isFinite(value) && value >= 0 ? value : fallback;
const integer = (value, fallback = 0) => Number.isInteger(value) && value >= 0 ? value : fallback;
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
const clamp = (value, fallback, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));

export function migrateV15Save(raw = {}) {
  const settings = record(raw.settings), times = record(raw.runTimes);
  const migrated = {
    schemaVersion: 16, hero: HEROES.has(raw.hero) ? raw.hero : 'hoplite', difficulty: DIFFICULTIES.has(raw.difficulty) ? raw.difficulty : 'bronze',
    curses: Array.isArray(raw.curses) ? [...new Set(raw.curses.filter(id => typeof id === 'string'))] : [], laurels: finite(raw.laurels),
    victories: integer(raw.victories), bestKills: integer(raw.bestKills), bestLevel: integer(raw.bestLevel, 1),
    lastVictory: raw.lastVictory && typeof raw.lastVictory === 'object' && !Array.isArray(raw.lastVictory) ? { ...raw.lastVictory } : null,
    lastRunSeed: ['string','number'].includes(typeof raw.lastRunSeed) ? raw.lastRunSeed : null,
    runTimes: { missionTime: finite(times.missionTime), combatTime: finite(times.combatTime), bossCombatTime: finite(times.bossCombatTime) },
    settings: {
      master: clamp(settings.master, .8), music: clamp(settings.music, .34), sfx: clamp(settings.sfx, .72),
      quality: QUALITIES.has(settings.quality) ? settings.quality : 'auto', targetPriority: TARGETS.has(settings.targetPriority) ? settings.targetPriority : 'threat',
      shake: bool(settings.shake, true), numbers: bool(settings.numbers, true), colorblind: bool(settings.colorblind, false), uiScale: clamp(settings.uiScale, 1, .8, 1.35),
      ambientVolume: clamp(settings.music, .34), uiVolume: clamp(settings.sfx, .72),
    },
    campaignVersion: 1,
  };
  for (const key of META_KEYS) migrated[key] = finite(raw[key]);
  for (const key of OBJECT_KEYS) migrated[key] = record(raw[key]);
  return migrated;
}

export function migrateV15Storage(storage, { sourceKey = 'troy_save_v15', backupKey = 'troy_save_v15_backup', targetKey = 'troy_save_v16' } = {}) {
  const source = storage.getItem(sourceKey);
  if (source === null) return null;
  if (storage.getItem(backupKey) === null) storage.setItem(backupKey, source);
  let raw;
  try { raw = JSON.parse(source); } catch (error) { throw new TypeError(`V15 save JSON is invalid: ${error.message}`); }
  const migrated = migrateV15Save(raw);
  if (migrated.schemaVersion !== 16) throw new Error('V16 validation failed');
  storage.setItem(targetKey, JSON.stringify(migrated));
  return migrated;
}

// @MX:ANCHOR: [AUTO] Every browser boot converges legacy saves into one active V16 key.
// @MX:REASON: The rich runtime, settings, hero selection and campaign records must never fork across versioned keys.
export function migrateLegacyStorage(storage, { targetKey = 'troy_save_v16' } = {}) {
  const current = storage.getItem(targetKey);
  if (current !== null) {
    try {
      const parsed = JSON.parse(current);
      if (parsed?.schemaVersion === 16) return parsed;
    } catch { /* preserve the unreadable payload before recovery */ }
    const corruptBackupKey = `${targetKey}_corrupt_backup`;
    if (storage.getItem(corruptBackupKey) === null) storage.setItem(corruptBackupKey, current);
  }
  const sourceKeys = ['troy_last_phalanx_v14_meta', 'troy_last_phalanx_v13_meta', 'troy_last_phalanx_v12_meta'];
  for (const sourceKey of sourceKeys) {
    const source = storage.getItem(sourceKey);
    if (source === null) continue;
    const backupKey = `${sourceKey}_backup`;
    if (storage.getItem(backupKey) === null) storage.setItem(backupKey, source);
    try {
      const migrated = migrateV15Save(JSON.parse(source));
      storage.setItem(targetKey, JSON.stringify(migrated));
      return migrated;
    } catch { /* preserve this source and try an older backup */ }
  }
  const fresh = migrateV15Save({});
  storage.setItem(targetKey, JSON.stringify(fresh));
  return fresh;
}
