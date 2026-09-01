import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFrozenV15 } from './validate-v15-frozen.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function canonicalize(url) {
  const clean = url.split(/[?#]/, 1)[0].replace(/^\.\//, '');
  return clean === '' || clean === '.' ? 'index.html' : clean;
}

function appShellPaths(root, source = readFileSync(resolve(root, 'service-worker.js'), 'utf8')) {
  const body = source.match(/const\s+APP_SHELL\s*=\s*\[([\s\S]*?)\];/)?.[1];
  if (!body) throw new Error('service-worker.js: APP_SHELL을 찾지 못했습니다.');
  return [...body.matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
}

function localPath(root, fromFile, reference) {
  if (!reference || /^(?:[a-z]+:|#|data:)/i.test(reference)) return null;
  return relative(root, resolve(dirname(resolve(root, fromFile)), reference.split(/[?#]/, 1)[0])).replaceAll('\\', '/');
}

function collectManifestPaths(value, output, root, manifestPath) {
  if (typeof value === 'string' && /\.(?:png|webp|wav|json)$/i.test(value)) {
    const path = value.startsWith('assets/') ? value : localPath(root, manifestPath, value);
    if (path) output.add(path.replace(/^\.\//, ''));
  } else if (Array.isArray(value)) value.forEach(item => collectManifestPaths(item, output, root, manifestPath));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectManifestPaths(item, output, root, manifestPath));
}

function discoverReferencedPaths(root) {
  const found = new Set(['index.html', 'service-worker.js']);
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) { const path = localPath(root, 'index.html', match[1]); if (path) found.add(path); }
  const cssPaths = [...found].filter(path => path.endsWith('.css'));
  for (const cssPath of cssPaths) {
    const css = readFileSync(resolve(root, cssPath), 'utf8');
    for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) { const path = localPath(root, cssPath, match[1]); if (path) found.add(path); }
  }
  const moduleQueue = [...found].filter(path => path.endsWith('.js'));
  for (let index = 0; index < moduleQueue.length; index += 1) {
    const modulePath = moduleQueue[index], source = readFileSync(resolve(root, modulePath), 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g)) {
      const path = localPath(root, modulePath, match[1]);
      if (path && !found.has(path)) { found.add(path); if (path.endsWith('.js')) moduleQueue.push(path); }
    }
    for (const match of source.matchAll(/["'](assets\/[A-Za-z0-9_./-]+\.(?:png|webp|wav|json))["']/g)) found.add(match[1]);
  }
  if (found.has('manifest.webmanifest')) {
    const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.webmanifest'), 'utf8'));
    collectManifestPaths(manifest, found, root, 'manifest.webmanifest');
  }
  for (const manifestPath of [...found].filter(path => path.endsWith('.json'))) collectManifestPaths(JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8')), found, root, manifestPath);
  return [...found].sort();
}

export function compareAppShellToDiscovered(root = projectRoot, serviceWorkerSource = readFileSync(resolve(root, 'service-worker.js'), 'utf8')) {
  const appShell = new Set(appShellPaths(root, serviceWorkerSource).map(canonicalize));
  appShell.add('service-worker.js');
  const discovered = new Set(discoverReferencedPaths(root));
  return {
    missingFromAppShell: [...discovered].filter(path => !appShell.has(path)).sort(),
    extraInAppShell: [...appShell].filter(path => {
      try { readFileSync(resolve(root, path)); return false; } catch { return true; }
    }).sort(),
    discoveredPaths: [...discovered],
  };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function buildV15Closure(root = projectRoot) {
  const appShell = appShellPaths(root);
  const comparison = compareAppShellToDiscovered(root);
  const paths = [...new Set(appShell.map(canonicalize))];
  if (!paths.includes('service-worker.js')) paths.push('service-worker.js');
  const entries = paths.sort().map(path => {
    const buffer = readFileSync(resolve(root, path));
    return { path, size: buffer.byteLength, sha256: sha256(buffer) };
  });
  return {
    schema: 'troy.v15-frozen/1',
    root: 'e2e/fixtures/v15-frozen',
    appShellUrlCount: appShell.length,
    entryCount: entries.length,
    hashCount: entries.length,
    modulePaths: ['js/game.js', 'js/combat-rules-v15.js', 'js/run-rules-v15.js'],
    runtimeManifestPaths: [
      'assets/animations/troy-defense-atlas-v15.json',
      'assets/obstacles/greek-obstacles-atlas-v15.json',
      'assets/sprites/trojan-forces-atlas-v15.json',
    ],
    missingFromAppShell: comparison.missingFromAppShell,
    extraInAppShell: comparison.extraInAppShell,
    entries,
  };
}

export function freezeV15({ root = projectRoot, archiveRoot, manifestPath } = {}) {
  if (!archiveRoot || !manifestPath) throw new Error('archiveRoot와 manifestPath가 필요합니다.');
  const manifest = buildV15Closure(root);
  for (const entry of manifest.entries) {
    const destination = resolve(archiveRoot, entry.path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(root, entry.path), destination);
  }
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const option = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback; };
  const archiveRoot = resolve(projectRoot, option('--source-root', 'e2e/fixtures/v15-frozen'));
  const manifestPath = resolve(projectRoot, option('--baseline', 'baselines/v15-frozen.json'));
  if (argv.includes('--verify-only')) {
    const result = validateFrozenV15({ root: archiveRoot, manifestPath });
    console.log(`V15 freeze verify-only: PASS (${result.entryCount} files)`);
  } else {
    const manifest = freezeV15({ root: projectRoot, archiveRoot, manifestPath });
    console.log(`V15 freeze: PASS (${manifest.entryCount} files)`);
  }
}
