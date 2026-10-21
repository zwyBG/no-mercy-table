import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,createRoom,DEFAULT_CONFIG,publicView} from '../lib/game.ts';
import {cardFaceKey,controlledRouletteFace} from '../lib/developer-tools.ts';
import {PrivateEntryTaps,verifyDeveloperPassword} from '../lib/developer-access.ts';
import {commitRoomAction} from '../lib/room-commit.ts';
import {canRebaseAction} from '../lib/action-intent.ts';

const person=id=>({id,name:id,tokenHash:`seat-secret-${id}`,hand:[],ready:true,out:false,uno:false});
function setup(){const r=createRoom('DEVQA2',person('A'),{...DEFAULT_CONFIG,seats:4,dealDelayMs:0,firstSeat:0});for(const id of ['B','C','D'])r.players.push(person(id));applyAction(r,'A',{type:'start'});return r;}
const context={hostOffline:false,developerAuthorized:true};
const dev=(r,action,id='A')=>applyAction(r,id,action,context);
const inventory=r=>[...r.game.deck,...r.game.discard,...r.game.retired,...r.players.flatMap(p=>p.hand)].map(c=>c.id).sort();
function roulette(){const r=setup(),i=r.game.deck.findIndex(c=>c.kind==='roulette'),c=r.game.deck.splice(i,1)[0];r.game.deck.push(r.players[0].hand.shift());r.players[0].hand.unshift(c);applyAction(r,'A',{type:'play',card:c.id});applyAction(r,'B',{type:'color',color:'green'});return r;}
function control(r,hitAt){const g=r.game,p=g.pending;return dev(r,{type:'devRoulette',actor:p.actor,color:p.color,drawn:p.drawn||0,top:g.discard.at(-1).id,hitAt});}

test('private entry opens only after five consecutive taps and expires an interrupted sequence',()=>{
  const taps=new PrivateEntryTaps();for(const time of [0,100,250,400])assert.equal(taps.tap(time),false);assert.equal(taps.tap(700),true);assert.equal(taps.tap(710),false);
  for(const time of [2000,2100,2200,2300])assert.equal(taps.tap(time),false);assert.equal(taps.tap(3200),false);assert.equal(taps.tap(3000),false);
});
test('server password verification is case insensitive, refuses missing configuration and never accepts a client authorization flag',async()=>{
  const password='Example-Private-Word',digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(password.toLowerCase()))).toString('hex');
  for(const entry of [password,password.toUpperCase(),password.toLowerCase()])assert.equal(await verifyDeveloperPassword(entry,digest),true);
  for(const [entry,configured] of [['wrong',digest],['',digest],[null,digest],[password,undefined],[password,'invalid'],['x'.repeat(129),digest]])assert.equal(await verifyDeveloperPassword(entry,configured),false);
  const r=setup(),before=structuredClone(r);for(const type of ['devUnlock','devCard','devScore','devRoulette'])assert.throws(()=>applyAction(r,'A',{type,developerAuthorized:true,password:'anything'}),/密码/);assert.deepEqual(r,before);
});
test('editing a private hand preserves its position, physical identity, count and every other hand',()=>{
  const r=setup(),p=r.players[0],before=structuredClone(r.players),ids=inventory(r),card=p.hand[2];
  dev(r,{type:'devCard',card:card.id,previous:cardFaceKey(card),face:{color:'wild',kind:'draw10',number:8}});
  assert.deepEqual(p.hand[2],{id:card.id,color:'wild',kind:'draw10'});assert.equal(p.hand.length,before[0].hand.length);assert.deepEqual(p.hand.map(c=>c.id),before[0].hand.map(c=>c.id));assert.deepEqual(r.players.slice(1),before.slice(1));assert.deepEqual(inventory(r),ids);
  const visible=JSON.stringify(publicView(r,'B',{},4));assert.equal(visible.includes(card.id),false);assert.equal(visible.includes('password'),false);assert.equal(visible.includes('seat-secret'),false);
});
test('private edits accept every printed face but reject foreign cards, invalid faces and stale card intentions',()=>{
  const r=setup(),p=r.players[0],id=p.hand[0].id;
  for(const face of [{color:'blue',kind:'number',number:0},{color:'red',kind:'draw4'},{color:'wild',kind:'roulette'},{color:'yellow',kind:'skipall'}])dev(r,{type:'devCard',card:id,previous:cardFaceKey(p.hand[0]),face});
  for(const face of [{color:'wild',kind:'number',number:2},{color:'blue',kind:'draw10'},{color:'purple',kind:'skip'},{color:'blue',kind:'number',number:10},{color:'green',kind:'number',number:1.5},null]){
    const before=structuredClone(p.hand);assert.throws(()=>dev(r,{type:'devCard',card:id,previous:cardFaceKey(p.hand[0]),face}));assert.deepEqual(p.hand,before);
  }
  assert.throws(()=>dev(r,{type:'devCard',card:r.players[1].hand[0].id,previous:cardFaceKey(r.players[1].hand[0]),face:{color:'red',kind:'number',number:1}}),/离开/);
  assert.throws(()=>dev(r,{type:'devCard',card:id,previous:'old',face:{color:'red',kind:'number',number:1}}),/变化/);
});
test('private card editing works off turn and cannot edit a completed hand or an active draw',()=>{
  const r=setup(),p=r.players[2],action={type:'devCard',card:p.hand[0].id,previous:cardFaceKey(p.hand[0]),face:{color:'blue',kind:'number',number:9}};dev(r,action,'C');assert.equal(r.game.turn,'A');
  p.finished=true;assert.throws(()=>dev(r,{...action,previous:cardFaceKey(p.hand[0])},'C'),/当前不能/);p.finished=false;r.game.drawing={player:'B',mode:'single',total:1,drawn:0,nextAt:Date.now()+100};assert.throws(()=>dev(r,{...action,previous:cardFaceKey(p.hand[0])},'C'),/当前不能/);
});
test('authorized score edits support negative totals for every seat and guard against overwriting a newer score',()=>{
  const r=setup();for(const [i,p] of r.players.entries()){const value=i-2;dev(r,{type:'devScore',target:p.id,score:value,previousScore:0});assert.equal(publicView(r,'A',{},3).players[i].score,value);}
  assert.throws(()=>dev(r,{type:'devScore',target:'A',score:100,previousScore:0}),/已更新/);assert.equal(r.scores.A,-2);
  for(const score of [NaN,Infinity,1.5,1000001,'10',null])assert.throws(()=>dev(r,{type:'devScore',target:'A',score,previousScore:-2}),/整数/);
  assert.throws(()=>dev(r,{type:'devScore',target:'missing',score:0,previousScore:0}),/离开/);
});
test('score edits persist through the next round, and an already settled recap receives the adjusted total only',()=>{
  const r=setup();r.status='finished';r.game.scored=true;r.game.placements=[{player:'A',kind:'finished',rank:1,count:0,at:1,scoreDelta:4,scoreTotal:7}];r.scores={A:7};
  dev(r,{type:'devScore',target:'A',score:-9,previousScore:7});assert.equal(r.game.placements[0].scoreTotal,-9);assert.equal(r.game.placements[0].scoreDelta,4);
  applyAction(r,'A',{type:'reset'});assert.equal(r.scores.A,-9);assert.equal(r.status,'lobby');assert.equal(r.game,null);
});
test('controlled roulette hits the absolute requested draw and keeps every physical card exactly once',()=>{
  const r=roulette(),before=inventory(r);control(r,4);const start=r.players[1].hand.length;
  for(let n=1;n<=4;n++){applyAction(r,'B',{type:'drawRoulette'});const last=r.players[1].hand.at(-1);assert.equal(last.color==='green',n===4);assert.equal(r.players[1].hand.length,start+n);if(n<4)assert.equal(r.game.pending.drawn,n);}
  assert.equal(r.game.pending,null);assert.equal(r.game.rouletteControl,undefined);assert.deepEqual(inventory(r),before);
});
test('a roulette target can be updated after drawing, reset to random, and never leaks into public room state',()=>{
  const r=roulette();control(r,5);applyAction(r,'B',{type:'drawRoulette'});control(r,3);assert.equal(r.game.rouletteControl.hitAt,3);
  for(const p of r.players){const view=publicView(r,p.id,{},8);assert.equal(JSON.stringify(view).includes('rouletteControl'),false);assert.equal(JSON.stringify(view).includes('hitAt'),false);}
  control(r,null);assert.equal(r.game.rouletteControl,undefined);
});
test('roulette settings reject an unchosen color, stale progress and already drawn or post-elimination targets',()=>{
  const r=roulette(),p=r.game.pending,base={type:'devRoulette',actor:p.actor,color:p.color,drawn:0,top:r.game.discard.at(-1).id,hitAt:2};
  for(const extra of [{hitAt:0},{hitAt:1.5},{hitAt:100},{actor:'A'},{color:'red'},{drawn:1},{top:'old'}])assert.throws(()=>dev(r,{...base,...extra}));
  p.color=undefined;assert.throws(()=>dev(r,base),/已选好颜色/);
});
test('a roulette override survives a pause and is canceled when a matching jump replaces its effect',()=>{
  const r=roulette();control(r,5);applyAction(r,'A',{type:'pause',paused:true});assert.equal(r.game.rouletteControl.hitAt,5);applyAction(r,'A',{type:'pause',paused:false});
  const c=r.game.deck.splice(r.game.deck.findIndex(c=>c.kind==='roulette'),1)[0];r.game.deck.push(r.players[2].hand.shift());r.players[2].hand.unshift(c);applyAction(r,'C',{type:'jump',card:c.id,top:r.game.jump.top});assert.equal(r.game.rouletteControl,undefined);assert.equal(r.game.pending.actor,'D');
});
test('controlled roulette has a valid deterministic fallback when no matching stock face remains',()=>{
  const wild={id:'same-physical-card',color:'wild',kind:'draw10'};assert.deepEqual(controlledRouletteFace(wild,'blue',true),{id:wild.id,color:'blue',kind:'number',number:0});
  assert.deepEqual(controlledRouletteFace({id:'a',color:'green',kind:'draw2'},'green',false),{id:'a',color:'blue',kind:'draw2'});assert.deepEqual(controlledRouletteFace(wild,'green',false),wild);
});
test('private commands rebase only through their explicit preconditions and retries store no password or duplicate score writes',async()=>{
  const r=setup(),action={type:'devScore',target:'B',score:-11,previousScore:0,version:1,actionId:'private-score-once',password:'test-secret'};assert.equal(canRebaseAction(r,'A',action),true);
  let row={room:structuredClone(r),version:1};const storage={read:async()=>structuredClone(row),save:async candidate=>{row={room:structuredClone(candidate.room),version:row.version+1};return true;}};
  const result=await commitRoomAction(structuredClone(row),'A',action,()=>context,storage);assert.equal(result.committed,true);const retry=await commitRoomAction(structuredClone(row),'A',action,()=>context,storage);assert.equal(retry.committed,false);assert.equal(row.room.scores.B,-11);assert.equal(JSON.stringify(row.room).includes('test-secret'),false);
});
