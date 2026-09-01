import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { validateAtlasBuffer, validateDefenseManifest, validateDefensePixels,validateExternalSpriteBuffer } from '../tools/validate-v15.mjs';

test('malformed manifest는 파일과 JSON 원인을 보고한다', () => {
  assert.throws(() => validateDefenseManifest('{bad json', 'broken.json'), /broken\.json.*JSON/);
});

test('셀 가장자리가 모두 불투명한 atlas는 셀 위치와 알파 원인을 보고한다', () => {
  const png = new PNG({ width: 8, height: 8 });
  png.data.fill(255);
  const manifest = { grid: { columns: 1, rows: 1 }, heroes: {} };
  assert.throws(() => validateAtlasBuffer(PNG.sync.write(png), manifest, 'opaque.png'), /opaque\.png.*cell\(0,0\).*투명/);
});

test('방어 manifest는 세 영웅과 clip 단계·활성 프레임을 요구한다', () => {
  const incomplete = JSON.stringify({ grid: { columns: 4, rows: 6 }, heroes: { telamon: { clips: {} } } });
  assert.throws(() => validateDefenseManifest(incomplete, 'defense.json'), /achileon|calchas|parry|dodge/);
});

test('서로 다른 index라도 픽셀이 같은 방어 프레임 세 개는 거부한다',()=>{
  const png=new PNG({width:12,height:4});for(let cell=0;cell<3;cell++){const offset=((1*12)+(cell*4+1))*4;png.data[offset]=210;png.data[offset+1]=160;png.data[offset+2]=90;png.data[offset+3]=255}
  const clip=action=>({frames:[0,1,2],hitActiveFrames:[1],phases:action==='parry'?{startup:[0],active:[1],success:[2],recovery:[0]}:{startup:[0],active:[1],recovery:[2]}}),hero={clips:{parry:clip('parry'),dodge:clip('dodge')}},manifest={grid:{columns:3,rows:1},heroes:{telamon:hero,achileon:hero,calchas:hero}};
  assert.throws(()=>validateDefensePixels(PNG.sync.write(png),manifest,'duplicate.png'),/동일한 픽셀/);
});

test('external sprite는 비어 있지 않은 최소 2px 투명 여백을 요구한다',()=>{
  const png=new PNG({width:8,height:8});const offset=((1*8)+1)*4;png.data[offset]=255;png.data[offset+3]=255;
  assert.throws(()=>validateExternalSpriteBuffer(PNG.sync.write(png),'tight.png',2),/tight\.png.*최소 투명 여백/);
  const valid=new PNG({width:8,height:8});const validOffset=((3*8)+3)*4;valid.data[validOffset]=255;valid.data[validOffset+3]=255;
  assert.doesNotThrow(()=>validateExternalSpriteBuffer(PNG.sync.write(valid),'valid.png',2));
});
