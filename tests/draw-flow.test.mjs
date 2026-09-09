import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

// Exercise the real draw controller with a minimal view adapter, not a browser.
const [core,app,gestures,motion,portable]=await Promise.all(['core.js','app.js','gestures.js','motion.js','portable.js'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8')));
function controller(config={},platform={}) {
  const nodes=new Map(),frames=[];
  let renders=0;
  function node(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:true,disabled:false,checked:false,dataset:{},classList:{toggle(){},add(){},remove(){}},setAttribute(){},focus(){},scrollIntoView(){},getBoundingClientRect(){return {width:600,height:360,left:0,top:0}},hasPointerCapture(){return false},releasePointerCapture(){},setPointerCapture(){}});return nodes.get(id);}
  const values={owner:'우리 모임', 'number-start':'1','number-count':'12',people:'1',rounds:'1',duration:'3400',...config};
  for(const [key,value] of Object.entries(values))node(key).value=value;
  node('repeat').checked=!!config.repeat;node('portable-state').textContent=JSON.stringify(platform.snapshot||{});
  const storage=platform.storage||new Map();
  const context=vm.createContext({document:{body:{dataset:{}},getElementById:node,querySelector:()=>node('game-panel')},window:{matchMedia:()=>({matches:!!platform.systemReduced})},location:{protocol:'https:',hostname:'appassets.androidplatform.net'},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},crypto:webcrypto,performance,setTimeout:callback=>setTimeout(callback,0),clearTimeout,requestAnimationFrame:fn=>frames.push(fn),recordRender:()=>renders++,console});
  vm.runInContext(`${core.replace(/^export /gm,'')}\n${gestures.replace(/^export /gm,'')}\n${motion.replace(/^export /gm,'')}\n${portable.replace(/^export /gm,'')}\n${app.slice(0,app.indexOf('// Bind controls'))}\nrenderStage=recordRender;renderResults=()=>{};burst=()=>{};tone=()=>{};updateStats=()=>{};toast=()=>{};globalThis.api={startDraw,cancelDraw,assistGesture,pointerDown,pointerEnd,changeMotionMode,setGame:g=>state.game=g,motion:()=>({mode:state.motionMode,reduced:reducedMotion()}),status:()=>({running,lastResult,activeRun}),fastForward:()=>{if(activeRun){activeRun.skip=true;if(activeRun.computed)finishRun(activeRun);}}};`,context);
  return {api:context.api,nodes,storage,renderCount:()=>renders,tickAt(ms){const at=(context.api.status().activeRun?.startedAt||0)+ms;const batch=frames.splice(0);for(const frame of batch)frame(at);},tick(){const batch=frames.splice(0);for(const frame of batch)frame(performance.now()+10000);},finish(){while(frames.length)frames.shift()(performance.now()+10000);}};
}
for(const game of ['roulette','dart','munch','tail'])test(`${game}: 3회에 2명씩 선정한 결과와 회차 정보가 일치한다`,async()=>{
  const env=controller({people:'2',rounds:'3'});env.api.setGame(game);
  await env.api.startDraw();assert.equal(env.api.status().running,true);
  if(['dart','tail'].includes(game))await env.api.assistGesture();
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

for(const game of ['dart','tail'])test(`${game}: 조작 전 결과가 없고 취소하면 대기 프레임도 정지한다`,async()=>{
  const env=controller();env.api.setGame(game);await env.api.startDraw();
  assert.equal(env.api.status().activeRun.waiting,true);assert.equal(env.api.status().activeRun.draws.length,0);
  env.api.cancelDraw();env.finish();assert.equal(env.api.status().lastResult,null);
});
test('다트 빗나감은 결과를 만들지 않고 실제 명중 조작 한 번만 추첨한다',async()=>{
  const env=controller();env.api.setGame('dart');await env.api.startDraw();
  const event=(x,y)=>({clientX:x,clientY:y,pointerId:1,button:0,isPrimary:true,preventDefault(){}});
  env.api.pointerDown(event(300,317));env.api.pointerEnd(event(600,60));
  assert.equal(env.api.status().activeRun.waiting,true);assert.equal(env.api.status().activeRun.draws.length,0);assert.ok(env.api.status().activeRun.miss);
  env.tick();assert.equal(env.api.status().activeRun.miss,null);
  env.api.pointerDown(event(300,317));env.api.pointerEnd(event(300,100));
  await new Promise(resolve=>setTimeout(resolve,10));env.finish();
  assert.equal(env.api.status().lastResult.draws.length,1);
});
test('터치 취소는 결과를 만들지 않고 같은 판에서 다시 던질 수 있다',async()=>{
  const env=controller();env.api.setGame('dart');await env.api.startDraw();
  const event={clientX:300,clientY:317,pointerId:2,button:0,preventDefault(){}};
  env.api.pointerDown(event);env.api.pointerEnd(event,true);
  assert.equal(env.api.status().activeRun.waiting,true);assert.equal(env.api.status().activeRun.draws.length,0);
  await env.api.assistGesture();env.finish();assert.equal(env.api.status().lastResult.draws.length,1);
});

for(const game of ['roulette','dart','munch','tail'])test(`${game}: 기기의 움직임 줄이기가 켜져도 전체 선택은 중간 연출과 설정 시간을 지킨다`,async()=>{
  const env=controller({}, {systemReduced:true});env.api.setGame(game);
  env.nodes.set('motion-mode',{value:'full'});env.api.changeMotionMode();
  await env.api.startDraw();if(['dart','tail'].includes(game))await env.api.assistGesture();
  assert.equal(env.api.status().activeRun.duration,3400);
  env.tickAt(180);assert.equal(env.api.status().running,true);assert.ok(env.renderCount()>0);assert.equal(env.api.status().lastResult,null);
  env.tickAt(3399);assert.equal(env.api.status().running,true);
  env.tickAt(3401);assert.equal(env.api.status().running,false);assert.equal(env.api.status().lastResult.draws.length,1);
});

test('기기 설정 따르기와 명시적 간결 선택은 중간 연출을 생략한다',async()=>{
  for(const [systemReduced,choice] of [[true,'system'],[false,'reduced']]){
    const env=controller({}, {systemReduced});env.nodes.set('motion-mode',{value:choice});env.api.changeMotionMode();
    await env.api.startDraw();assert.equal(env.api.status().activeRun.duration,160);
    env.tickAt(100);assert.equal(env.renderCount(),0);assert.equal(env.api.status().lastResult,null);
    env.tickAt(161);assert.equal(env.api.status().lastResult.draws.length,1);
  }
});

test('전체 연출은 1.8초, 3.4초, 5초 선택을 각각 유지한다',async()=>{
  for(const duration of ['1800','3400','5000']){
    const env=controller({duration},{systemReduced:true});env.nodes.set('motion-mode',{value:'full'});env.api.changeMotionMode();
    await env.api.startDraw();env.tickAt(Number(duration)-1);assert.equal(env.api.status().running,true);
    env.tickAt(Number(duration)+1);assert.equal(env.api.status().running,false);
  }
});

test('움직임 선택은 기존 후보 저장을 덮어쓰지 않고 다음 실행에도 유지된다',()=>{
  const saved=JSON.stringify({version:1,config:{owner:'보존할 모임',motionMode:'system'},lastResult:null});
  const storage=new Map([['lucky-draw.portable.v1',saved]]);
  const env=controller({}, {systemReduced:true,storage});env.nodes.set('motion-mode',{value:'full'});env.api.changeMotionMode();
  assert.equal(storage.get('lucky-draw.portable.v1'),saved);
  const restarted=controller({}, {systemReduced:true,storage});assert.equal(restarted.api.motion().mode,'full');assert.equal(restarted.api.motion().reduced,false);
});

test('이전 HTML의 간결 설정과 새 HTML의 전체 설정을 호환 복원한다',()=>{
  for(const [config,expected] of [[{reduced:true},'reduced'],[{reduced:false},'system'],[{motionMode:'full',reduced:false},'full']]){
    const env=controller({}, {systemReduced:true,snapshot:{version:1,config}});assert.equal(env.api.motion().mode,expected);
  }
});
