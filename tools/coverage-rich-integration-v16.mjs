import { createReadStream, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const OWNER = 'SPEC-TROY-RICH-INTEGRATION-020';
export const RICH_COVERAGE_FILES = Object.freeze([
  'js/attack-intent-v16.js', 'js/audio-adapter-v16.js', 'js/audio-director-v16.js',
  'js/battlefield-rules-v16.js', 'js/boss-fsm-v16.js', 'js/defense-doctrine-v16.js',
  'js/objective-rules-v16.js', 'js/replay-v16.js',
  'js/rich-integration-v16.js', 'js/save-migration-v16.js', 'js/war-shop-rules-v16.js',
]);
export const LEGACY_JOURNEY_FILES = Object.freeze(['js/game.js']);
const LEGACY_OUTCOME_IDS = Object.freeze([
  'LEGACY-BOOT-SUCCESS', 'LEGACY-BOSS-SUCCESS', 'LEGACY-DEFENSE-SUCCESS', 'LEGACY-GROWTH-SUCCESS',
  'LEGACY-IO-FAILURE', 'LEGACY-LIFECYCLE-TRANSITION', 'LEGACY-SHOP-FAILURE', 'LEGACY-SHOP-SUCCESS',
]);

function mismatch(pointer, expected, actual) {
  throw new Error(`RICH_COVERAGE_CONTRACT_MISMATCH: ${pointer} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}
export function buildCoverageContract() {
  return {
    schemaVersion: 2, ownerSpec: OWNER, strictInclude: [...RICH_COVERAGE_FILES], legacyJourneyInclude: [...LEGACY_JOURNEY_FILES], exclusions: [],
    thresholds: { strict: { branches: 90, functions: 90, lines: 90, statements: 90 } },
    legacyBaseline: { observedLines: 1338, totalLines: 2119, lineRate: 63.142992, evidence: 'progress.md §E.2 AC-015' },
    legacyOutcomeIds: [...LEGACY_OUTCOME_IDS], sources: ['chromium-v8', 'node-v8'],
  };
}
export function verifyCoverageContract(contract) {
  const expected = buildCoverageContract();
  const keys = Object.keys(contract).sort(), expectedKeys = Object.keys(expected).sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) mismatch('/', expectedKeys, keys);
  for (const key of expectedKeys) if (JSON.stringify(contract[key]) !== JSON.stringify(expected[key])) mismatch(`/${key}`, expected[key], contract[key]);
  return { strictFiles: contract.strictInclude.length, legacyFiles: contract.legacyJourneyInclude.length, exclusions: contract.exclusions.length };
}
function percent(covered,total){return total?covered/total*100:0}
function istanbulMetrics(entry){if(!entry)return{statements:[0,0],branches:[0,0],functions:[0,0],lines:[0,0]};const pairs=values=>[values.filter(value=>value>0).length,values.length],statements=pairs(Object.values(entry.s||{})),functions=pairs(Object.values(entry.f||{})),branchValues=Object.values(entry.b||{}).flat(),branches=pairs(branchValues),lineHits=new Map();for(const[id,count]of Object.entries(entry.s||{})){const line=entry.statementMap?.[id]?.start?.line;if(line)lineHits.set(line,(lineHits.get(line)||0)+count)}return{statements,branches,functions,lines:pairs([...lineHits.values()])}}
function chromiumMetrics(entry,source){if(!entry)return{statements:[0,0],branches:[0,0],functions:[0,0],lines:[0,0]};const starts=[0];for(let index=0;index<source.length;index++)if(source[index]==='\n')starts.push(index+1);const ranges=entry.functions.flatMap(fn=>fn.ranges),covered=new Set(),executable=new Set();for(let line=0;line<starts.length;line++){const offset=starts[line],matches=ranges.filter(range=>offset>=range.startOffset&&offset<range.endOffset).sort((a,b)=>(a.endOffset-a.startOffset)-(b.endOffset-b.startOffset));if(matches.length){executable.add(line+1);if(matches[0].count>0)covered.add(line+1)}}const hitFunctions=entry.functions.filter(fn=>fn.ranges.some(range=>range.count>0)).length;return{statements:[covered.size,executable.size],branches:[0,0],functions:[hitFunctions,entry.functions.length],lines:[covered.size,executable.size]}}
function combine(a,b){return Object.fromEntries(['statements','branches','functions','lines'].map(key=>[key,[a[key][0]+b[key][0],a[key][1]+b[key][1]]]))}
async function collectCoverage(root){
  const reportDir=mkdtempSync(resolve(tmpdir(),'troy-v16-coverage-')),c8=resolve(root,'node_modules/c8/bin/c8.js'),tests=readdirSync(resolve(root,'tests')).filter(name=>/^(?:v16-(?:combat|campaign|siege|rich)|game-run-v15).*\.test\.mjs$/.test(name)).map(name=>`tests/${name}`);
  const coverageFiles=[...RICH_COVERAGE_FILES,...LEGACY_JOURNEY_FILES],args=[c8,'--reporter=json',`--reports-dir=${reportDir}`,...coverageFiles.flatMap(file=>[`--include=${file}`]),'node','--test',...tests],nodeRun=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',windowsHide:true});if(nodeRun.status!==0)throw new Error(`RICH_COVERAGE_NODE_FAILED: ${nodeRun.stderr||nodeRun.stdout}`);
  const nodeReport=JSON.parse(readFileSync(resolve(reportDir,'coverage-final.json'),'utf8')),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.wav':'audio/wav'},server=createServer((request,response)=>{const path=resolve(root,new URL(request.url,'http://127.0.0.1').pathname.slice(1)||'index.html');try{if(!statSync(path).isFile())throw 0;response.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');createReadStream(path).pipe(response)}catch{response.statusCode=404;response.end()}});await new Promise((ok,bad)=>server.listen(0,'127.0.0.1',error=>error?bad(error):ok()));
  const browser=await chromium.launch({headless:true}),page=await browser.newPage();await page.coverage.startJSCoverage({resetOnNavigation:false});await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await page.waitForFunction(()=>window.__TROY_BOOT__?.status==='ready');await page.click('#prepareBtn');await page.click('#startBtn');for(;;){const state=await page.evaluate(()=>window.__TROY_RICH_TEST__.snapshot());if(state.fixedTick>=600)break;const choice=page.locator('#choiceCards button:visible:enabled').first();if(await choice.count())await choice.click();else await page.evaluate(count=>window.__TROY_RICH_TEST__.advanceFixedTicks(count),Math.min(60,600-state.fixedTick))}const browserReport=await page.coverage.stopJSCoverage();await browser.close();await new Promise(ok=>server.close(ok));
  const files={};for(const file of coverageFiles){const absolute=resolve(root,file),nodeEntry=nodeReport[absolute]||nodeReport[absolute.replaceAll('\\','/')],browserEntry=browserReport.find(entry=>new URL(entry.url).pathname.replace(/^\//,'')===file),source=readFileSync(absolute,'utf8');files[file]=combine(istanbulMetrics(nodeEntry),chromiumMetrics(browserEntry,source))}rmSync(reportDir,{recursive:true,force:true});return files;
}
function arg(name, fallback) { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : fallback; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifestPath = resolve(arg('--manifest', 'baselines/v16-rich-coverage.json'));
  try {
    if (process.argv.includes('--create-contract')) {
      if (existsSync(manifestPath)) mismatch('/', 'absent before one-time create', 'present');
      const contract = buildCoverageContract();
      writeFileSync(manifestPath, `${JSON.stringify(contract, null, 2)}\n`);
      console.log(`V16 rich coverage contract: CREATED (strictFiles=${contract.strictInclude.length}, legacyFiles=${contract.legacyJourneyInclude.length})`);
    } else if (process.argv.includes('--verify-only')) {
      const result = verifyCoverageContract(JSON.parse(readFileSync(manifestPath, 'utf8')));
      console.log(`V16 rich coverage contract: PASS (strictFiles=${result.strictFiles}, legacyFiles=${result.legacyFiles}, exclusions=${result.exclusions})`);
    } else {
      const contract=JSON.parse(readFileSync(manifestPath,'utf8'));verifyCoverageContract(contract);const files=await collectCoverage(resolve(manifestPath,'../..'));let failed=false;for(const[file,metrics]of Object.entries(files)){const summary=Object.fromEntries(Object.entries(metrics).map(([key,[covered,total]])=>[key,{covered,total,percent:total?Number(percent(covered,total).toFixed(2)):'N/A'}]));console.log(`${file} ${JSON.stringify(summary)}`);if(contract.strictInclude.includes(file)&&Object.entries(summary).some(([key,value])=>value.percent!=='N/A'&&value.percent<contract.thresholds.strict[key]))failed=true;if(file==='js/game.js'&&(summary.lines.covered<contract.legacyBaseline.observedLines||summary.lines.percent<contract.legacyBaseline.lineRate))failed=true}if(failed)throw new Error('RICH_COVERAGE_THRESHOLD_FAILED: actual Node V8 + Chromium coverage is below contract');console.log(`통합 coverage: PASS (strictFiles=${contract.strictInclude.length}, journeyFiles=${contract.legacyJourneyInclude.length})`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
