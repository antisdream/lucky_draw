import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

// Exercise the real draw controller with a minimal view adapter, not a browser.
const [core,app]=await Promise.all(['core.js','app.js'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8')));
function controller(config={}) {
  const nodes=new Map(),frames=[];
  function node(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:true,disabled:false,checked:false,dataset:{},classList:{toggle(){},add(){},remove(){}},setAttribute(){},focus(){},scrollIntoView(){}});return nodes.get(id);}
  const values={owner:'우리 모임', 'number-start':'1','number-count':'12',people:'1',rounds:'1',duration:'3400',...config};
  for(const [key,value] of Object.entries(values))node(key).value=value;
  node('repeat').checked=!!config.repeat;node('portable-state').textContent='{}';
  const context=vm.createContext({document:{getElementById:node,querySelector:()=>node('game-panel')},window:{matchMedia:()=>({matches:false})},crypto:webcrypto,performance,setTimeout:callback=>setTimeout(callback,0),clearTimeout,requestAnimationFrame:fn=>frames.push(fn),console});
  vm.runInContext(`${core.replace(/^export /gm,'')}\n${app.slice(0,app.indexOf('// Bind controls'))}\nrenderStage=()=>{};renderResults=()=>{};burst=()=>{};tone=()=>{};updateStats=()=>{};toast=()=>{};globalThis.api={startDraw,cancelDraw,setGame:g=>state.game=g,status:()=>({running,lastResult,activeRun}),fastForward:()=>{if(activeRun){activeRun.skip=true;if(activeRun.computed)finishRun(activeRun);}}};`,context);
  return {api:context.api,nodes,finish(){while(frames.length)frames.shift()(performance.now()+10000);}};
}
for(const game of ['roulette','dart','munch','tail'])test(`${game}: 3회에 2명씩 선정한 결과와 회차 정보가 일치한다`,async()=>{
  const env=controller({people:'2',rounds:'3'});env.api.setGame(game);
  await env.api.startDraw();assert.equal(env.api.status().running,true);
  env.finish();const {lastResult,running}=env.api.status();
  assert.equal(running,false);assert.equal(lastResult.draws.length,6);assert.equal(lastResult.perRound,'2');assert.equal(lastResult.rounds,'3');assert.equal(lastResult.game,game);
  assert.equal(new Set(lastResult.draws.map(draw=>draw.id)).size,6);assert.equal(env.nodes.get('settings').disabled,false);
});
test('후보보다 많이 뽑으려는 시도는 추첨을 시작하지 않는다',async()=>{
  const env=controller({people:'13'});await env.api.startDraw();
  assert.equal(env.api.status().running,false);assert.equal(env.api.status().lastResult,null);
  assert.match(env.nodes.get('form-error').textContent,/후보를 늘리거나/);
});
test('한 명을 중복 허용하여 여러 회차에 선정할 수 있다',async()=>{
  const env=controller({'number-count':'1',people:'3',rounds:'2',repeat:true});
  await env.api.startDraw();env.finish();
  assert.equal(env.api.status().lastResult.draws.length,6);assert.ok(env.api.status().lastResult.draws.every(draw=>draw.label==='1'));
});
test('진행 중 시작을 다시 눌러도 추첨은 하나만 진행한다',async()=>{
  const env=controller();await env.api.startDraw();const run=env.api.status().activeRun;
  await env.api.startDraw();assert.equal(env.api.status().activeRun,run);env.finish();
});
test('바로 보기는 계산된 동일 결과를 즉시 공개한다',async()=>{
  const env=controller({people:'3'});await env.api.startDraw();const selected=env.api.status().activeRun.draws;
  env.api.fastForward();assert.equal(env.api.status().running,false);assert.equal(env.api.status().lastResult.draws,selected);
  env.finish();assert.equal(env.api.status().lastResult.draws,selected);
});
test('대량 추첨 계산 중 취소하면 일부 결과를 완료로 표시하지 않는다',async()=>{
  const env=controller({'number-count':'1000000',people:'1000000'});
  const pending=env.api.startDraw();assert.equal(env.api.status().running,true);
  env.api.cancelDraw();await pending;env.finish();
  assert.equal(env.api.status().running,false);assert.equal(env.api.status().lastResult,null);assert.equal(env.api.status().activeRun,null);
});
test('연출 중 취소한 뒤 재시작해도 이전 프레임이 새 추첨을 끝내지 않는다',async()=>{
  const env=controller();await env.api.startDraw();env.api.cancelDraw();
  await env.api.startDraw();const newDraw=env.api.status().activeRun.draws;env.finish();
  assert.equal(env.api.status().lastResult.draws,newDraw);assert.equal(env.api.status().running,false);
});
