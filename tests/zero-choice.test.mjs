import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,applyAction,advanceRoom,botAction,publicView,DEFAULT_CONFIG} from '../lib/game.ts';
import {keyReplayFrames} from '../lib/match-history.ts';

const person=id=>({id,name:id,tokenHash:`secret-${id}`,hand:[],ready:true,out:false,uno:false});
let serial=0;const card=(number,color='red')=>({id:`zero-${++serial}`,color,kind:'number',number});
function setup(seats=3,direction=1) {
  const r=createRoom('ZERO23',person('A'),{...DEFAULT_CONFIG,seats,direction,firstSeat:0,dealDelayMs:0});
  for(let i=1;i<seats;i++)r.players.push(person(String.fromCharCode(65+i)));
  applyAction(r,'A',{type:'start'});advanceRoom(r,r.presentationUntil);r.game.color='red';r.game.discard=[card(5)];
  r.players.forEach((p,i)=>p.hand=[card(i+2),card(i+3,'blue')]);return r;
}

test('zero waits for its owner to choose; rotating can interrupt its announcement and records only public counts',()=>{
  const r=setup(),zero=card(0);r.players[0].hand.unshift(zero);
  applyAction(r,'A',{type:'play',card:zero.id});const before=r.players.map(p=>[...p.hand]);
  assert.deepEqual(r.game.pending,{kind:'zero',actor:'A'});assert.equal(r.game.turn,'A');assert.ok(r.presentationUntil>Date.now());
  assert.deepEqual(publicView(r,'B',{},1).game.playable,[]);
  applyAction(r,'A',{type:'chooseZero',rotate:true});
  assert.deepEqual(r.players.map(p=>p.hand),[before[2],before[0],before[1]]);assert.equal(r.game.turn,'B');assert.equal(r.game.pending,null);
  const event=r.game.history.events.findLast(e=>e.kind==='rotation');assert.ok(event);assert.ok(keyReplayFrames(r.game.history.events).includes(event));
  assert.equal(JSON.stringify(event).includes(before[1][0].id),false);assert.equal(publicView(r,'B',{},2).spectatorHands.length,0);
});

test('keeping hands leaves their exact manual order and UNO announcement unchanged',()=>{
  const r=setup(),zero=card(0);r.players[0].hand=[zero,card(4)];
  applyAction(r,'A',{type:'play',card:zero.id,uno:true});const before=structuredClone(r.players.map(p=>p.hand));
  applyAction(r,'A',{type:'chooseZero',rotate:false});assert.deepEqual(r.players.map(p=>p.hand),before);
  assert.equal(r.game.turn,'B');assert.equal(r.players[0].uno,true);assert.deepEqual(r.game.risk,[]);
});

test('rotation follows either direction and skips finished and knocked-out seats',()=>{
  for(const direction of [1,-1]) {
    const r=setup(5,direction),zero=card(0);r.players[0].hand.unshift(zero);
    r.players[2].finished=true;r.players[2].hand=[];r.players[3].out=true;r.players[3].hand=[];
    applyAction(r,'A',{type:'play',card:zero.id});const [a,b,e]=[r.players[0].hand,r.players[1].hand,r.players[4].hand];
    applyAction(r,'A',{type:'chooseZero',rotate:true});
    assert.deepEqual([r.players[0].hand,r.players[1].hand,r.players[4].hand],direction===1?[e,a,b]:[b,e,a]);
    assert.equal(r.game.turn,direction===1?'B':'E');assert.equal(r.players[2].hand.length,0);assert.equal(r.players[3].hand.length,0);
  }
});

test('only the zero owner can choose a strict boolean and pause still prevents actual gameplay',()=>{
  const r=setup(),zero=card(0);r.players[0].hand.unshift(zero);applyAction(r,'A',{type:'play',card:zero.id});
  assert.throws(()=>applyAction(r,'B',{type:'chooseZero',rotate:true}),/出 0/);
  for(const rotate of ['true',null,undefined])assert.throws(()=>applyAction(r,'A',{type:'chooseZero',rotate}),/请选择/);
  applyAction(r,'A',{type:'pause',paused:true});assert.throws(()=>applyAction(r,'A',{type:'chooseZero',rotate:false}),/暂停/);
  applyAction(r,'A',{type:'pause',paused:false});applyAction(r,'A',{type:'chooseZero',rotate:false});assert.equal(r.game.turn,'B');
});

test('bots resolve either zero choice using public hand counts without waiting for its visual effect',()=>{
  for(const incoming of [1,4]) {
    const r=setup(),zero=card(0);r.players[0].hand.unshift(zero);r.players[0].bot=true;r.players[2].hand=Array.from({length:incoming},()=>card(8));
    applyAction(r,'A',{type:'play',card:zero.id});const move=botAction(r);
    assert.deepEqual(move,{id:'A',action:{type:'chooseZero',rotate:incoming<2}});applyAction(r,move.id,move.action);assert.equal(r.game.pending,null);
  }
});

test('a zero that clears the last card retains the existing immediate placement rule',()=>{
  const r=setup(),zero=card(0);r.players[0].hand=[zero];const b=[...r.players[1].hand];
  applyAction(r,'A',{type:'play',card:zero.id});assert.equal(r.players[0].finished,true);assert.equal(r.game.pending,null);assert.equal(r.game.turn,'B');assert.deepEqual(r.players[1].hand,b);
});
