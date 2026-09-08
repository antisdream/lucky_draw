import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/sw.js',import.meta.url),'utf8');
function worker(options={}){
  const events={},stores=new Map(),requests=[];let online=true;
  const caches={async keys(){return [...stores.keys()];},async delete(key){return stores.delete(key);},async open(key){if(!stores.has(key))stores.set(key,new Map());const map=stores.get(key);return {async put(url,response){map.set(typeof url==='string'?url:url.url,response.clone());},async match(url){return map.get(typeof url==='string'?url:url.url)?.clone();}};}};
  const self={location:{href:'https://example.test/lucky/sw.js'},addEventListener(type,fn){events[type]=fn;},async skipWaiting(){},clients:{async claim(){}}};
  const context=vm.createContext({self,URL,caches,fetch:async request=>{const url=typeof request==='string'?request:request.url;requests.push(url);if(!online)throw new Error('offline');return new Response(url.endsWith('index.html')?(options.login?'<html>Login</html>':'<html><meta name="lucky-draw-shell" content="standalone-v1">Lucky</html>'):'asset',{status:200});}});
  vm.runInContext(source.replace('__BUILD_ID__','verified'),context);
  return {stores,requests,offline(){online=false;},async lifecycle(type){let pending;events[type]({waitUntil(value){pending=value;}});await pending;},async navigate(path='/lucky/'){let pending;events.fetch({request:{url:'https://example.test'+path,mode:'navigate',method:'GET'},respondWith(value){pending=value;}});return pending;}};
}
test('게임 파일을 보관하고 연결 없이 같은 HTML을 반환한다',async()=>{
  const env=worker();await env.lifecycle('install');env.offline();const response=await env.navigate();assert.match(await response.text(),/lucky-draw-shell/);assert.equal(env.requests.length,3);
});
test('연결 상태와 무관하게 준비된 게임은 서버 대기 없이 연다',async()=>{
  const env=worker();await env.lifecycle('install');const before=env.requests.length;await env.navigate();assert.equal(env.requests.length,before);
});
test('로그인 안내 페이지를 오프라인 앱으로 저장하지 않는다',async()=>{
  const env=worker({login:true});await assert.rejects(env.lifecycle('install'),/login or preview/);assert.equal(env.stores.size,0);
});
test('다른 앱의 캐시와 주소를 건드리지 않는다',async()=>{
  const env=worker();env.stores.set('other-app',new Map());env.stores.set('lucky-draw-%2Fother%2F-old',new Map());env.stores.set('lucky-draw-%2Flucky%2F-old',new Map());await env.lifecycle('install');await env.lifecycle('activate');
  assert.equal(env.stores.has('other-app'),true);assert.equal(env.stores.has('lucky-draw-%2Fother%2F-old'),true);assert.equal(env.stores.has('lucky-draw-%2Flucky%2F-old'),false);assert.equal(await env.navigate('/unrelated/'),undefined);
});
