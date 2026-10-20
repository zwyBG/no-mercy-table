import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,applyAction,advanceRoom,publicView,DEFAULT_CONFIG} from '../lib/game.ts';
import {actionKey} from '../lib/action-intent.ts';
import {commitRoomAction} from '../lib/room-commit.ts';

const person=id=>({id,name:id,tokenHash:`private-${id}`,hand:[],ready:true,out:false,uno:false});
const context=()=>({hostOffline:false});
function setup() {
  const room=createRoom('RACE23',person('A'),{...DEFAULT_CONFIG,firstSeat:0,dealDelayMs:0});room.players.push(person('B'),person('C'));
  applyAction(room,'A',{type:'start'});advanceRoom(room,room.presentationUntil);room.game.penalty=2;room.game.lastDraw=2;
  return {room,version:10};
}
function store(initial,race) {
  let current=structuredClone(initial),writes=0;
  return {
    read:async()=>structuredClone(current),
    save:async candidate=>{
      writes++;if(race)await race(current,candidate,writes);
      if(candidate.version!==current.version)return false;
      current={room:structuredClone(candidate.room),version:current.version+1};return true;
    },
    get:()=>structuredClone(current),writes:()=>writes,
  };
}
const action=(row,id,type='draw',extra={})=>({type,version:row.version,actionKey:actionKey(row.room,id),actionId:crypto.randomUUID(),...extra});

test('animation expiry, transfer metadata and another hand being reordered do not invalidate a turn intent',()=>{
  const row=setup(),key=actionKey(row.room,'A');row.room.presentationUntil=Date.now()+5000;
  row.room.players[1].hand.reverse();row.room.logs.push({id:999,text:'unrelated update'});row.room.game.transfer={id:'cosmetic',from:'B',to:'C'};
  assert.equal(actionKey(row.room,'A'),key);row.room.players[0].hand.reverse();assert.equal(actionKey(row.room,'A'),key);
  const view=publicView(row.room,'A',{},1);assert.equal(view.actionKey,key);
  for(const c of row.room.players[1].hand)assert.equal(key.includes(`"${c.id}"`),false,'opponents card identifiers never enter the key');
});

test('a stale draw survives harmless updates and retries three competing D1 writes without applying twice',async()=>{
  const initial=setup(),request=action(initial,'A');
  const storage=store(initial,(current,_candidate,n)=>{
    if(n<=3){current.room.players[1].hand.reverse();current.version++;}
  });
  const result=await commitRoomAction(structuredClone(initial),'A',request,context,storage);
  assert.equal(result.committed,true);assert.equal(result.conflict,undefined);assert.equal(storage.writes(),4);
  const saved=storage.get();assert.equal(saved.room.game.drawing.total,2);assert.equal(saved.room.actions.filter(id=>id===request.actionId).length,1);
  assert.equal(saved.room.logs.filter(e=>e.effect==='penalty').length,1);
});

test('two players can sort concurrently and each final hand order is retained',async()=>{
  const initial=setup(),storage=store(initial),a=initial.room.players[0].hand.map(c=>c.id).reverse(),b=initial.room.players[1].hand.map(c=>c.id).reverse();
  const results=await Promise.all([
    commitRoomAction(structuredClone(initial),'A',action(initial,'A','sort',{order:a}),context,storage),
    commitRoomAction(structuredClone(initial),'B',action(initial,'B','sort',{order:b}),context,storage),
  ]);
  assert.ok(results.every(r=>r.committed&&!r.conflict));const saved=storage.get();
  assert.deepEqual(saved.room.players[0].hand.map(c=>c.id),a);assert.deepEqual(saved.room.players[1].hand.map(c=>c.id),b);
});

test('a response retry finds an already committed action id before checking a now-stale turn',async()=>{
  const initial=setup(),request=action(initial,'A'),storage=store(initial,(current,_candidate,n)=>{
    if(n===1){applyAction(current.room,'A',request);current.room.actions.push(request.actionId);current.version++;}
  });
  const result=await commitRoomAction(structuredClone(initial),'A',request,context,storage);
  assert.equal(result.committed,false);assert.equal(result.conflict,undefined);assert.equal(storage.writes(),1);
  assert.equal(storage.get().room.logs.filter(e=>e.effect==='penalty').length,1);
});

test('a changed turn, hand, pending choice or round rejects the old intent and returns the current row',async()=>{
  for(const mutate of [r=>r.game.turn='B',r=>r.players[0].hand.pop(),r=>r.game.pending={kind:'zero',actor:'A'},r=>r.game.round++]) {
    const original=setup(),request=action(original,'A'),latest=structuredClone(original);mutate(latest.room);latest.version++;
    const storage=store(latest),result=await commitRoomAction(structuredClone(latest),'A',request,context,storage);
    assert.equal(result.conflict,'changed');assert.equal(result.committed,false);assert.equal(result.row.version,latest.version);assert.equal(storage.writes(),0);
  }
});

test('sorting from an older view appends newly dealt cards, but refuses to reorder cards no longer held',async()=>{
  const original=setup(),ids=original.room.players[0].hand.map(c=>c.id).reverse(),request=action(original,'A','sort',{order:ids}),latest=structuredClone(original);
  const extra={id:'newly-dealt',kind:'number',number:8,color:'green'};latest.room.players[0].hand.push(extra);latest.version++;
  const storage=store(latest);assert.equal((await commitRoomAction(structuredClone(latest),'A',request,context,storage)).committed,true);
  assert.deepEqual(storage.get().room.players[0].hand.map(c=>c.id),[...ids,extra.id]);
  latest.room.players[0].hand=latest.room.players[0].hand.slice(1);latest.version++;
  await assert.rejects(commitRoomAction(structuredClone(latest),'A',request,context,store(latest)),/手牌已变化/);
});

test('sustained write contention stays bounded and never reports an uncommitted action as successful',async()=>{
  const initial=setup(),storage=store(initial,current=>{current.version++;}),request=action(initial,'A');
  const result=await commitRoomAction(structuredClone(initial),'A',request,context,storage);
  assert.equal(result.conflict,'busy');assert.equal(storage.writes(),4);assert.equal(result.row.version,14);
  assert.equal(storage.get().room.actions.includes(request.actionId),false);assert.equal(storage.get().room.game.drawing,undefined);
});
