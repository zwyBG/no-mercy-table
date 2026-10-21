import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,createRoom,DEFAULT_CONFIG,publicView,advanceRoom} from '../lib/game.ts';
import {developerSettings} from '../lib/developer-tools.ts';
import {commandResult} from '../lib/room-command.ts';
import {commitRoomAction} from '../lib/room-commit.ts';

const person=id=>({id,name:id,tokenHash:`secret-${id}`,hand:[],ready:true,out:false,uno:false});
const context={hostOffline:false,developerAuthorized:true};
function setup(start=true){const r=createRoom('NEXT22',person('A'),{...DEFAULT_CONFIG,seats:4,dealDelayMs:0,firstSeat:0});for(const id of ['B','C','D'])r.players.push(person(id));if(start)applyAction(r,'A',{type:'start'});return r;}
const arm=(r,hitAt)=>applyAction(r,'A',{type:'devRoulette',scope:'next',hitAt},context);
function giveRoulette(r,id){const p=r.players.find(p=>p.id===id),i=r.game.deck.findIndex(c=>c.kind==='roulette');assert.ok(i>=0);const card=r.game.deck.splice(i,1)[0];r.game.deck.push(p.hand.shift());p.hand.unshift(card);return card;}
function playRoulette(r,id='A',color='green'){const card=giveRoulette(r,id);r.game.turn=id;applyAction(r,id,{type:'play',card:card.id});applyAction(r,r.game.pending.actor,{type:'color',color});return r.game.pending.actor;}
function setCurrent(r,hitAt){const p=r.game.pending;applyAction(r,'A',{type:'devRoulette',actor:p.actor,color:p.color,drawn:p.drawn||0,top:r.game.discard.at(-1).id,hitAt},context);}
function drawTo(r,actor,n,color){for(let i=1;i<=n;i++){applyAction(r,actor,{type:'drawRoulette'});assert.equal(r.players.find(p=>p.id===actor).hand.at(-1).color===color,i===n);}}

test('a future roulette target may be saved before any roulette or round exists and applies once after color choice',()=>{
  const r=setup(false);arm(r,3);assert.equal(r.nextRouletteControl.hitAt,3);applyAction(r,'A',{type:'start'});const actor=playRoulette(r);
  assert.equal(r.nextRouletteControl.hitAt,3);assert.equal(r.game.rouletteControl,undefined);drawTo(r,actor,3,'green');assert.equal(r.nextRouletteControl,undefined);assert.equal(r.game.rouletteControl,undefined);
  playRoulette(r,'C','blue');assert.equal(r.game.rouletteControl,undefined);assert.deepEqual(developerSettings(r),{nextRouletteHitAt:null});
});
test('saving a future target during an existing roulette excludes it even when its color has not yet been selected',()=>{
  const r=setup(),card=giveRoulette(r,'A');applyAction(r,'A',{type:'play',card:card.id});const key=r.game.rouletteKey;arm(r,2);assert.equal(r.nextRouletteControl.except,key);
  applyAction(r,'B',{type:'color',color:'green'});setCurrent(r,1);drawTo(r,'B',1,'green');assert.equal(r.nextRouletteControl.hitAt,2);
  const actor=playRoulette(r,'C','blue');assert.notEqual(r.game.rouletteKey,key);drawTo(r,actor,2,'blue');assert.equal(r.nextRouletteControl,undefined);
});
test('changing or canceling the next target leaves an in-progress roulette override unchanged',()=>{
  const r=setup(),actor=playRoulette(r);setCurrent(r,4);applyAction(r,actor,{type:'drawRoulette'});arm(r,5);arm(r,2);assert.equal(r.game.rouletteControl.hitAt,4);arm(r,null);assert.equal(r.game.rouletteControl.hitAt,4);assert.equal(r.nextRouletteControl,undefined);
});
test('the future target survives an interrupted roulette until an actual first draw',()=>{
  const r=setup();arm(r,4);playRoulette(r);assert.equal(r.nextRouletteControl.hitAt,4);const card=giveRoulette(r,'C');applyAction(r,'C',{type:'jump',card:card.id,top:r.game.jump.top});applyAction(r,'D',{type:'color',color:'blue'});
  assert.equal(r.nextRouletteControl.hitAt,4);drawTo(r,'D',4,'blue');assert.equal(r.nextRouletteControl,undefined);
});
test('future roulette settings persist across pause, serialization, room reset and starting a later round',()=>{
  let r=setup();arm(r,2);applyAction(r,'A',{type:'pause',paused:true});r=JSON.parse(JSON.stringify(r));assert.equal(r.nextRouletteControl.hitAt,2);applyAction(r,'A',{type:'pause',paused:false});r.status='finished';applyAction(r,'A',{type:'reset'});assert.equal(r.nextRouletteControl.hitAt,2);
  r.players.forEach(p=>p.ready=true);applyAction(r,'A',{type:'start'});const actor=playRoulette(r);drawTo(r,actor,2,'green');assert.equal(r.nextRouletteControl,undefined);
});
test('a future setting requires server authorization and an integer from one to twenty-five',()=>{
  const r=setup();assert.throws(()=>applyAction(r,'A',{type:'devRoulette',scope:'next',hitAt:2,developerAuthorized:true}),/密码/);
  for(const hitAt of [0,-1,26,1.5,'3',undefined,NaN]){assert.throws(()=>arm(r,hitAt),/整数/);assert.equal(r.nextRouletteControl,undefined);}
  arm(r,1);arm(r,25);assert.equal(r.nextRouletteControl.hitAt,25);arm(r,null);assert.equal(r.nextRouletteControl,undefined);
});
test('a player still gets knocked out at twenty-five cards when a future target is farther away',()=>{
  const r=setup();arm(r,25);const actor=playRoulette(r),p=r.players.find(p=>p.id===actor);while(p.hand.length<24)p.hand.push(r.game.deck.pop());applyAction(r,actor,{type:'drawRoulette'});
  assert.equal(p.hand.length,25);assert.equal(p.out,true);assert.notEqual(p.hand.at(-1).color,'green');assert.equal(r.nextRouletteControl,undefined);advanceRoom(r,r.game.knockout.until+1);assert.equal(r.game.rouletteControl,undefined);
});
test('a manual current override takes priority and the reserved next setting is still used only once',()=>{
  const r=setup();arm(r,4);const actor=playRoulette(r);setCurrent(r,1);drawTo(r,actor,1,'green');assert.equal(r.nextRouletteControl,undefined);
});
test('private readback exposes future settings only in a server-authorized command response',()=>{
  const r=setup();arm(r,3);playRoulette(r);const result={row:{room:r,version:4},committed:true};
  for(const p of r.players){const view=publicView(r,p.id,{},4),body=commandResult(result,p.id,{}).body;assert.equal(JSON.stringify(view).includes('RouletteControl'),false);assert.equal(JSON.stringify(view).includes('rouletteKey'),false);assert.equal('developer' in body,false);}
  assert.deepEqual(commandResult(result,'A',{},true).body.developer,{nextRouletteHitAt:3});
});
test('retrying an accepted preset after it was consumed cannot arm another future roulette',async()=>{
  let row={room:setup(),version:1};const action={type:'devRoulette',scope:'next',hitAt:2,version:1,actionId:'next-roulette-once'};
  const storage={read:async()=>structuredClone(row),save:async candidate=>{row={room:structuredClone(candidate.room),version:row.version+1};return true;}};
  await commitRoomAction(structuredClone(row),'A',action,()=>context,storage);const actor=playRoulette(row.room);drawTo(row.room,actor,2,'green');const retry=await commitRoomAction(structuredClone(row),'A',action,()=>context,storage);assert.equal(retry.committed,false);assert.equal(row.room.nextRouletteControl,undefined);
});
