import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [shell,app,core,css]=await Promise.all(['shell.html','app.js','core.js','style.css'].map(file=>readFile(new URL(`../src/${file}`,import.meta.url),'utf8')));
test('독립 HTML에는 외부 자산, 네트워크 의존, 글자 수 상한이 없다',()=>{
  assert.doesNotMatch(shell,/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i);
  assert.doesNotMatch(css,/@import|url\(["']?https?:/i);
  assert.doesNotMatch(app,/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(shell,/maxlength\s*=/i);
});
test('모든 고정 DOM 참조가 실제 HTML 요소와 연결된다',()=>{
  const ids=[...shell.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'중복 ID 없음');
  for(const [,id] of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(id),`요소 존재: ${id}`);
});
test('스크립트와 스타일은 안전하게 인라인으로 결합할 수 있다',()=>{
  assert.doesNotMatch(app,/<\/script/i);assert.doesNotMatch(core,/<\/script/i);assert.doesNotMatch(css,/<\/style/i);
  assert.doesNotThrow(()=>new vm.Script(`(()=>{${core.replace(/^export /gm,'')}\n${app}})()`));
});
test('네 게임은 실제로 서로 다른 캔버스 경로에 연결된다',()=>{
  for(const game of ['roulette','dart','munch','tail'])assert.match(shell,new RegExp(`data-game="${game}"`));
  for(const name of ['drawWheel','drawMunch','drawTail'])assert.match(app,new RegExp(`function ${name}\\(`));
  assert.match(app,/drawWheel\(ctx,w,h,frame,true,mini\)/);
});
