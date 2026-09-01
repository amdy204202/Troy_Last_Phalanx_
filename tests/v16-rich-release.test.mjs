import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { migrateLegacyStorage } from '../js/save-migration-v16.js';
import { buildRichReleaseUrls, journeyCuePollingStep, validateRichIntegration, validateRichJourneyTape } from '../tools/validate-rich-integration-v16.mjs';

const root = resolve(import.meta.dirname, '..');
const storage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('save migration chooses valid V16 then V14 through V12 and writes only troy_save_v16', () => {
  const legacy = JSON.stringify({ schemaVersion: 15, hero: 'archer', difficulty: 'heroic' });
  const target = storage({ troy_last_phalanx_v14_meta: legacy });
  const result = migrateLegacyStorage(target);
  assert.equal(result.hero, 'archer');
  assert.equal(JSON.parse(target.values.get('troy_save_v16')).schemaVersion, 16);
  assert.equal(target.values.get('troy_last_phalanx_v14_meta'), legacy);
  assert.equal(target.values.get('troy_last_phalanx_v14_meta_backup'), legacy);
  const again = target.values.get('troy_save_v16');
  migrateLegacyStorage(target);
  assert.equal(target.values.get('troy_save_v16'), again);
});

test('live runtime declares one active V16 save key and no legacy write key', () => {
  const source = readFileSync(resolve(root, 'js/game.js'), 'utf8');
  assert.match(source, /const META_KEY = 'troy_save_v16'/);
  assert.doesNotMatch(source, /const META_KEY = 'troy_last_phalanx_v14_meta'/);
});

test('rich release is the exact frozen-rich and used V16 closure', () => {
  const urls = buildRichReleaseUrls(root);
  assert.equal(urls.length, new Set(urls).size);
  assert.ok(urls.includes('./css/game.css'));
  assert.ok(urls.includes('./js/game.js'));
  assert.ok(!urls.some(url => /(?:index-v\d+\.html|js\/game-v\d+\.js)/.test(url)));
  assert.ok(urls.includes('./js/rich-integration-v16.js'));
  assert.ok(urls.includes('./assets/animations/troy-defense-atlas-v16.png'));
  assert.ok(urls.includes('./assets/audio/v16/music_field_base.wav'));
  assert.deepEqual(validateRichIntegration(root), { route: 'canonical', frozenFiles: 106, players: 1, releaseUrls: urls.length });
});

test('rich journey owns three schema-validated independent production profiles', () => {
  const result = validateRichJourneyTape(root);
  assert.equal(result.profiles, 3);
  assert.deepEqual(Object.keys(result.scenarios), ['surface-growth','defense-objective-shop','campaign-completion']);
  const path = resolve(root, 'tests/fixtures/v16-rich-journeys/defense-objective-shop.ndjson');
  const source = readFileSync(path, 'utf8').replace('"control":"KeyW"', '"control":"KeyQ"');
  assert.throws(() => validateRichJourneyTape(root, { 'defense-objective-shop': source }), /RICH_JOURNEY_TAPE_MISMATCH.*scenario=defense-objective-shop/s);
});

test('boss cue polling remains inside the minimum telegraph window', () => {
  assert.equal(journeyCuePollingStep('boss', 36), 12);
  assert.ok(journeyCuePollingStep('boss', 36) < 36);
  assert.equal(journeyCuePollingStep('projectile', 18), 3);
  assert.throws(() => journeyCuePollingStep('boss', 12), /telegraph window/);
});
