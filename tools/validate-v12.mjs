import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const game = readFileSync(resolve(root, 'js/game.js'), 'utf8');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const checks = [
  ['V13 API', game.includes('window.__TROY_V13__')],
  ['old doctrine removed', !/doctrine/i.test(game + html)],
  ['15 permanent upgrades', [...game.matchAll(/^\s{4}(might|vigor|wisdom|haste|cadence|reach|velocity|duration|amount|magnet|fortune|resolve|recovery|revival|renown):\s*\{/gm)].length === 15],
  ['all weapon paths', ['spear','sword','javelin','shield','discus','firepot','sling'].every(k => game.includes(`${k}:{`))],
  ['all weapon attacks', ['fireSpear','fireSword','fireJavelin','fireShield','fireDiscus','fireFirepot','fireSling'].every(k => game.includes(`function ${k}(`))],
  ['three-step menu', ['launchStep','metaStep','loadoutStep'].every(id=>html.includes(`id="${id}"`))],
  ['V13 title', html.includes('최후의 팔랑크스 V13')]
];
for (const file of ['battle-loop.wav','boss-loop.wav','spear.wav','sword.wav','shield.wav','pickup.wav','level.wav','evolve.wav','boss-horn.wav','revive.wav']) {
  checks.push([`audio ${file}`, statSync(resolve(root, 'assets/audio', file)).size > 1000]);
}
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
