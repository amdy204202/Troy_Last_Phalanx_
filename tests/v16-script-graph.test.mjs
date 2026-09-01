import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateScriptGraph } from '../tools/validate-v16.mjs';
const root=resolve(import.meta.dirname,'..');
test('package script call graph has zero executable cycles',()=>{assert.deepEqual(validateScriptGraph(root),{cycles:0});});
test('script graph reports a direct aggregate recursion',()=>{const packageJson=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));packageJson.scripts.test='npm run test:v15-frozen';packageJson.scripts['test:v15-frozen']='npm test';assert.throws(()=>validateScriptGraph(root,{packageJson}),/cycle.*test -> test:v15-frozen -> test/i);});
