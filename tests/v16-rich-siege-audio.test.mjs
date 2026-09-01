import test from 'node:test';
import assert from 'node:assert/strict';

import { createAudioAdapter } from '../js/audio-adapter-v16.js';

function fakeAudio() {
  const sources = [];
  class Context {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect() {} }; }
    createBufferSource() { const source = { loop: false, connect() {}, start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } }; sources.push(source); return source; }
    decodeAudioData() { return Promise.resolve({}); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  return { Context, fetchImpl, sources };
}

test('audio adapter pauses, resumes and stops every loop/source without throwing', async () => {
  const fake = fakeAudio();
  const adapter = createAudioAdapter({ Context: fake.Context, fetchImpl: fake.fetchImpl, storage: null });
  adapter.startBattlefield('shore');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await adapter.pause();
  assert.equal(adapter.snapshot().contextState, 'suspended');
  await adapter.resume();
  assert.equal(adapter.snapshot().contextState, 'running');
  await adapter.stop({ close: true });
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.activeSources, 0);
  assert.deepEqual(snapshot.activeLoops, []);
  assert.equal(snapshot.contextState, 'closed');
  assert.ok(fake.sources.every((source) => source.stopped));
});
