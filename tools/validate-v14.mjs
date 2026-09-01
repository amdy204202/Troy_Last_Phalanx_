import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const game = readFileSync(resolve(root, 'js/game-v14.js'), 'utf8');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'css/game.css'), 'utf8');
const checks = [
  ['V14 API and audit', game.includes('window.__TROY_V14__') && game.includes('audit:runtimeAudit')],
  ['V13 save migration', game.includes('troy_last_phalanx_v13_meta') && game.includes('schemaVersion:14')],
  ['save recovery controls', ['restoreSaveBtn','resetSaveBtn'].every(id=>html.includes(`id="${id}"`))],
  ['adaptive performance telemetry', ['recordFrame','p99Ms','onePercentLow','downgrades'].every(k=>game.includes(k))],
  ['choice intelligence', game.includes('choiceIntel') && game.includes('합성 준비')],
  ['boss clock pause', game.includes('if(!game.boss||game.boss.dead)game.time += dt') && game.includes('bossClockPaused:!!game.boss')],
  ['survivor opening pressure', game.includes('i < 12') && game.includes('rand(300, 220)') && game.includes('survivalSpawnRate')],
  ['tactical waves reinforce normal spawns', game.includes('(game.waveBurst > 0 ? 1.45 : 1)') && game.includes('game.waveCd = rand(22, 16)')],
  ['chests prioritize ready weapon relic fusions', ['readyFusions','evolveFusion','openChest','readyFusions()[0]'].every(k=>game.includes(k)) && game.includes("else if (q.kind === 'chest') openChest();")],
  ['fusion readiness has no automatic mutation', /function checkFusions\(\) \{\s*return readyFusions\(\);\s*\}/.test(game)],
  ['rare combat magnet drop', game.includes("kind: 'magnet'") && game.includes('.0025 * game.player.luck')],
  ['xp pickups have tier glow and absorption trail', ['xpPickupStyle','absorptionTrail','game.streak-1)*.2'].every(k=>game.includes(k))],
  ['final weapon evolution is chest gated', !game.includes("pool.push({key:`evo-${k}-${evo.id}`")],
  ['fused build label takes priority', game.includes("fused?FUSIONS[k].name:evo?.name||i.name")],
  ['full reroll excludes prior three', game.includes('new Set(game.currentChoices.map(x=>x.key))') && game.includes('!previous.has(x.key)')],
  ['choice input delay', game.includes('choiceReadyAt=performance.now()+260')],
  ['explicit rarity labels', ['일반','희귀','영웅','신화'].every(label=>html.includes(label)) && game.includes('RARITY_INFO')],
  ['unused choice controls removed', !html.includes('lockChoiceBtn') && !html.includes('skipChoiceBtn') && !game.includes('lockedChoice')],
  ['solid destructible obstacles', game.includes('damageObstacle') && game.includes('o.solid') && game.includes('greek-obstacles-atlas-v14.png')],
  ['wide persistent sector map', ['SECTOR_SIZE=960','worldSectors:new Map()','syncWorldSectors','persistent:true','전장 구획'].every(k=>game.includes(k))],
  ['generated atlases wired', ['greek-heroes-atlas-v14.png','trojan-forces-atlas-v14.png','greek-obstacles-atlas-v14.png'].every(file=>game.includes(file))],
  ['female Calchas and independent weapon art', ['calchas-female-atlas-v14.png','calchas-female-v14.png','greek-spear-v14.png','greek-sword-v14.png','greek-javelin-v14.png','greek-shield-v14.png','greek-discus-v14.png','greek-firepot-v14.png','greek-sling-v14.png','weaponSpriteHtml'].every(file=>game.includes(file)) && !css.includes('background-size:700%')],
  ['destroyed obstacles removed from their sector', game.includes('sector.props=sector.props.filter(prop=>prop!==o)') && game.includes('game.obstacles=game.obstacles.filter(prop=>prop!==o&&!prop.dead)') && game.includes('if(o.dead)continue')],
  ['boss phase HUD', ['bossPhaseText','bossHintText','bossPatternText'].every(id=>html.includes(`id="${id}"`))],
  ['hero trait and ultimate preview', game.includes('heroTrait') && game.includes('heroUltimate')],
  ['old doctrine removed', !/doctrine/i.test(game + html)],
  ['15 permanent upgrades', [...game.matchAll(/^\s{4}(might|vigor|wisdom|haste|cadence|reach|velocity|duration|amount|magnet|fortune|resolve|recovery|revival|renown):\s*\{/gm)].length === 15],
  ['12 weapon paths', ['spear','sword','javelin','shield','discus','firepot','sling','bow','flail','thunder','caltrops','ram'].every(k => game.includes(`${k}:{`))],
  ['12 weapon attacks', ['fireSpear','fireSword','fireJavelin','fireShield','fireDiscus','fireFirepot','fireSling','fireBow','fireFlail','fireThunder','fireCaltrops','fireRam'].every(k => game.includes(`function ${k}(`))],
  ['19 regular and elite enemy roles', ['cavalry','axeman','lancer','medic','firearcher','netter','giant','horncaller','ghost','engineer','amazonrider','assassin'].every(k=>game.includes(`${k}:`))],
  ['twin-stick aim', game.includes('pad.axes[2]') && game.includes('manualAim')],
  ['three-step menu', ['launchStep','metaStep','loadoutStep'].every(id=>html.includes(`id="${id}"`))],
  ['V14 title', html.includes('최후의 팔랑크스 V14')]
];
for (const file of ['battle-loop.wav','boss-loop.wav','spear.wav','sword.wav','shield.wav','pickup.wav','level.wav','evolve.wav','boss-horn.wav','revive.wav']) {
  checks.push([`audio ${file}`, statSync(resolve(root, 'assets/audio', file)).size > 1000]);
}
for (const file of ['animations/greek-heroes-atlas-v14.png','sprites/trojan-forces-atlas-v14.png','obstacles/greek-obstacles-atlas-v14.png']) {
  checks.push([`generated art ${file}`, statSync(resolve(root, 'assets', file)).size > 10000]);
}
for (const file of ['animations/calchas-female-atlas-v14.png','heroes/calchas-female-v14.png','weapons/greek-spear-v14.png','weapons/greek-sword-v14.png','weapons/greek-javelin-v14.png','weapons/greek-shield-v14.png','weapons/greek-discus-v14.png','weapons/greek-firepot-v14.png','weapons/greek-sling-v14.png']) {
  checks.push([`new art ${file}`, statSync(resolve(root, 'assets', file)).size > 10000]);
}
for (const file of ['sprites/trojan-reinforcements-atlas-v14.png','weapons/greek-arsenal-atlas-v14.png','relics/trojan-relics-atlas-v14.png']) checks.push([`expanded generated art ${file}`,statSync(resolve(root,'assets',file)).size>100000]);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
