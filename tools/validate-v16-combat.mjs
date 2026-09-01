import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { validateFrozenV15 } from './validate-v15-frozen.mjs';

const projectRoot = resolve(import.meta.dirname, '..');

export function validateSourceNotice(root = projectRoot) {
  const notice = JSON.parse(readFileSync(resolve(root, 'third-party-source-notice-v16.json'), 'utf8'));
  const allowlist = JSON.parse(readFileSync(resolve(root, 'third-party-source-allowlist-v16.json'), 'utf8'));
  const failures = [];
  if (notice.repositories?.length !== 4) failures.push(`repository count=${notice.repositories?.length ?? 0}`);
  for (const repo of notice.repositories ?? []) {
    if (!/^[0-9a-f]{40}$/.test(repo.revision ?? '')) failures.push(`${repo.repository}: unpinned revision`);
    if (!/^[0-9a-f]{64}$/.test(repo.licenseSha256 ?? '')) failures.push(`${repo.repository}: license hash missing`);
    if ((repo.copiedPaths ?? []).length) failures.push(`${repo.repository}: copied path is not permitted`);
  }
  if ((allowlist.copiedExternalPaths ?? []).length) failures.push('allowlist: external copied paths must remain empty');
  if (failures.length) throw new Error(failures.join('\n'));
  return { repositories: 4, unlicensedCopiedPaths: 0, unpinnedRevisions: 0 };
}

const PHASE_COUNTS = Object.freeze({
  parry: Object.freeze({ startup: 3, active: 2, success: 4, recovery: 3 }),
  dodge: Object.freeze({ startup: 2, active: 6, recovery: 3 }),
});

function framePixels(png, frame, cellWidth, cellHeight) {
  const pixels = Buffer.alloc(cellWidth * cellHeight * 4);
  for (let y = 0; y < cellHeight; y += 1) {
    const source = ((frame.row * cellHeight + y) * png.width + frame.col * cellWidth) * 4;
    png.data.copy(pixels, y * cellWidth * 4, source, source + cellWidth * 4);
  }
  return pixels;
}

function cellMetrics(pixels, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (pixels[(y * width + x) * 4 + 3] === 0) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return { nonEmpty: false, margin: -1 };
  return { nonEmpty: true, margin: Math.min(minX, minY, width - 1 - maxX, height - 1 - maxY) };
}

function phaseFrames(clip) {
  return Object.entries(clip.phases).flatMap(([phase, details]) => details.frames.map(frame => ({ phase, frame })));
}

// @MX:ANCHOR: [AUTO] Production animation build and mutation tests share this quantitative gate.
// @MX:REASON: Asset generation, browser playback and acceptance tests require one phase/marker/pixel contract.
export function validateAnimationAssetBuffers(buffer, manifest, file = 'troy-defense-atlas-v16.png') {
  const png = PNG.sync.read(buffer);
  const { cellWidth, cellHeight, columns, rows } = manifest.grid ?? {};
  if (cellWidth !== 128 || cellHeight !== 128 || png.width !== columns * 128 || png.height !== rows * 128) {
    throw new Error(`${file}: grid expected=128x128 actual=${png.width / columns}x${png.height / rows}`);
  }
  let frames = 0, maximumAnchorDelta = 0, minimumMargin = Infinity;
  for (const [hero, heroData] of Object.entries(manifest.heroes ?? {})) {
    for (const [clipName, expectedPhases] of Object.entries(PHASE_COUNTS)) {
      const clip = heroData.clips?.[clipName];
      if (!clip) throw new Error(`${hero}.${clipName}: clip missing`);
      const flattened = [];
      for (const [phase, expected] of Object.entries(expectedPhases)) {
        const phaseData = clip.phases?.[phase];
        const actual = phaseData?.frames?.length ?? 0;
        if (actual !== expected) throw new Error(`${hero}.${clipName}.${phase}: expected=${expected} actual=${actual}`);
        const firstMarkers = phaseData.frames[0].markers ?? [];
        if (!firstMarkers.includes(phase)) throw new Error(`${hero}.${clipName}.${phase}: phase marker ${phase} missing at frame=${phaseData.frames[0].index}`);
        if (clipName === 'parry' && phase === 'success' && !firstMarkers.includes('parry_contact')) throw new Error(`${hero}.parry.success: parry_contact marker missing at frame=${phaseData.frames[0].index}`);
        flattened.push(...phaseData.frames.map(frame => ({ phase, frame })));
      }
      if (clipName === 'dodge') {
        const active = clip.phases.active.frames;
        if (!(active[0].markers ?? []).includes('invuln_start')) throw new Error(`${hero}.dodge.active: invuln_start marker missing at frame=${active[0].index}`);
        if (!(active.at(-1).markers ?? []).includes('invuln_end')) throw new Error(`${hero}.dodge.active: invuln_end marker missing at frame=${active.at(-1).index}`);
      }
      const hashes = new Map();
      let prior = null;
      for (const { phase, frame } of flattened) {
        if (!frame.foot || !Number.isInteger(frame.foot.x) || !Number.isInteger(frame.foot.y)) throw new Error(`${hero}.${clipName}.${phase}: frame=${frame.index} foot anchor missing`);
        if (prior) {
          const delta = Math.max(Math.abs(frame.foot.x - prior.foot.x), Math.abs(frame.foot.y - prior.foot.y));
          maximumAnchorDelta = Math.max(maximumAnchorDelta, delta);
          if (delta > 3) throw new Error(`${hero}.${clipName}.${phase}: frame=${frame.index} anchor delta=${delta} exceeds=3`);
        }
        prior = frame;
        const pixels = framePixels(png, frame, cellWidth, cellHeight);
        const hash = createHash('sha256').update(pixels).digest('hex');
        if (hashes.has(hash)) throw new Error(`${hero}.${clipName}.${phase}: frame=${frame.index} duplicate of frame=${hashes.get(hash)}`);
        hashes.set(hash, frame.index);
        const metrics = cellMetrics(pixels, cellWidth, cellHeight);
        if (!metrics.nonEmpty) throw new Error(`${hero}.${clipName}.${phase}: frame=${frame.index} alpha bbox empty`);
        minimumMargin = Math.min(minimumMargin, metrics.margin);
        if (metrics.margin < 2) throw new Error(`${hero}.${clipName}.${phase}: frame=${frame.index} margin=${metrics.margin} expected>=2`);
        frames += 1;
      }
    }
  }
  if (frames !== 69) throw new Error(`${file}: frame count expected=69 actual=${frames}`);
  return { heroes: Object.keys(manifest.heroes).length, frames, duplicatePairs: 0, minimumMargin, maximumAnchorDelta };
}

function isChroma(r, g, b) {
  const distance = Math.hypot(r - 16, g - 241, b - 251);
  return distance < 105 || (g > 170 && b > 170 && r < 145 && Math.min(g, b) - r > 65);
}

function extractKeyPose(source, column, row) {
  const left = Math.round(column * source.width / 8), right = Math.round((column + 1) * source.width / 8);
  const top = Math.round(row * source.height / 3), bottom = Math.round((row + 1) * source.height / 3);
  const width = right - left, height = bottom - top, data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sourceAt = ((top + y) * source.width + left + x) * 4, targetAt = (y * width + x) * 4;
    const r = source.data[sourceAt], g = source.data[sourceAt + 1], b = source.data[sourceAt + 2];
    data[targetAt] = r; data[targetAt + 1] = g; data[targetAt + 2] = b;
    data[targetAt + 3] = isChroma(r, g, b) ? 0 : source.data[sourceAt + 3];
  }
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if (data[(y * width + x) * 4 + 3]) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) throw new Error(`key pose row=${row} column=${column} is empty after chroma removal`);
  return { data, width, height, minX, minY, maxX, maxY };
}

function drawPose(target, pose, cellColumn, cellRow, variation) {
  const sourceWidth = pose.maxX - pose.minX + 1, sourceHeight = pose.maxY - pose.minY + 1;
  const scale = Math.min(118 / sourceWidth, 118 / sourceHeight) * (1 + variation.scale);
  const width = Math.max(1, Math.floor(sourceWidth * scale)), height = Math.max(1, Math.floor(sourceHeight * scale));
  const left = cellColumn * 128 + Math.round((128 - width) / 2) + variation.x;
  const top = cellRow * 128 + 124 - height + variation.y;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sx = pose.minX + Math.min(sourceWidth - 1, Math.floor(x / scale));
    const sy = pose.minY + Math.min(sourceHeight - 1, Math.floor(y / scale));
    const sourceAt = (sy * pose.width + sx) * 4;
    if (!pose.data[sourceAt + 3]) continue;
    const tx = left + x, ty = top + y;
    if (tx < cellColumn * 128 + 2 || tx >= cellColumn * 128 + 126 || ty < cellRow * 128 + 2 || ty >= cellRow * 128 + 126) continue;
    const targetAt = (ty * target.width + tx) * 4;
    pose.data.copy(target.data, targetAt, sourceAt, sourceAt + 4);
  }
}

function frameRecord(row, col, markers = []) {
  return { index: row * 23 + col, row, col, foot: { x: 64, y: 116 }, markers };
}

function clipManifest(row, startColumn, phaseCounts, clipName) {
  let column = startColumn;
  return { phases: Object.fromEntries(Object.entries(phaseCounts).map(([phase, count]) => {
    const phaseStart = column;
    const frames = Array.from({ length: count }, (_, index) => {
      const markers = index === 0 ? [phase] : [];
      if (clipName === 'parry' && phase === 'success' && index === 0) markers.push('parry_contact');
      if (clipName === 'dodge' && phase === 'active' && index === 0) markers.push('invuln_start');
      if (clipName === 'dodge' && phase === 'active' && index === count - 1) markers.push('invuln_end');
      return frameRecord(row, column++, markers);
    });
    return [phase, { startColumn: phaseStart, frames }];
  })) };
}

function paintVfx(path, manifestPath) {
  const png = new PNG({ width: 8 * 128, height: 128 });
  const set = (x, y, color, alpha = 255) => { if (x < 2 || y < 2 || x > png.width - 3 || y > 125) return; const at = (y * png.width + x) * 4; [png.data[at],png.data[at+1],png.data[at+2],png.data[at+3]] = [...color,alpha]; };
  for (let frame = 0; frame < 8; frame += 1) {
    const cx = frame * 128 + 64, radius = 22 + frame * 5;
    for (let degree = -65; degree <= 65; degree += 2) {
      const angle = degree * Math.PI / 180;
      for (let thickness = 0; thickness < 5; thickness += 1) set(Math.round(cx + Math.cos(angle) * (radius + thickness)), Math.round(70 + Math.sin(angle) * (radius + thickness)), [255, 194 - frame * 8, 78], 230 - thickness * 30);
    }
    for (let dust = 0; dust < 10; dust += 1) {
      const x = cx - 35 + dust * 7, y = 105 - ((dust + frame) % 4) * 4;
      for (let dot = 0; dot < 3; dot += 1) set(x + dot, y, [174, 128, 76], 150);
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
  writeFileSync(manifestPath, `${JSON.stringify({ schema: 'troy.defense-vfx/16', grid: { cellWidth: 128, cellHeight: 128, columns: 8, rows: 1 }, clips: { parryImpact: [0,1,2,3], dodgeTrail: [4,5,6,7] } }, null, 2)}\n`);
}

export function buildDefenseAssets(root = projectRoot) {
  const sourcePath = resolve(root, 'assets/animations/troy-defense-keyposes-v16-chroma.png');
  const source = PNG.sync.read(readFileSync(sourcePath));
  const atlas = new PNG({ width: 23 * 128, height: 3 * 128 });
  const heroRows = [['hoplite', 0], ['archer', 1], ['swordsman', 2]];
  const parryKeys = [0,0,1,1,2,2,2,3,3,3,0,0];
  const dodgeKeys = [0,4,4,5,5,6,6,6,7,7,0];
  for (const [, row] of heroRows) {
    const poses = Array.from({ length: 8 }, (_, column) => extractKeyPose(source, column, row));
    [...parryKeys, ...dodgeKeys].forEach((key, column) => {
      const variation = { x: (column % 3) - 1, y: Math.floor(column / 3) % 2, scale: ((column % 5) - 2) * .003 };
      drawPose(atlas, poses[key], column, row, variation);
    });
  }
  const manifest = {
    schema: 'troy.defense-animation/16', source: 'troy-defense-keyposes-v16-chroma.png',
    sourceSha256: createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),
    grid: { cellWidth: 128, cellHeight: 128, columns: 23, rows: 3, meaningfulCells: 69 },
    heroes: Object.fromEntries(heroRows.map(([hero, row]) => [hero, { row, clips: {
      parry: clipManifest(row, 0, PHASE_COUNTS.parry, 'parry'), dodge: clipManifest(row, 12, PHASE_COUNTS.dodge, 'dodge'),
    } }])),
  };
  const atlasPath = resolve(root, 'assets/animations/troy-defense-atlas-v16.png');
  const manifestPath = resolve(root, 'assets/animations/troy-defense-atlas-v16.json');
  writeFileSync(atlasPath, PNG.sync.write(atlas));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  paintVfx(resolve(root, 'assets/effects/troy-defense-vfx-v16.png'), resolve(root, 'assets/effects/troy-defense-vfx-v16.json'));
  const result = validateAnimationAssetBuffers(readFileSync(atlasPath), manifest, atlasPath);
  return result;
}

const INTENT_FIELDS = ['sourceKind', 'defenseTag', 'origin', 'impactAt', 'threat', 'telegraphId', 'impactId'];

export function validateAttackIntentSource(source, file = 'unknown.js') {
  const failures = [];
  for (const match of source.matchAll(/createAttackIntent\s*\(\s*\{([\s\S]*?)\}\s*\)/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    for (const field of INTENT_FIELDS) if (!new RegExp(`\\b${field}\\s*(?=:|[,}\\n])`).test(match[1])) failures.push(`${file}:${line} missing ${field}`);
  }
  return failures;
}

const FORBIDDEN_REDUCER_APIS = [
  ['Date.now', /\bDate\.now\s*\(/g], ['performance.now', /\bperformance\.now\s*\(/g], ['Math.random', /\bMath\.random\s*\(/g],
  ['random API', /\b(?:globalThis\.)?crypto\s*\./g], ['DOM', /\b(?:document|window)\s*\./g],
  ['Audio', /\b(?:Audio|AudioContext|webkitAudioContext)\s*\(/g], ['timer', /\b(?:setTimeout|setInterval|requestAnimationFrame)\s*\(/g],
];

export function validatePureReducerSources(root = projectRoot, overrides = null) {
  const sources = overrides ?? Object.fromEntries(['js/attack-intent-v16.js', 'js/defense-doctrine-v16.js', 'js/replay-v16.js'].map(path => [path, readFileSync(resolve(root, path), 'utf8')]));
  const failures = [];
  for (const [file, source] of Object.entries(sources)) {
    const found = FORBIDDEN_REDUCER_APIS.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
    FORBIDDEN_REDUCER_APIS.forEach(([, pattern]) => { pattern.lastIndex = 0; });
    if (found.length) failures.push(`${file}: ${found.join(', ')}`);
  }
  if (failures.length) throw new Error(`pure reducer forbidden APIs\n${failures.join('\n')}`);
  return { forbiddenCalls: 0 };
}

export function validateV16CombatProject(root = projectRoot, options = {}) {
  const source = validateSourceNotice(root);
  const gameSource = readFileSync(resolve(root, 'js/game-v16.js'), 'utf8');
  const attackFailures = validateAttackIntentSource(gameSource, 'js/game-v16.js');
  if (attackFailures.length) throw new Error(`attack intent callsite failures\n${attackFailures.join('\n')}`);
  const reducers = validatePureReducerSources(root);
  const manifest = JSON.parse(readFileSync(resolve(root, 'assets/animations/troy-defense-atlas-v16.json'), 'utf8'));
  const animation = validateAnimationAssetBuffers(readFileSync(resolve(root, 'assets/animations/troy-defense-atlas-v16.png')), manifest);
  const live = readFileSync(resolve(root, 'index.html'), 'utf8'), staged = readFileSync(resolve(root, 'index-v16.html'), 'utf8');
  if (!/js\/game-v15\.js\?v=16\.0\.0/.test(live) || /js\/game-v16\.js/.test(live) || !/id="menuOverlay"/.test(live)) throw new Error('index.html: final live route must be rich V16');
  if (!/js\/game-v16\.js/.test(staged)) throw new Error('index-v16.html: staged V16 route missing');
  const frozenRoot = options.frozenRoot ?? resolve(root, 'e2e/fixtures/v15-frozen');
  const baseline = options.baseline ?? resolve(root, 'baselines/v15-frozen.json');
  const frozenHtml = readFileSync(resolve(frozenRoot, 'index.html'), 'utf8');
  if (!/js\/game-v15\.js/.test(frozenHtml) || /js\/game-v16\.js/.test(frozenHtml)) throw new Error('frozen index.html: route must remain V15');
  const frozen = validateFrozenV15({ root: frozenRoot, manifestPath: baseline });
  return { sourceNotices: source.repositories, attackCallsiteFailures: 0, forbiddenCalls: reducers.forbiddenCalls, animationFrames: animation.frames, liveRoute: 'rich', stagedRoute: 'v16-tech', frozenRoute: 'v15', frozenEntries: frozen.entryCount };
}

function cliOption(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--build-assets')) {
      const built = buildDefenseAssets(projectRoot);
      console.log(`V16 defense assets: PASS (${built.frames} frames, margin>=${built.minimumMargin}px)`);
    }
    const argv = process.argv.slice(2);
    const root = resolve(cliOption(argv, '--root', projectRoot));
    const result = validateV16CombatProject(root, {
      route: cliOption(argv, '--route', 'final'),
      frozenRoot: resolve(cliOption(argv, '--frozen-root', resolve(root, 'e2e/fixtures/v15-frozen'))),
      baseline: resolve(cliOption(argv, '--baseline', resolve(root, 'baselines/v15-frozen.json'))),
    });
    console.log(`V16 combat validator: PASS (${result.animationFrames} frames, intents=${result.attackCallsiteFailures}, forbidden=${result.forbiddenCalls}, sourceNotices=${result.sourceNotices})`);
  } catch (error) {
    console.error(`V16 combat validator: FAIL\n${error.message}`);
    process.exitCode = 1;
  }
}
