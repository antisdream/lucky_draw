import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../src/bootstrap.js',import.meta.url),'utf8');
function boot(overrides={}){
  const nodes=new Map(),attributes={},events={};
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:''});return nodes.get(id);},body:{setAttribute(key,value){attributes[key]=value;}},createElement(){return {getContext:()=>({})};}};
  const window={crypto:{getRandomValues(){}},FileReader:function(){},Blob:function(){},URL:{createObjectURL(){}},addEventListener(name,fn){events[name]=fn;}};
  const context=vm.createContext({window,document,BigInt,...overrides});vm.runInContext(source,context);return {window,document,nodes,attributes,events};
}
test('정상 시작을 확인한 경우에만 실행 안내를 숨긴다',()=>{
  const env=boot();assert.equal(env.nodes.get('launch-help').hidden,false);env.window.LuckyBoot.ready();assert.equal(env.nodes.get('launch-help').hidden,true);assert.equal(env.attributes['data-app-ready'],'true');
});
test('지원되지 않는 기능이 있으면 잘못된 정상 상태로 바뀌지 않는다',()=>{
  const env=boot({BigInt:undefined});env.window.LuckyBoot.ready();assert.equal(env.attributes['data-app-ready'],'false');assert.match(env.nodes.get('launch-detail').textContent,/큰 정수/);
});
test('초기 실행 오류의 안내를 유지한다',()=>{
  const env=boot();env.events.error({message:'Syntax unavailable'});env.window.LuckyBoot.ready();assert.equal(env.attributes['data-app-ready'],'false');assert.match(env.nodes.get('launch-detail').textContent,/Syntax unavailable/);
});
