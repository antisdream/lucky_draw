import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePortable,readPortableHTML} from '../src/portable.js';
import {safeJSON} from '../src/core.js';

const snapshot=()=>({version:1,config:{owner:'우리 팀 😀',mode:'manual',manual:['가','같은 이름','같은 이름','</script><img src=x onerror=alert(1)>'],csvEntries:[],game:'tail',people:'2',rounds:'1',repeat:false,duration:'1800'},lastResult:{draws:[{label:'같은 이름',id:'e:1'},{label:'가',id:'e:0'}],perRound:'2',rounds:'1',candidateCount:'4',game:'tail',owner:'우리 팀 😀',repeat:false,at:'2026-09-08T14:00:00.000Z'},resultFresh:false,view:'play'});
test('이전 버전 HTML 저장 파일의 후보와 결과를 그대로 읽는다',()=>{
  const value=snapshot();const html=`<!doctype html><script id="portable-state" type="application/json">${safeJSON(value)}</script><script>throw new Error('Never execute this')</script>`;
  assert.deepEqual(readPortableHTML(html),value);
});
test('가져온 파일의 스크립트와 이미지 코드는 해석하지 않는다',()=>{
  const value=snapshot();const html=`<img src="https://invalid.example/leak"><script>globalThis.__polluted=true</script><script type='application/json' id='portable-state'>${safeJSON(value)}</script>`;
  const parsed=readPortableHTML(html);assert.equal(parsed.config.manual[3],value.config.manual[3]);assert.equal(globalThis.__polluted,undefined);
});
test('원본 HTML, 깨진 JSON, 다른 버전은 명시적으로 거부한다',()=>{
  for(const html of ['<html>none</html>','<script id="portable-state">{broken}</script>','<script id="portable-state">{}</script>','<script id="portable-state">{"version":2,"config":{}}</script>'])assert.throws(()=>readPortableHTML(html));
});
test('후보 배열에 객체가 있으면 복원하지 않는다',()=>{
  const value=snapshot();value.config.manual=[{name:'잘못된 후보'}];assert.throws(()=>normalizePortable(value),/후보 목록/);
});
test('회차와 실제 결과 수의 불일치는 거부한다',()=>{
  const value=snapshot();value.lastResult.perRound='3';assert.throws(()=>normalizePortable(value),/일치하지/);
});
test('결과 없는 설정 파일과 큰 정수 설정을 복원한다',()=>{
  const value={version:1,config:{start:'900719925474099312345',count:'1'+'0'.repeat(100),mode:'numbers',game:'roulette'},lastResult:null};
  const parsed=normalizePortable(value);assert.equal(parsed.config.count,value.config.count);assert.equal(parsed.lastResult,null);assert.equal(parsed.view,'home');
});
test('정의하지 않은 객체 속성은 복원하지 않는다',()=>{
  const value=snapshot();value.config.onLoad='alert(1)';value.config['unexpected']='value';const parsed=normalizePortable(value);
  assert.equal(Object.hasOwn(parsed.config,'onLoad'),false);assert.equal(Object.hasOwn(parsed.config,'unexpected'),false);
});

test('HTML 내보내기와 불러오기에서 명시적인 애니메이션 선택을 유지한다',()=>{
  for(const motionMode of ['system','full','reduced']){
    const value=snapshot();value.config.motionMode=motionMode;
    const html=`<script id="portable-state" type="application/json">${safeJSON(value)}</script>`;
    assert.equal(readPortableHTML(html).config.motionMode,motionMode);
  }
});
