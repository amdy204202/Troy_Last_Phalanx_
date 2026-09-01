import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OWNER = 'SPEC-TROY-RICH-INTEGRATION-020';
const EXPECTED_ENTRY = 'index.html';
const EXPECTED_BYTES = 13302;
const EXPECTED_SHA = '070471e8279043d988ad208b5c480621ffb0ca33cd80123d709c3ab65914550e';

function digest(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function mismatch(pointer, expected, actual) {
  throw new Error(`TECH_LAB_BASELINE_MISMATCH: ${pointer} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

export function buildTechLabBaseline(root, entryPath = EXPECTED_ENTRY) {
  const bytes = readFileSync(resolve(root, entryPath));
  return { schemaVersion: 1, ownerSpec: OWNER, entryPath, byteLength: bytes.length, sha256: digest(bytes) };
}

export function verifyTechLabBaseline(root, baseline) {
  const keys = Object.keys(baseline).sort();
  const expectedKeys = ['byteLength', 'entryPath', 'ownerSpec', 'schemaVersion', 'sha256'];
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) mismatch('/', expectedKeys, keys);
  const expected = { schemaVersion: 1, ownerSpec: OWNER, entryPath: EXPECTED_ENTRY, byteLength: EXPECTED_BYTES, sha256: EXPECTED_SHA };
  for (const [key, value] of Object.entries(expected)) if (baseline[key] !== value) mismatch(`/${key}`, value, baseline[key]);
  const current = buildTechLabBaseline(root, baseline.entryPath);
  for (const key of ['byteLength', 'sha256']) if (current[key] !== baseline[key]) mismatch(`/${key}`, baseline[key], current[key]);
  return { bytes: current.byteLength, entry: current.entryPath };
}

function arg(name, fallback) { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : fallback; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(arg('--root', '.'));
  const entry = arg('--entry', EXPECTED_ENTRY);
  const baselinePath = resolve(root, arg('--baseline', 'baselines/v16-tech-lab.json'));
  try {
    if (process.argv.includes('--create')) {
      if (existsSync(baselinePath)) mismatch('/', 'absent before one-time create', 'present');
      const baseline = buildTechLabBaseline(root, entry);
      verifyTechLabBaseline(root, baseline);
      writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
      console.log(`통합 실행본 baseline: CREATED (bytes=${baseline.byteLength}, sha256=${baseline.sha256})`);
    } else if (process.argv.includes('--verify-only')) {
      const result = verifyTechLabBaseline(root, JSON.parse(readFileSync(baselinePath, 'utf8')));
      console.log(`통합 실행본 baseline: PASS (entry=${result.entry}, bytes=${result.bytes})`);
    } else mismatch('/mode', '--create|--verify-only', 'missing');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
