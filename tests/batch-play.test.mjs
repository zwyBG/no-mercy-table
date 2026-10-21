import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,createRoom,DEFAULT_CONFIG,botAction,publicView} from '../lib/game.ts';
import {matchingCards,cardsForAction} from '../lib/card-play.ts';
import {commitRoomAction} from '../lib/room-commit.ts';
import {actionKey} from '../lib/action-intent.ts';

let serial=0;const card=(kind='number',number=2,color='yellow')=>({id:`batch-${++serial}`,kind,color,...(kind==='number'?{number}:{})});
const person=id=>({id,name:id,tokenHash:`secret-${id}`,hand:[],ready:true,out:false,uno:false});
function setup(kind='number',copies=3,number=2,color='yellow'){
  const r=createRoom('BATCH2',person('A'),{...DEFAULT_CONFIG,seats:4,dealDelayMs:0,firstSeat:0});for(const id of ['B','C','D'])r.players.push(person(id));applyAction(r,'A',{type:'start'});
  r.game.discard=[card('number',9)];r.game.color='yellow';r.players.forEach(p=>p.hand=[...Array.from({length:copies},()=>card(kind,number,color)),card('number',8,'blue'),card('number',6,'green')]);return r;
}
function batch(r,id='A',n=2,type='play',extra={}){const p=r.players.find(p=>p.id===id),cards=p.hand.slice(0,n).map(c=>c.id);return applyAction(r,id,{type,card:cards[0],cards,top:r.game.jump?.top,color:'red',uno:true,...extra});}
const inventory=r=>[...r.game.deck,...r.game.discard,...r.game.retired,...r.players.flatMap(p=>p.hand)].map(c=>c.id).sort();

test('matching card quantities preserve the selected primary and the exact manual order of other copies',()=>{
  const hand=[card(),card('number',3),card(),card('number',2,'red'),card()];const before=structuredClone(hand);
  assert.deepEqual(matchingCards(hand,hand[2].id).map(c=>c.id),[hand[2].id,hand[0].id,hand[4].id]);assert.deepEqual(hand,before);assert.deepEqual(matchingCards(hand,'missing'),[]);
});
test('two, three or more identical cards are removed atomically and the physical last copy opens the next jump window',()=>{
  for(const n of [2,3,8]){const r=setup('number',n),before=inventory(r),ids=r.players[0].hand.slice(0,n).map(c=>c.id);batch(r,'A',n);assert.equal(r.players[0].hand.length,2);assert.deepEqual(r.game.discard.slice(-n).map(c=>c.id),ids);assert.equal(r.game.jump.top,ids.at(-1));assert.equal(r.game.turn,'B');assert.deepEqual(inventory(r),before);assert.equal(r.logs.findLast(e=>e.copies)?.copies,n);}
});
test('batch +2/+4/+6/+10 and reverse +4 trigger one replacement attack, even over an existing penalty chain',()=>{
  for(const [kind,color,value] of [['draw2','yellow',2],['draw4','yellow',4],['draw6','wild',6],['draw10','wild',10],['reverse4','wild',4]]){
    const r=setup(kind,3,0,color);r.game.penalty=2;r.game.lastDraw=2;r.game.discard=[card('draw2',0)];r.game.penaltyChain=[{player:'D',value:2,color:'yellow'}];
    batch(r,'A',3);assert.equal(r.game.penalty,value,kind);assert.deepEqual(r.game.penaltyChain.map(c=>c.value),[value]);assert.equal(r.game.direction,kind==='reverse4'?-1:1);
    const cue=r.logs.findLast(e=>e.copies).cue;assert.equal(cue.total,value);assert.equal(cue.amount,value);
  }
});
test('a batch cannot turn lower-value cards into a legal higher-value stack',()=>{
  const r=setup('draw2');r.game.discard=[card('draw4',0)];r.game.penalty=4;r.game.lastDraw=4;
  assert.throws(()=>batch(r,'A',3),/不能出/);assert.equal(r.players[0].hand.length,5);assert.equal(r.game.penalty,4);
});
test('a multi-card jump remains a single effect and uses the nearest seat direction once',()=>{
  const r=setup('reverse4',3,0,'wild');applyAction(r,'A',{type:'play',card:r.players[0].hand[0].id,color:'yellow'});const before=inventory(r);
  batch(r,'D',3,'jump');assert.equal(r.game.direction,1);assert.equal(r.game.penalty,4);assert.equal(r.game.turn,'A');assert.equal(r.players[3].hand.length,2);assert.deepEqual(inventory(r),before);
});
test('batch reverse, skip and skip-all perform one action and retain jump restrictions for blocked seats',()=>{
  for(const kind of ['reverse','skip','skipall']){
    const r=setup(kind);batch(r,'A',2);assert.equal(r.game.direction,kind==='reverse'?-1:1);
    assert.equal(r.game.turn,kind==='reverse'?'D':kind==='skip'?'C':'A');
    if(kind==='skip')assert.deepEqual(publicView(r,'B',{},2).game.jump.cards,[]);
    if(kind==='skipall')for(const id of ['B','C','D'])assert.deepEqual(publicView(r,id,{},2).game.jump.cards,[]);
  }
});
test('zero, seven and roulette batches open just one pending choice for the correct player',()=>{
  for(const [kind,number,color,pending,actor] of [['number',0,'yellow','zero','A'],['number',7,'yellow','target','A'],['roulette',0,'wild','roulette','B']]){
    const r=setup(kind,3,number,color);batch(r,'A',3);assert.equal(r.game.pending.kind,pending);assert.equal(r.game.pending.actor,actor);assert.equal(r.players[0].hand.length,2);
    if(kind==='number'&&number===0){const hands=structuredClone(r.players.map(p=>p.hand));applyAction(r,'A',{type:'chooseZero',rotate:false});assert.deepEqual(r.players.map(p=>p.hand),hands);}
  }
});
test('discard-all batches preserve every card and do not trigger buried zero/seven cards',()=>{
  const r=setup('discard');r.players[0].hand.push(card('number',0),card('number',7));const before=inventory(r);batch(r,'A',2);
  assert.equal(r.players[0].hand.length,2);assert.equal(r.game.pending,null);assert.deepEqual(inventory(r),before);
});
test('a numeric batch can finish a hand, while a final penalty batch waits for the actual attack settlement',()=>{
  const r=setup();r.players[0].hand=r.players[0].hand.slice(0,3);batch(r,'A',3);assert.equal(r.players[0].finished,true);assert.equal(r.game.placements[0].rank,1);assert.equal(r.status,'playing');
  const penalty=setup('draw4');penalty.players[0].hand=penalty.players[0].hand.slice(0,3);batch(penalty,'A',3);assert.equal(penalty.players[0].finished,false);assert.deepEqual(penalty.game.finishers,['A']);assert.equal(penalty.game.penalty,4);
});
test('batch UNO follows the remaining count and does not depend on how many copies were played',()=>{
  const r=setup();r.players[0].hand.pop();batch(r,'A',3);assert.equal(r.players[0].hand.length,1);assert.equal(r.players[0].uno,true);
});
test('mixed faces, invented ids, duplicate ids, invalid counts and non-primary lists reject before consuming cards',()=>{
  const r=setup(),p=r.players[0],base=p.hand[0].id,before=structuredClone(p.hand);
  for(const cards of [[],[base,base],[base,'missing'],[base,p.hand[3].id],[p.hand[1].id,base],null,'not-a-list']){
    assert.throws(()=>applyAction(r,'A',{type:'play',card:base,cards}));assert.deepEqual(p.hand,before);
  }
  assert.equal(cardsForAction(p.hand,{type:'play',card:base}).length,1);
});
test('batch selection does not bypass turn, pause, jump eligibility or wild color validation',()=>{
  const r=setup();assert.throws(()=>batch(r,'C'),/轮到/);applyAction(r,'A',{type:'pause',paused:true});assert.throws(()=>batch(r),/暂停/);
  const wild=setup('draw6',3,0,'wild');assert.throws(()=>batch(wild,'A',3,'play',{color:undefined}),/颜色/);assert.equal(wild.players[0].hand.length,5);
});
test('bots may batch their own identical cards and replay stores only a public face and copy count',()=>{
  const r=setup();r.players[0].bot=true;const move=botAction(r);assert.equal(move.action.cards.length,3);applyAction(r,'A',move.action,{hostOffline:false,automated:true});
  const event=r.game.history.events.findLast(e=>e.kind==='play');assert.equal(event.copies,3);assert.equal(JSON.stringify(event).includes('batch-'),false);
  for(const p of r.players.slice(1))for(const c of p.hand)assert.equal(JSON.stringify(publicView(r,'A',{},3)).includes(c.id),false);
});
test('retrying an accepted batch after a lost acknowledgement never discards the cards twice',async()=>{
  const room=setup(),ids=room.players[0].hand.slice(0,3).map(c=>c.id),request={type:'play',card:ids[0],cards:ids,version:1,actionKey:actionKey(room,'A'),actionId:'batch-once'};
  let row={room:structuredClone(room),version:1};const storage={read:async()=>structuredClone(row),save:async candidate=>{row={room:structuredClone(candidate.room),version:row.version+1};return true;}};
  const result=await commitRoomAction(structuredClone(row),'A',request,()=>({hostOffline:false}),storage);assert.equal(result.committed,true);
  const retried=await commitRoomAction(structuredClone(row),'A',request,()=>({hostOffline:false}),storage);assert.equal(retried.committed,false);assert.equal(retried.conflict,undefined);assert.equal(row.room.players[0].hand.length,2);assert.equal(row.room.game.discard.length,4);
});
