import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

test('one canonical root runtime replaces the removed prototype routes', () => {
  const live = readFileSync(resolve(root, 'index.html'), 'utf8');
  const frozen = readFileSync(resolve(root, 'e2e/fixtures/v15-frozen/index.html'), 'utf8');
  assert.match(live, /js\/game\.js\?v=16\.0\.0/);
  assert.doesNotMatch(live, /js\/game-v\d+\.js/);
  assert.deepEqual(readdirSync(root).filter(name=>/^index(?:-v\d+)?\.html$/.test(name)),['index.html']);
  assert.deepEqual(readdirSync(resolve(root,'js')).filter(name=>/^game(?:-v\d+)?\.js$/.test(name)),['game.js']);
  assert.match(frozen, /js\/game-v\d+\.js/);
});

test('canonical runtime keeps keyboard defense and one-player verification seams', () => {
  const game = readFileSync(resolve(root, 'js/game.js'), 'utf8');
  assert.match(game, /allowedControls=new Set\(\['KeyW','KeyA','KeyS','KeyD'/);
  assert.match(game, /'ShiftLeft','ShiftRight','Space'/);
  assert.match(game, /window\.__TROY_RICH_TEST__/);
  assert.match(game, /playerRenderEntities:1/);
});
