import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,applyAction,advanceRoom,publicView,DEFAULT_CONFIG} from '../lib/game.ts';
import {sameCardFace,jumpCards,jumpDirection} from '../lib/jump-in.ts';
import {actionKey} from '../lib/action-intent.ts';
import {commitRoomAction} from '../lib/room-commit.ts';
import {keyReplayFrames} from '../lib/match-history.ts';
import {validRoomCommand} from '../lib/room-command.ts';

let serial=0;
const card=(kind='number',number=2,color='yellow')=>({id:`jump-test-${++serial}`,kind,color,...(kind==='number'?{number}:{})});
const person=id=>({id,name:id,tokenHash:`private-${id}`,hand:[],ready:true,out:false,uno:false});
function setup(seats=4,direction=1,kind='number',number=2,color='yellow'){
  const r=createRoom('JUMP23',person('A'),{...DEFAULT_CONFIG,seats,direction,firstSeat:0,dealDelayMs:0});
  for(let i=1;i<seats;i++)r.players.push(person(String.fromCharCode(65+i)));
  applyAction(r,'A',{type:'start'});r.game.discard=[card('number',9,color==='wild'?'yellow':color)];r.game.color=r.game.discard[0].color;
  for(const p of r.players)p.hand=[card(kind,number,color),card('number',8,'blue'),card('number',6,'green')];
  return r;
}
const play=(r,id='A',extra={})=>applyAction(r,id,{type:'play',card:r.players.find(p=>p.id===id).hand[0].id,color:'yellow',...extra});
const jump=(r,id,extra={})=>applyAction(r,id,{type:'jump',card:jumpCards(r,id)[0]?.id,top:r.game.jump?.top,color:'red',...extra});
const inventory=r=>[...r.game.deck,...r.game.discard,...r.game.retired,...r.players.flatMap(p=>p.hand)].map(c=>c.id).sort();

test('jump-in requires the identical printed color, symbol and number, including wild type',()=>{
  const two=card();assert.ok(sameCardFace(two,card()));
  for(const other of [card('number',3),card('number',2,'red'),card('draw2')])assert.equal(sameCardFace(two,other),false);
  assert.equal(sameCardFace(card('draw4',0,'yellow'),card('reverse4',0,'wild')),false);
  assert.ok(sameCardFace(card('reverse4',0,'wild'),card('reverse4',0,'wild')));
  const r=setup();assert.equal(jumpCards(r,'C').length,0,'opening cards never open a jump window');
});

test('an off-turn player or the original player can jump immediately without waiting for animations',()=>{
  for(const who of ['A','C','D']){
    const r=setup();r.players[0].hand.splice(1,0,card());const before=inventory(r);play(r);
    assert.ok(r.presentationUntil>Date.now());assert.equal(jumpCards(r,who).length,1);
    jump(r,who,{uno:true});assert.equal(r.game.discard.at(-1).id,r.game.jump.top);assert.equal(r.game.jump.actor,who);
    assert.deepEqual(inventory(r),before);assert.ok(r.logs.some(e=>e.jump?.to===who));
  }
});

test('all 3–6 player seat paths choose the nearest direction and ties/self retain the previous direction',()=>{
  for(const n of [3,4,5,6])for(const direction of [1,-1])for(let target=0;target<n;target++){
    const r=setup(n,direction);r.players[0].hand.splice(1,0,card());play(r);const id=r.players[target].id;
    const expected=target===0||target===n-target?direction:target<n-target?1:-1;
    assert.equal(jumpDirection(r,id),expected);jump(r,id);assert.equal(r.game.direction,expected);
    assert.equal(r.game.turn,r.players[(target+expected+n)%n].id);
  }
});

test('nearest seat paths skip players who have already left active play',()=>{
  const r=setup(6);r.players[1].finished=true;r.players[1].hand=[];r.players[2].out=true;r.players[2].hand=[];
  play(r);assert.equal(jumpDirection(r,'D'),1);jump(r,'D');assert.equal(r.game.turn,'E');
});

test('a jump replaces the full previous penalty chain, while ordinary matching play still stacks',()=>{
  const r=setup(4,1,'draw4');r.players[0].hand[0]=card('draw2');play(r);play(r,'B');
  assert.equal(r.game.penalty,6);const before=inventory(r);jump(r,'D');
  assert.equal(r.game.penalty,4);assert.equal(r.game.lastDraw,4);assert.deepEqual(r.game.penaltyChain.map(e=>e.player),['D']);assert.deepEqual(inventory(r),before);
  const event=r.game.history.events.findLast(e=>e.kind==='jump');assert.equal(event.canceledPenalty,6);assert.equal(event.jumpFrom,'B');assert.ok(keyReplayFrames(r.game.history.events).includes(event));
  assert.equal(r.logs.findLast(e=>e.jump)?.cue.total,4);
});

test('reverse and reverse +4 apply only the replacement reverse, including self and tied paths',()=>{
  for(const kind of ['reverse','reverse4'])for(const who of ['A','B','C','D']){
    const r=setup(4,1,kind,0,kind==='reverse4'?'wild':'yellow');r.players[0].hand.splice(1,0,card(kind,0,kind==='reverse4'?'wild':'yellow'));
    play(r);assert.equal(r.game.direction,-1);const base=jumpDirection(r,who);jump(r,who);
    assert.equal(r.game.direction,-base);assert.equal(r.game.penalty,kind==='reverse4'?4:0);
  }
});

test('the skipped player cannot jump a skip, and the replacement clears the previous block',()=>{
  const r=setup(4,1,'skip');play(r);assert.deepEqual(r.game.jump.blocked,['B']);assert.equal(jumpCards(r,'B').length,0);
  assert.throws(()=>jump(r,'B'),/抢出机会/);jump(r,'D');assert.equal(r.game.direction,-1);assert.equal(r.game.turn,'B');assert.deepEqual(r.game.jump.blocked,['C']);assert.equal(jumpCards(r,'B').length,1);
});

test('skip-all blocks every other player but allows its owner to jump a second identical card',()=>{
  const r=setup(4,1,'skipall');r.players[0].hand.splice(1,0,card('skipall'));play(r);
  for(const id of ['B','C','D'])assert.equal(jumpCards(r,id).length,0);
  jump(r,'A');assert.equal(r.game.turn,'A');assert.deepEqual(r.game.jump.blocked,['B','C','D']);
});

test('two-player reverse blocks the remaining opponent from jumping the blocking reverse',()=>{
  const r=setup(3,1,'reverse');r.players[2].out=true;r.players[2].hand=[];r.players[0].hand.splice(1,0,card('reverse'));play(r);
  assert.equal(jumpCards(r,'B').length,0);jump(r,'A');assert.equal(r.game.direction,-1);assert.equal(r.game.turn,'A');
});

test('a remaining player can jump after the previous numeric-card player earns a placement',()=>{
  const r=setup();r.players[0].hand=[r.players[0].hand[0]];play(r);assert.equal(r.players[0].finished,true);
  jump(r,'D');assert.equal(r.game.direction,-1);assert.equal(r.game.turn,'C');assert.equal(r.game.placements[0].player,'A');
});

test('discard-all jump applies to the new player without restoring completed discards',()=>{
  const r=setup(4,1,'discard');r.players[0].hand.push(card('number',5));r.players[2].hand.push(card('number',6));play(r);
  const before=inventory(r);assert.equal(r.players[0].hand.length,2);jump(r,'C');assert.equal(r.players[0].hand.length,2);assert.equal(r.players[2].hand.length,2);assert.deepEqual(inventory(r),before);
});

test('a seven jump replaces a reversible choice and a selected blind target without exchanging cards',()=>{
  const r=setup(4,1,'number',7);r.config.seven='choice';play(r);applyAction(r,'A',{type:'chooseSeven',mode:'trade'});applyAction(r,'A',{type:'target',target:'B'});
  const old=structuredClone(r.players.map(p=>p.hand));jump(r,'D');assert.deepEqual(r.game.pending,{kind:'target',actor:'D'});
  assert.deepEqual(r.players[0].hand,old[0]);assert.deepEqual(r.players[1].hand,old[1]);assert.equal(r.players[3].hand.length,old[3].length-1);
});

test('zero and roulette jump-in replace pending decisions, including a previously chosen roulette color',()=>{
  const zero=setup(4,1,'number',0);play(zero);jump(zero,'C');assert.deepEqual(zero.game.pending,{kind:'zero',actor:'C'});
  const r=setup(4,1,'roulette',0,'wild');play(r);applyAction(r,'B',{type:'color',color:'blue'});jump(r,'D');
  assert.equal(r.game.color,'yellow');assert.deepEqual(r.game.pending,{kind:'roulette',actor:'C'});
});

test('actual draw, zero confirmation, full exchange, blind pick or skipping seven closes the old window',()=>{
  for(const mode of ['draw','zero','swap','pick','skip','roulette']){
    const r=setup(4,1,mode==='zero'?'number':mode==='draw'?'draw2':mode==='roulette'?'roulette':'number',mode==='zero'?0:mode==='draw'||mode==='roulette'?2:7,mode==='roulette'?'wild':'yellow');
    if(mode==='swap')r.config.seven='swap';play(r);
    if(mode==='draw')applyAction(r,'B',{type:'draw'});
    if(mode==='zero')applyAction(r,'A',{type:'chooseZero',rotate:false});
    if(mode==='swap')applyAction(r,'A',{type:'target',target:'B'});
    if(mode==='pick'){applyAction(r,'A',{type:'target',target:'B'});applyAction(r,'A',{type:'pick',index:0});}
    if(mode==='skip')applyAction(r,'A',{type:'skipSeven'});
    if(mode==='roulette'){applyAction(r,'B',{type:'color',color:'blue'});applyAction(r,'B',{type:'drawRoulette'});}
    assert.equal(r.game.jump,null,mode);assert.equal(jumpCards(r,'D').length,0,mode);assert.throws(()=>jump(r,'D'),/抢出机会|抽牌/,mode);
  }
});

test('draw completion never reopens a closed jump opportunity',()=>{
  const r=setup();play(r);applyAction(r,'B',{type:'draw'});
  let guard=0;while(r.game.drawing&&guard++<200)advanceRoom(r,r.game.drawing.nextAt);
  assert.equal(r.game.jump,null);assert.equal(jumpCards(r,'C').length,0);
});

test('pause, automation, withdrawal, elimination and finishing never grant manual jump access',()=>{
  for(const state of ['pause','autoplay','out','finished','withdrawn','removed']){
    const r=setup();play(r);if(state==='pause')applyAction(r,'A',{type:'pause',paused:true});else r.players[2][state]=true;
    assert.equal(jumpCards(r,'C').length,0,state);assert.throws(()=>jump(r,'C'));
  }
});

test('jumping the last hand card awards a placement and offers spectating without ending other players',()=>{
  const r=setup();r.players[2].hand=[r.players[2].hand[0]];play(r);jump(r,'C');
  assert.equal(r.players[2].finished,true);assert.equal(r.game.winner,'C');assert.equal(r.status,'playing');assert.equal(publicView(r,'C',{},1).spectatorHands.length,3);assert.equal(jumpCards(r,'C').length,0);
});

test('public jump hints expose only the requesting player’s matching card identifiers',()=>{
  const r=setup();play(r);const v=publicView(r,'C',{},2);assert.deepEqual(v.game.jump.cards,[r.players[2].hand[0].id]);assert.equal(v.blockedReasons[v.game.jump.cards[0]],null);
  const json=JSON.stringify(v);for(const p of r.players.filter(p=>p.id!=='C'))for(const c of p.hand)assert.equal(json.includes(c.id),false);
  assert.equal(v.spectatorHands.length,0);assert.equal(JSON.stringify(r.game.history.events).includes(r.players[2].hand[0].id),false);
});

test('an invalid wild color or stale physical top never consumes the player’s card or old effect',()=>{
  const r=setup(4,1,'draw6',0,'wild');play(r);const old=structuredClone(r.game.jump),count=r.players[2].hand.length;
  assert.throws(()=>jump(r,'C',{color:undefined}),/选择/);assert.throws(()=>jump(r,'C',{top:'old-top'}),/抢出机会/);
  assert.equal(r.game.penalty,6);assert.equal(r.players[2].hand.length,count);assert.deepEqual(r.game.jump,old);
});

function storage(initial){let row=structuredClone(initial);return {read:async()=>structuredClone(row),save:async candidate=>{if(candidate.version!==row.version)return false;row={room:structuredClone(candidate.room),version:row.version+1};return true;},get:()=>structuredClone(row)};}
const request=(r,id)=>({type:'jump',top:r.game.jump.top,card:jumpCards(r,id)[0].id,version:10,actionKey:actionKey(r,id),actionId:crypto.randomUUID()});
test('simultaneous jump requests commit only the first and retries of it are idempotent',async()=>{
  const room=setup();play(room);const row={room,version:10},store=storage(row),a=request(room,'C'),b=request(room,'D');
  const results=await Promise.all([commitRoomAction(structuredClone(row),'C',a,()=>({hostOffline:false}),store),commitRoomAction(structuredClone(row),'D',b,()=>({hostOffline:false}),store)]);
  assert.equal(results.filter(r=>r.committed).length,1);assert.equal(results.filter(r=>r.conflict==='changed').length,1);
  const winner=results[0].committed?'C':'D',action=winner==='C'?a:b;
  assert.equal((await commitRoomAction(await store.read(),winner,action,()=>({hostOffline:false}),store)).conflict,undefined);
  assert.equal(store.get().room.logs.filter(e=>e.jump).length,1);
});

test('harmless sorting, UNO and a reversible seven mode choice do not invalidate a jump request',async()=>{
  const room=setup(4,1,'number',7);room.config.seven='choice';play(room);const action=request(room,'C');
  applyAction(room,'A',{type:'chooseSeven',mode:'trade'});applyAction(room,'C',{type:'sort',order:room.players[2].hand.map(c=>c.id).reverse()});
  const row={room,version:13};const result=await commitRoomAction(structuredClone(row),'C',action,()=>({hostOffline:false}),storage(row));assert.equal(result.committed,true);
  assert.equal(validRoomCommand(action),true);
});
