import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputRoot = resolve(root, 'dist', 'Troy-Last-Phalanx-V16');
const relativeOutput = relative(root, outputRoot);
if (!relativeOutput || relativeOutput.startsWith('..')) throw new Error('package output must stay inside the project');

const manifest = JSON.parse(readFileSync(resolve(root, 'v16-release-manifest.json'), 'utf8'));
const productPaths = manifest.urls
  .filter(url => url !== './')
  .map(url => url.replace(/^\.\//, ''));
const launcherPaths = ['server.mjs', 'start-game.bat', 'THIRD_PARTY_NOTICES.md'];

if (existsSync(outputRoot)) rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

for (const path of [...productPaths, ...launcherPaths]) {
  const source = resolve(root, path);
  const target = resolve(outputRoot, path);
  const relativeTarget = relative(outputRoot, target);
  if (!relativeTarget || relativeTarget.startsWith('..')) throw new Error(`package path escapes output: ${path}`);
  if (!existsSync(source)) throw new Error(`package source missing: ${path}`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

writeFileSync(resolve(outputRoot, '게임실행안내.txt'), [
  '트로이: 최후의 팔랑크스 V16',
  '',
  '1. Windows에서 start-game.bat를 더블클릭합니다.',
  '2. 브라우저가 자동으로 열리지 않으면 배치 창에 표시된 http://127.0.0.1 주소를 엽니다.',
  '3. Node.js가 필요합니다. 설치 안내가 표시되면 https://nodejs.org 에서 LTS 버전을 설치합니다.',
  '',
  '조작: 이동 WASD/방향키 · 패링 Shift · 구르기 Space · 궁극기 Q · 일시정지 Esc',
  '이 폴더만 다른 위치로 복사해도 실행할 수 있습니다.',
].join('\r\n'), 'utf8');

console.log(`GAME_PACKAGE_READY files=${productPaths.length + launcherPaths.length + 1} path=${outputRoot}`);
