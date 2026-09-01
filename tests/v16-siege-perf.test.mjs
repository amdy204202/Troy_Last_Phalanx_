import test from 'node:test';
import assert from 'node:assert/strict';
import { createProtocol, evaluateRuns } from '../tools/perf-runner-v16.mjs';

test('reference protocol fixes renderer, viewport, fixture, timing and three repetitions',()=>{
 const value=createProtocol('reference');assert.deepEqual(value.chromiumArgs,['--use-gl=angle','--use-angle=swiftshader','--disable-gpu-vsync']);assert.equal(value.headless,true);assert.equal(value.rendering,'software');assert.deepEqual(value.fixture,{seed:'0x54524f593136',enemies:180,projectiles:500,particles:800,boss:'hector-p3'});assert.equal(value.warmupSeconds,30);assert.equal(value.measureSeconds,60);assert.equal(value.repetitions,3);
});
test('non-reference results are informational and excluded from gate',()=>{const value=createProtocol('non-reference');assert.equal(value.informational,true);assert.equal(value.headless,false);});
test('performance gate requires every raw run to meet all four limits',()=>{const pass={frameP99Ms:19,onePercentLowFps:51,maxAudioVoices:32,entityCapViolations:0};assert.equal(evaluateRuns([pass,pass,pass]).pass,true);assert.equal(evaluateRuns([pass,{...pass,frameP99Ms:21},pass]).pass,false);});
