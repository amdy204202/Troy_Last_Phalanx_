import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(import.meta.dirname, '..');
const EXPECTED = Object.freeze([
  ['shore','shore-0',25,1], ['plain','plain-1',30,1], ['plain','plain-2',35,1], ['city','city-3',40,1],
  ['city','city-4',45,1], ['city','city-5',50,1], ['city','city-6',60,1], ['city','endless-{rotation}',60,1],
]);

export function validateBattlefieldManifest(manifest) {
  if (Object.keys(manifest.packages ?? {}).length !== 3) throw new Error('package count must be 3');
  if (manifest.stages?.length !== 8) throw new Error('stage count must be 8');
  manifest.stages.forEach((stage,index) => {
    const [packageId, objectiveId, reward, shopCount] = EXPECTED[index];
    for (const [field, expected] of Object.entries({ stage: index, packageId, objectiveId, reward, shopCount })) if (stage[field] !== expected) throw new Error(`stage ${index} ${field}: expected=${expected} actual=${stage[field]}`);
  });
  return { packages: 3, stages: 8, objectiveShops: manifest.stages.reduce((sum,stage) => sum + stage.shopCount, 0) };
}

const FORBIDDEN = [['Date.now',/\bDate\.now\s*\(/g],['performance.now',/\bperformance\.now\s*\(/g],['Math.random',/\bMath\.random\s*\(/g],['DOM',/\b(?:window|document)\s*\./g],['timer',/\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/g],['audio',/\b(?:Audio|AudioContext)\s*\(/g]];
export function validatePureCampaignSources(root = projectRoot, overrides = null) {
  const paths = ['js/battlefield-rules-v16.js','js/objective-rules-v16.js','js/war-shop-rules-v16.js','js/save-migration-v16.js'];
  const sources = overrides ?? Object.fromEntries(paths.map(path => [path, readFileSync(resolve(root,path),'utf8')]));
  const failures = [];
  for (const [path,source] of Object.entries(sources)) for (const [name,pattern] of FORBIDDEN) { if (pattern.test(source)) failures.push(`${path}: ${name}`); pattern.lastIndex = 0; }
  if (failures.length) throw new Error(failures.join('\n'));
  return { forbiddenCalls: 0 };
}

export function validateCampaignProject(root = projectRoot, options = {}) {
  const manifest = validateBattlefieldManifest(JSON.parse(readFileSync(resolve(root,'assets/battlefields/troy-battlefields-v16.json'),'utf8')));
  const reducers = validatePureCampaignSources(root);
  const live = readFileSync(resolve(root,'index.html'),'utf8'), staged = readFileSync(resolve(root,'index-v16.html'),'utf8');
  const shell = readFileSync(resolve(root,'js/game-v16.js'),'utf8'), adapter = readFileSync(resolve(root,'js/campaign-adapter-v16.js'),'utf8');
  if (!/js\/game-v15\.js\?v=16\.0\.0/.test(live) || /js\/game-v16\.js/.test(live) || !/id="menuOverlay"/.test(live)) throw new Error('final live route must be rich V16');
  if (!/campaign-adapter-v16/.test(shell) || !/registerCampaign\(adapter\)/.test(adapter) || !/js\/game-v16\.js/.test(staged)) throw new Error('campaign registration seam missing');
  const frozenRoot = options.frozenRoot ?? resolve(root, 'e2e/fixtures/v15-frozen');
  const frozen = readFileSync(resolve(frozenRoot, 'index.html'), 'utf8');
  if (!/js\/game-v15\.js/.test(frozen) || /js\/game-v16\.js/.test(frozen)) throw new Error('frozen route must remain V15');
  return { packages: manifest.packages, stages: manifest.stages, forbiddenCalls: reducers.forbiddenCalls, liveRoute: 'rich', frozenRoute: 'v15', campaignRoute: 'tech-registered' };
}

function cliOption(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const argv = process.argv.slice(2), root = resolve(cliOption(argv, '--root', projectRoot));
    const result = validateCampaignProject(root, { route: cliOption(argv, '--route', 'final'), frozenRoot: resolve(cliOption(argv, '--frozen-root', resolve(root, 'e2e/fixtures/v15-frozen'))) });
    console.log(`V16 campaign validator: PASS (packages=${result.packages}, stages=${result.stages}, forbidden=${result.forbiddenCalls}, route=${result.campaignRoute})`);
  }
  catch (error) { console.error(`V16 campaign validator: FAIL\n${error.message}`); process.exitCode = 1; }
}
