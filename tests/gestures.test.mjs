import test from 'node:test';
import assert from 'node:assert/strict';
import {dartLayout,evaluateThrow,tailSlot,pullAccepted} from '../src/gestures.js';
for(const [w,h] of [[280,270],[600,360],[780,360]]){
  test(`${w}px 다트: 위쪽 명중, 빗나감, 짧은 클릭을 구분한다`,()=>{
    const b=dartLayout(w,h),start={x:b.launchX,y:b.launchY};
    assert.equal(evaluateThrow(start,{x:b.x,y:b.y},w,h).hit,true);
    assert.equal(evaluateThrow(start,{x:w,y:0},w,h).hit,false);
    assert.equal(evaluateThrow(start,{x:b.launchX,y:b.launchY-5},w,h).valid,false);
    assert.equal(evaluateThrow(start,{x:b.x,y:h},w,h).valid,false);
  });
}
test('꼬리 선택과 당기기는 화면 비율에 따라 판단하고 탭은 무시한다',()=>{
  assert.deepEqual([.18,.34,.5,.66,.82].map(x=>tailSlot(x*320,320)),[0,1,2,3,4]);
  assert.equal(pullAccepted({y:100},{y:105},300),false);
  assert.equal(pullAccepted({y:100},{y:145},300),true);
  assert.equal(pullAccepted({y:100},{y:50},300),false);
});
