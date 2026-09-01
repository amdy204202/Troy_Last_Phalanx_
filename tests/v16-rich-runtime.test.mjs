import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonicalHero, createRichPorts, richEntityAudit } from '../js/rich-integration-v16.js';

const root = resolve(import.meta.dirname, '..');

test('rich bridge uses one canonical hero triple and one player target', () => {
  assert.deepEqual(canonicalHero('hoplite'), { hero: 'hoplite', name: '테라몬', combatKey: 'shield' });
  assert.deepEqual(canonicalHero('swordsman'), { hero: 'swordsman', name: '아킬레온', combatKey: 'sword' });
  assert.deepEqual(canonicalHero('archer'), { hero: 'archer', name: '칼카스', combatKey: 'bow' });
  assert.deepEqual(canonicalHero('unknown'), { hero: 'hoplite', name: '테라몬', combatKey: 'shield' });
  assert.deepEqual(richEntityAudit('archer'), { activePlayerState: 1, playerRenderEntities: 1, playerHitTargets: 1, hero: 'archer' });
});

test('rich bridge is stateless and cannot own a loop, DOM, storage, or audio handles', () => {
  const source = readFileSync(resolve(root, 'js/rich-integration-v16.js'), 'utf8');
  assert.doesNotMatch(source, /\b(?:requestAnimationFrame|setInterval|localStorage|querySelector|AudioContext)\b/);
  const ports = createRichPorts('hoplite');
  assert.ok(Object.isFrozen(ports));
  assert.equal(ports.hero.combatKey, 'shield');
});

test('root route restores the rich title and central V15 runtime', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  for (const id of ['menuOverlay', 'launchStep', 'prepareBtn', 'councilBtn', 'codexBtn', 'settingsBtn', 'loadoutStep', 'heroSelect', 'startBtn', 'hud', 'canvas', 'warShopOverlay']) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /js\/game-v15\.js\?v=16\.0\.0/);
  assert.doesNotMatch(html, /js\/game-v16\.js/);
});
