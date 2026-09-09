function drawDartPin(ctx, x, y, scale = 1, angle = 0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);
  line(ctx,[[0,0],[0,42]],'#202721',4);
  ctx.beginPath();ctx.moveTo(0,20);ctx.lineTo(-13,43);ctx.lineTo(0,37);ctx.lineTo(13,43);ctx.closePath();ctx.fillStyle='#ff5494';ctx.fill();ctx.strokeStyle='#202721';ctx.stroke();
  circle(ctx,0,2,3,'#202721');ctx.restore();
}
function drawDart(ctx,w,h,frame,mini=false) {
  const b=dartLayout(w,h), run=frame.interaction, p=frame.progress;
  const angle=run?.angle ?? -.4, sectors=12, arc=TAU/sectors;
  circle(ctx,b.x,b.y+5,b.radius+7,'#202721');circle(ctx,b.x,b.y,b.radius+7,'#fff','#202721',2);
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(angle);
  for(let i=0;i<sectors;i++){
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,b.radius,i*arc,(i+1)*arc);ctx.closePath();ctx.fillStyle=i%2?'#f8fae9':'#d8ef6f';ctx.fill();ctx.strokeStyle='#35452a';ctx.lineWidth=1;ctx.stroke();
    const a=(i+.5)*arc;canvasText(ctx,String(i+1),Math.cos(a)*b.radius*.8,Math.sin(a)*b.radius*.8,mini?9:11,'#35452a',600);
  }
  circle(ctx,0,0,b.radius*.56,null,'#35452a',1);circle(ctx,0,0,b.radius*.15,'#ff5494','#202721');ctx.restore();
  const rawFlight=run?.flight,flight=rawFlight?{...rawFlight,x:rawFlight.x*w/rawFlight.width,y:rawFlight.y*h/rawFlight.height,fromX:rawFlight.fromX*w/rawFlight.width,fromY:rawFlight.fromY*h/rawFlight.height}:null;
  if(flight){
    const t=Math.min(1,p/.7),ease=1-Math.pow(1-t,2);
    const x=flight.fromX+(flight.x-flight.fromX)*ease,y=flight.fromY+(flight.y-flight.fromY)*ease-Math.sin(t*Math.PI)*h*.09;
    line(ctx,[[flight.fromX,flight.fromY],[x,y]],'#ff549438',2);drawDartPin(ctx,x,y,1-.4*t,Math.atan2(flight.x-flight.fromX,flight.fromY-flight.y));
    if(t===1&&flight.hit){circle(ctx,x,y,12,null,'#ff5494',2);sparkle(ctx,x+18,y-12,8,'#ff5494');}
  }else{
    const drag=run?.drag;
    if(drag){line(ctx,[[b.launchX,b.launchY],[drag.x,drag.y]],'#738d44',2);drawDartPin(ctx,drag.x,drag.y,.75);}
    else{circle(ctx,b.launchX,b.launchY+7,mini?22:30,'#e2edc1');drawDartPin(ctx,b.launchX,b.launchY-15,mini?.55:.8);}
    if(!mini)canvasText(ctx,'핀을 잡고 원판 쪽으로 끌어 놓으세요',w/2,h-.02*h,12,'#637449',550,'center',w-14);
  }
  if(frame.ended&&!mini){roundBox(ctx,w*.13,h*.76,w*.74,h*.16,12,'#fff','#c2d78a');canvasText(ctx,frame.items[frame.winner]?.label||'?',w/2,h*.84,19,'#202721',750,'center',w*.68);}

}
function drawMunch(ctx,w,h,frame,mini=false) {
  const p=frame.progress,n=Math.min(6,Math.max(1,frame.items.length));
  const items=frame.items.slice(0,n);if(!items.some(item=>item===frame.items[frame.winner]))items[n-1]=frame.items[frame.winner];
  const winning=items.indexOf(frame.items[frame.winner]),others=items.map((_,i)=>i).filter(i=>i!==winning);
  const eaten=Math.min(others.length,Math.floor(p/.88*others.length)),active=others[Math.min(eaten,others.length-1)]??winning;
  const left=w*.08,top=h*.3,cw=w*.84/3,ch=h*.29;
  roundBox(ctx,left,top-10,w*.84,h*.61,20,'#e0e6ff','#b4c0ed');
  const positions=items.map((_,i)=>({x:left+cw*(i%3+.5),y:top+ch*(Math.floor(i/3)+.4)}));
  items.forEach((item,i)=>{
    const pos=positions[i],gone=others.slice(0,eaten).includes(i),winner=p>=.94&&i===winning;
    ctx.save();ctx.globalAlpha=gone?.25:1;circle(ctx,pos.x,pos.y,Math.min(cw*.32,25),gone?'#c2cbed':winner?'#ffe08b':'#fffaf0','#747fb0',1);
    if(!gone){circle(ctx,pos.x,pos.y,Math.min(cw*.24,19),winner?'#ffc760':'#bf8758');for(let c=0;c<4;c++){const a=c*1.7;circle(ctx,pos.x+Math.cos(a)*7,pos.y+Math.sin(a)*8,2,'#704426');}}
    if(!mini)canvasText(ctx,gone?'냠!':p<.94?'?':item.label,pos.x,pos.y+ch*.38,12,gone?'#7c86ac':'#313e70',650,'center',cw-8);
    if(winner){circle(ctx,pos.x,pos.y,Math.min(cw*.36,31),null,'#efae30',3);sparkle(ctx,pos.x+20,pos.y-23,9,'#efae30');}ctx.restore();
  });
  const bite=positions[active]||{x:w*.5,y:h*.5},busy=p>0&&p<.9;
  const mx=busy?bite.x:w*.5,my=busy?bite.y-22:h*.15,r=mini?19:26;
  circle(ctx,mx,my,r,'#8b9fe8','#273560',2);circle(ctx,mx-8,my-7,4,'white');circle(ctx,mx+8,my-7,4,'white');circle(ctx,mx-8,my-7,2,'#202721');circle(ctx,mx+8,my-7,2,'#202721');
  ctx.beginPath();ctx.ellipse(mx,my+7,11,busy?5+Math.abs(Math.sin(p*65))*8:6,0,0,TAU);ctx.fillStyle='#273560';ctx.fill();
  if(!mini)canvasText(ctx,p>=.94?'마지막 쿠키의 주인공!':'배고픈 몬스터, 하나만 남겨줘!',w/2,h*.95,13,'#4a5989',650,'center',w-16);
}
function drawTail(ctx,w,h,frame,mini=false) {
  const p=frame.progress,run=frame.interaction,chosen=run?.slot??2;
  const pull=run?.drag?Math.max(0,Math.min(h*.28,run.drag.y-run.drag.startY)):p*h*.25;
  roundBox(ctx,w*.1,h*.08,w*.8,h*.4,18,'#c18755','#654127');
  roundBox(ctx,w*.12,h*.1,w*.76,h*.08,8,'#daa77a');
  canvasText(ctx,'누가 숨어 있을까?',w/2,h*.23,mini?11:16,'#fff4e4',700,'center',w*.68);
  for(let i=0;i<5;i++){
    const x=w*(.18+i*.16),selected=i===chosen,dy=selected?pull:0;
    circle(ctx,x,h*.4,mini?8:12,'#5f3e27');
    ctx.beginPath();ctx.moveTo(x,h*.4);ctx.bezierCurveTo(x-18,h*.55+dy*.3,x+22,h*.55+dy,x,h*.69+dy);ctx.strokeStyle='#654127';ctx.lineWidth=mini?12:18;ctx.lineCap='round';ctx.stroke();ctx.strokeStyle=PALETTE[i];ctx.lineWidth=mini?9:14;ctx.stroke();
    circle(ctx,x,h*.69+dy,mini?8:12,PALETTE[i],'#654127',1.5);if(!mini&&p===0)canvasText(ctx,String(i+1),x,h*.69+dy,11,'#4d3526',750);
  }
  if(p>.45){
    const reveal=Math.min(1,(p-.45)/.4),height=h*.28*reveal;
    roundBox(ctx,w*.2,h*.32-height*.55,w*.6,height,12,'#fff8ed','#b58659');
    if(p>.65){canvasText(ctx,'찾았다!',w/2,h*.32-height*.22,12,'#9c6440',650);canvasText(ctx,frame.items[frame.winner]?.label||'?',w/2,h*.32+height*.1,mini?12:19,'#302719',750,'center',w*.54);}
  }
  if(!mini&&p===0)canvasText(ctx,'마음에 드는 꼬리를 아래로 쭉!',w/2,h*.95,13,'#946640',650,'center',w-12);
}
