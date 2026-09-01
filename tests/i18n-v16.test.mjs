import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLanguage, translateText } from '../js/i18n-v16.js';

test('한국어와 영어 설정은 두 지원 언어로 정규화된다',()=>{
  assert.equal(normalizeLanguage('ko-KR'),'ko');
  assert.equal(normalizeLanguage('en-US'),'en');
  assert.equal(normalizeLanguage('fr-FR'),'en');
});

test('핵심 전투 문구와 고르곤 규칙은 영어 번역을 제공한다',()=>{
  assert.equal(translateText('패링','en'),'PARRY');
  assert.equal(translateText('고르곤의 파편','en'),'GORGON SHARD');
  assert.match(translateText('400명을 처치할 때마다 주변 일반·정예 적을 2.5초 동안 석화합니다. 보스에게는 통하지 않습니다.','en'),/400 kills/);
  assert.equal(translateText('패링','ko'),'패링');
});
