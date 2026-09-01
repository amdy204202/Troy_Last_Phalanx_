import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OWNER = 'SPEC-TROY-RICH-INTEGRATION-020';
const RELEASE = 'baselines/v16-rich-release.json';
const IMMUTABLE = Object.freeze([
  ['SPEC-TROY-BATTLEFIELD-017', 'assets/animations/troy-defense-atlas-v16.json', 'implemented'],
  ['SPEC-TROY-CAMPAIGN-018', 'assets/battlefields/troy-battlefields-v16.json', 'implemented'],
  ['SPEC-TROY-SIEGE-019', 'assets/audio/v16/audio-manifest.json', 'in-progress'],
  ['SPEC-TROY-SIEGE-019', 'assets/bosses/troy-boss-fsm-v16.json', 'in-progress'],
  ['SPEC-TROY-SIEGE-019', 'tools/run-playwright-v16.mjs', 'in-progress'],
  ['SPEC-TROY-BATTLEFIELD-017', 'baselines/v15-frozen.json', 'implemented'],
]);
const SHARED = Object.freeze([
  ['audio-listening-v16.json', 'SPEC-TROY-SIEGE-019', 'append'],
  ['css/game.css', 'SPEC-TROY-BATTLEFIELD-017', 'replace'],
  ['e2e/troy-siege-v16.spec.mjs', 'SPEC-TROY-SIEGE-019', 'narrow-amend'],
  ['e2e/v15-v16-upgrade.spec.mjs', 'SPEC-TROY-SIEGE-019', 'narrow-amend'],
  ['index.html', 'SPEC-TROY-BATTLEFIELD-017', 'replace'],
  ['js/attack-intent-v16.js', 'SPEC-TROY-BATTLEFIELD-017', 'narrow-amend'],
  ['js/audio-adapter-v16.js', 'SPEC-TROY-SIEGE-019', 'narrow-amend'],
  ['js/audio-director-v16.js', 'SPEC-TROY-SIEGE-019', 'narrow-amend'],
  ['js/boss-fsm-v16.js', 'SPEC-TROY-SIEGE-019', 'narrow-amend'],
  ['js/defense-doctrine-v16.js', 'SPEC-TROY-BATTLEFIELD-017', 'narrow-amend'],
  ['js/game-v15.js', 'SPEC-TROY-BATTLEFIELD-017', 'replace'],
  ['js/save-migration-v16.js', 'SPEC-TROY-CAMPAIGN-018', 'narrow-amend'],
  ['js/war-shop-rules-v16.js', 'SPEC-TROY-CAMPAIGN-018', 'narrow-amend'],
  ['manifest.webmanifest', 'SPEC-TROY-SIEGE-019', 'replace'],
  ['package.json', 'SPEC-TROY-SIEGE-019', 'replace'],
  ['playwright.config.mjs', 'SPEC-TROY-SIEGE-019', 'narrow-amend'],
  ['service-worker.js', 'SPEC-TROY-SIEGE-019', 'replace'],
  ['tools/perf-runner-v16.mjs', 'SPEC-TROY-SIEGE-019', 'narrow-amend'],
  ['tools/validate-v16-campaign.mjs', 'SPEC-TROY-CAMPAIGN-018', 'narrow-amend'],
  ['tools/validate-v16-combat.mjs', 'SPEC-TROY-BATTLEFIELD-017', 'narrow-amend'],
  ['tools/validate-v16.mjs', 'SPEC-TROY-SIEGE-019', 'narrow-amend'],
  ['v16-release-manifest.json', 'SPEC-TROY-SIEGE-019', 'replace'],
].sort((a, b) => a[0].localeCompare(b[0])));

function sha(root, path) { return createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex'); }
function digest(value){return createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex')}
function mismatch(pointer, expected, actual) { throw new Error(`HANDOFF_MANIFEST_MISMATCH: ${pointer} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`); }

export function buildHandoffManifest(root) {
  return {
    schemaVersion: 1,
    ownerSpec: OWNER,
    absorbs: ['SPEC-TROY-BATTLEFIELD-017', 'SPEC-TROY-CAMPAIGN-018', 'SPEC-TROY-SIEGE-019'],
    dependencyArtifacts: IMMUTABLE.map(([specId, path, status]) => ({ specId, path, status, sha256: sha(root, path) })).sort((a, b) => a.path.localeCompare(b.path)),
    sharedFiles: SHARED.filter(([path]) => existsSync(resolve(root, path))).map(([path, fromSpec, changeMode]) => ({ path, fromSpec, authorizedToSpec: OWNER, fromHash: sha(root, path), changeMode, releaseEvidencePath: RELEASE })),
    openDebts: [
      { id: 'audio-listening', sourceSpec: 'SPEC-TROY-SIEGE-019', priorStatus: 'FAIL', evidencePath: 'audio-listening-v16.json', closureCommand: 'npm run check:v16:listening' },
      { id: 'reference-performance', sourceSpec: 'SPEC-TROY-SIEGE-019', priorStatus: 'FAIL', evidencePath: '.moai/reports/SPEC-TROY-RICH-INTEGRATION-020/perf.json', closureCommand: 'npm run perf:v16' },
    ],
  };
}

export function verifyHandoffManifest(root, manifest, { phase = 'm0' } = {}) {
  const rootKeys = ['absorbs', 'dependencyArtifacts', 'openDebts', 'ownerSpec', 'schemaVersion', 'sharedFiles'];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(rootKeys)) mismatch('/', rootKeys, Object.keys(manifest).sort());
  if (manifest.schemaVersion !== 1) mismatch('/schemaVersion', 1, manifest.schemaVersion);
  if (manifest.ownerSpec !== OWNER) mismatch('/ownerSpec', OWNER, manifest.ownerSpec);
  if (JSON.stringify(manifest.absorbs) !== JSON.stringify(['SPEC-TROY-BATTLEFIELD-017', 'SPEC-TROY-CAMPAIGN-018', 'SPEC-TROY-SIEGE-019'])) mismatch('/absorbs', 'canonical specs', manifest.absorbs);
  const paths = manifest.sharedFiles.map((item) => item.path);
  if (new Set(paths).size !== paths.length) mismatch('/sharedFiles', 'unique leases', paths);
  for (const [index, item] of manifest.sharedFiles.entries()) {
    const keys = ['authorizedToSpec', 'changeMode', 'fromHash', 'fromSpec', 'path', 'releaseEvidencePath'];
    if (JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(keys)) mismatch(`/sharedFiles/${index}`, keys, Object.keys(item).sort());
    if (item.authorizedToSpec !== OWNER) mismatch(`/sharedFiles/${index}/authorizedToSpec`, OWNER, item.authorizedToSpec);
    if (!['replace', 'narrow-amend', 'append'].includes(item.changeMode)) mismatch(`/sharedFiles/${index}/changeMode`, 'replace|narrow-amend|append', item.changeMode);
    if (item.releaseEvidencePath !== RELEASE) mismatch(`/sharedFiles/${index}/releaseEvidencePath`, RELEASE, item.releaseEvidencePath);
  }
  for (const [index, debt] of manifest.openDebts.entries()) if (debt.priorStatus !== 'FAIL') mismatch(`/openDebts/${index}/priorStatus`, 'FAIL', debt.priorStatus);
  for (const [index, item] of manifest.dependencyArtifacts.entries()) {
    const current = sha(root, item.path);
    if (current !== item.sha256) mismatch(`/dependencyArtifacts/${index}/sha256`, item.sha256, current);
  }
  if (phase !== 'm0' && !existsSync(resolve(root, RELEASE))) mismatch('/releaseEvidence', 'present', 'missing');
  if(phase!=='m0'){
    const release=JSON.parse(readFileSync(resolve(root,RELEASE),'utf8')),releaseByPath=new Map(release.productFiles?.map(item=>[item.path,item.sha256]));
    for(const item of manifest.sharedFiles){const actual=sha(root,item.path);if(releaseByPath.get(item.path)!==actual)mismatch(`/releaseEvidence/productFiles/${item.path}`,actual,releaseByPath.get(item.path)??'missing')}
  }
  return { dependencies: manifest.dependencyArtifacts.length, sharedFiles: manifest.sharedFiles.length, openDebts: manifest.openDebts.length };
}

function recordProductHashes(root,handoffPath,releasePath){
  const handoffRaw=readFileSync(handoffPath,'utf8'),handoff=JSON.parse(handoffRaw),productFiles=handoff.sharedFiles.map(item=>({path:item.path,sha256:sha(root,item.path)})).sort((a,b)=>a.path.localeCompare(b.path)),productSetSha256=digest(productFiles),prior=existsSync(releasePath)?JSON.parse(readFileSync(releasePath,'utf8')):null;
  if(prior?.status==='sealed')throw new Error('RELEASE_CANDIDATE_HISTORY_MISMATCH: sealed candidate is immutable');if(prior&&digest(prior.productFiles)===productSetSha256)throw new Error('RELEASE_CANDIDATE_HISTORY_MISMATCH: product set has not changed');
  const candidateId=`rich-${productSetSha256.slice(0,16)}`,release={schemaVersion:1,ownerSpec:OWNER,handoffSha256:digest(handoffRaw),status:'candidate',candidateId,productFiles,commands:[],history:Array.isArray(prior?.history)?prior.history:[],sealedProductSetSha256:null};writeFileSync(releasePath,`${JSON.stringify(release,null,2)}\n`);return{candidateId,files:productFiles.length,productSetSha256};
}

function arg(name, fallback) { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : fallback; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(arg('--root', '.')), output = resolve(root, arg('--output', 'baselines/spec-020-handoff.json'));
  try {
    if(process.argv.includes('--record-product-hashes')){
      const releasePath=resolve(root,arg('--release-output','baselines/v16-rich-release.json')),result=recordProductHashes(root,output,releasePath);console.log(`V16 rich release: CANDIDATE (id=${result.candidateId}, files=${result.files}, productSetSha256=${result.productSetSha256})`);
    } else if (process.argv.includes('--create')) {
      if (existsSync(output)) mismatch('/', 'absent before one-time create', 'present');
      const manifest = buildHandoffManifest(root); verifyHandoffManifest(root, manifest);
      writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(`V16 rich handoff: CREATED (dependencies=${manifest.dependencyArtifacts.length}, sharedFiles=${manifest.sharedFiles.length}, openDebts=2)`);
    } else if (process.argv.includes('--verify-only')) {
      const phase = arg('--phase', 'final');
      const result = verifyHandoffManifest(root, JSON.parse(readFileSync(output, 'utf8')), { phase });
      console.log(`V16 rich handoff: PASS (phase=${phase}, dependencies=${result.dependencies}, sharedFiles=${result.sharedFiles}, openDebts=${result.openDebts})`);
    } else mismatch('/mode', '--create|--verify-only', 'unsupported');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
