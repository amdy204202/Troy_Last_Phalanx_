import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

import { validateAnimationAssetBuffers } from '../tools/validate-v16-combat.mjs';

const root = resolve(import.meta.dirname, '..');
const pngPath = resolve(root, 'assets/animations/troy-defense-atlas-v16.png');
const manifestPath = resolve(root, 'assets/animations/troy-defense-atlas-v16.json');
const load = () => ({ buffer: readFileSync(pngPath), manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) });

test('three heroes declare exact 128px parry 12 and dodge 11 phase contracts', () => {
  const { buffer, manifest } = load();
  const result = validateAnimationAssetBuffers(buffer, manifest, 'production-atlas');
  assert.deepEqual({ ...result, minimumMargin: Math.min(result.minimumMargin, 2) }, { heroes: 3, frames: 69, duplicatePairs: 0, minimumMargin: 2, maximumAnchorDelta: 0 });
});

test('animation validator reports phase count, duplicate, marker, anchor and edge mutations precisely', () => {
  const { buffer, manifest } = load();
  const missingFrame = structuredClone(manifest);
  missingFrame.heroes.hoplite.clips.parry.phases.startup.frames.pop();
  assert.throws(() => validateAnimationAssetBuffers(buffer, missingFrame, 'missing-frame'), /hoplite\.parry\.startup.*expected=3.*actual=2/);

  const duplicate = structuredClone(manifest);
  duplicate.heroes.archer.clips.parry.phases.active.frames[1].index = duplicate.heroes.archer.clips.parry.phases.active.frames[0].index;
  duplicate.heroes.archer.clips.parry.phases.active.frames[1].col = duplicate.heroes.archer.clips.parry.phases.active.frames[0].col;
  assert.throws(() => validateAnimationAssetBuffers(buffer, duplicate, 'duplicate-active'), /archer\.parry\.active.*duplicate/);

  const missingMarker = structuredClone(manifest);
  missingMarker.heroes.swordsman.clips.parry.phases.success.frames[0].markers = ['success'];
  assert.throws(() => validateAnimationAssetBuffers(buffer, missingMarker, 'missing-marker'), /swordsman\.parry\.success.*parry_contact/);

  const anchor = structuredClone(manifest);
  anchor.heroes.hoplite.clips.dodge.phases.recovery.frames[1].foot.x += 4;
  assert.throws(() => validateAnimationAssetBuffers(buffer, anchor, 'anchor-delta'), /hoplite\.dodge\.recovery.*anchor delta=4/);

  const edge = PNG.sync.read(buffer);
  edge.data[3] = 255;
  assert.throws(() => validateAnimationAssetBuffers(PNG.sync.write(edge), manifest, 'edge-alpha'), /hoplite\.parry\.startup.*frame=0.*margin=0/);
});
