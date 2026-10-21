import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, applyAction, advanceRoom, publicView, botAction, DEFAULT_CONFIG } from '../lib/game.ts';

const person = id => ({id,name:id,tokenHash:`private-${id}`,hand:[],ready:true,out:false,uno:false});
let serial = 0;
const card = (number=3,color='red',kind='number') => ({id:`ranking-${++serial}`,color,kind,number});
function setup(t, seats=3, direction=1) {
  let now = 1000000; t.mock.method(Date,'now',()=>now);
  const r = createRoom('RANK23',person('A'),{...DEFAULT_CONFIG,seats,firstSeat:0,dealDelayMs:0,initialCards:1,direction});
  for (let i=1;i<seats;i++) r.players.push(person(String.fromCharCode(65+i)));
  applyAction(r,'A',{type:'start'});
  const settle = () => { for(let i=0;i<500;i++) { now+=10000; if(!advanceRoom(r,now)) return; } throw new Error('round did not settle'); };
  settle(); r.game.discard=[card(9)]; r.game.color='red';
  r.players.forEach((p,i)=>p.hand=[card(i+1)]);
  const act = (id,action,context) => { const result=applyAction(r,id,action,context); settle(); return result; };
  return {r,act,settle,tick:(at)=>{now=at;return advanceRoom(r,now);}};
}

test('three through six players finish in order in both directions; only the final player loses', t => {
  for(const seats of [3,4,5,6]) for(const direction of [1,-1]) {
    const {r,act}=setup(t,seats,direction), others=r.players.slice(1).map(p=>p.id), order=['A',...(direction===1?others:others.reverse())];
    const original = r.players.map(p=>p.hand[0].id);
    for(let i=0;i<seats-1;i++) {
      const p=r.players.find(p=>p.id===order[i]); assert.equal(r.game.turn,p.id);
      act(p.id,{type:'play',card:p.hand[0].id});
      assert.equal(p.finished,true); assert.equal(r.game.placements.find(e=>e.player===p.id).rank,i+1);
      if(i<seats-2) { assert.equal(r.status,'playing'); assert.equal(r.game.result,undefined); }
    }
    assert.equal(r.status,'finished'); assert.equal(r.game.winner,'A'); assert.equal(r.game.loser,order.at(-1));
    assert.equal(r.game.placements.at(-1).kind,'last'); assert.equal(r.game.placements.at(-1).rank,seats);
    assert.equal(r.players.find(p=>p.id===r.game.loser).hand[0].id,original[r.players.findIndex(p=>p.id===r.game.loser)]);
  }
});

test('finished players are skipped by reverse, zero rotation, seven targets and bots', t => {
  const {r,act}=setup(t), reverse=card(0,'red','reverse'),zero=card(0),kept=card(9,'blue');
  r.players[1].hand=[reverse,zero,kept]; r.players[2].hand=[card(4,'green'),card(5,'green')];
  act('A',{type:'play',card:r.players[0].hand[0].id});
  act('B',{type:'play',card:reverse.id}); assert.equal(r.game.turn,'B');
  const received=r.players[2].hand.map(c=>c.id); act('B',{type:'play',card:zero.id});act('B',{type:'chooseZero',rotate:true});
  assert.deepEqual(r.players[1].hand.map(c=>c.id),received); assert.deepEqual(r.players[2].hand,[kept]); assert.deepEqual(r.players[0].hand,[]);
  const seven=card(7); r.players[2].hand=[seven,card(6)]; r.game.color='red';
  act('C',{type:'play',card:seven.id}); assert.throws(()=>act('C',{type:'target',target:'A'}),/在局/);
  r.players[2].bot=true; const move=botAction(r); assert.equal(move.id,'C'); if(move.action.type==='target') assert.equal(move.action.target,'B');
  r.players[0].bot=true; r.game.turn='A'; r.game.pending=null; assert.equal(botAction(r),null);
});

test('a pending last attack can come back to its sender, cancelling that provisional finish', t => {
  const {r,act}=setup(t),a=card(0,'red','draw2'),b=card(0,'blue','draw2'),c=card(0,'green','draw2');
  r.players[0].hand=[a];r.players[1].hand=[b,card(8)];r.players[2].hand=[c,card(9)];
  act('A',{type:'play',card:a.id}); assert.equal(publicView(r,'A',{},1).spectating,false);
  act('B',{type:'play',card:b.id});act('C',{type:'play',card:c.id}); assert.equal(r.game.turn,'A');
  act('A',{type:'draw'}); assert.equal(r.players[0].hand.length,6); assert.equal(r.players[0].finished,false);
  assert.deepEqual(r.game.placements,[]);assert.equal(r.game.winner,null);assert.equal(r.status,'playing');
});

test('a chain with multiple last cards ranks finishers in play order only after the full debt resolves', t => {
  const {r,act}=setup(t),a=card(0,'red','draw2'),b=card(0,'blue','draw2');
  r.players[0].hand=[a];r.players[1].hand=[b];r.players[2].hand=[card(9,'yellow')];
  act('A',{type:'play',card:a.id});act('B',{type:'play',card:b.id});assert.equal(r.game.winner,null);assert.equal(r.status,'playing');
  act('C',{type:'draw'});assert.equal(r.players[2].hand.length,5);assert.equal(r.status,'finished');
  assert.deepEqual(r.game.placements.map(e=>[e.player,e.kind,e.rank]),[['A','finished',1],['B','finished',2],['C','last',3]]);
});

test('last roulette stays interactive before granting spectating, then the remaining players continue', t => {
  const {r,act}=setup(t),roulette=card(0,'wild','roulette');r.players[0].hand=[roulette];r.game.deck=[card(5,'blue'),card(6,'green')];
  act('A',{type:'play',card:roulette.id});assert.equal(publicView(r,'A',{},1).spectating,false);
  act('B',{type:'color',color:'blue'});act('B',{type:'drawRoulette'});assert.equal(r.players[0].finished,false);
  act('B',{type:'drawRoulette'});assert.equal(r.players[0].finished,true);assert.equal(publicView(r,'A',{},2).spectating,true);assert.equal(r.status,'playing');assert.equal(r.game.turn,'C');
});

test('only finished or knocked-out seats receive all remaining hands and live draw updates', t => {
  const {r,act}=setup(t,4);r.players[1].hand=[card(2),card(4)];r.players[2].hand=[card(3),card(6)];
  act('A',{type:'play',card:r.players[0].hand[0].id});
  const first=publicView(r,'A',{},1);assert.equal(first.spectating,true);assert.deepEqual(first.spectatorHands.map(p=>p.id),['B','C','D']);assert.deepEqual(first.spectatorHands[0].cards,r.players[1].hand);
  for(const id of ['B','C','D','unknown']) {const v=publicView(r,id,{},1);assert.equal(v.spectating,false);assert.deepEqual(v.spectatorHands,[]);assert.ok(v.players.every(p=>!('hand' in p)));}
  r.config.drawMode='single';r.game.deck=[card(8,'blue')];act('B',{type:'draw'});
  const updated=publicView(r,'A',{},2);assert.equal(updated.spectatorHands[0].cards.length,3);assert.equal(updated.spectatorHands[0].cards.at(-1).color,'blue');
  r.players[2].hand=Array.from({length:24},()=>card(8,'blue'));r.game.deck=[card(6)];act('C',{type:'draw'});
  assert.equal(r.players[2].out,true);const knocked=publicView(r,'C',{},3);assert.equal(knocked.spectating,true);assert.deepEqual(knocked.spectatorHands.map(p=>p.id),['B','D']);
  assert.equal(JSON.stringify(updated).includes('private-'),false);
});

test('spectators cannot play, draw, sort, catch or use autoplay; host controls and props remain usable', t => {
  const {r,act}=setup(t);r.players[1].hand.push(card(5));act('A',{type:'play',card:r.players[0].hand[0].id});
  for(const action of [{type:'play',card:r.players[1].hand[0].id},{type:'draw'},{type:'sort',order:[]},{type:'catch',target:'B'},{type:'uno'},{type:'target',target:'B'},{type:'autoplay',enabled:true}]) assert.throws(()=>act('A',action));
  act('A',{type:'pause',paused:true});assert.ok(r.pause);act('A',{type:'pause',paused:false});
  act('A',{type:'social',target:'B',kind:'duck'});assert.equal(r.social.events.at(-1).from,'A');
  const before=r.game.placements.length;act('A',{type:'leave'});assert.equal(r.game.placements.length,before);assert.equal(r.host,'B');assert.equal(r.status,'playing');
});

test('the earliest knockout is last while the final survivor keeps a separate placement', t => {
  const {r,act}=setup(t);r.players[0].hand=Array.from({length:24},()=>card(5,'blue'));r.config.drawMode='single';
  r.game.deck=[card(6)];r.players[0].autoplay=true;act('A',{type:'draw'},{hostOffline:false,automated:true});assert.equal(r.players[0].autoplay,false);assert.equal(r.status,'playing');assert.equal(r.game.placements[0].kind,'knockout');
  act('B',{type:'play',card:r.players[1].hand[0].id});assert.equal(r.game.winner,'B');assert.equal(r.game.loser,'A');assert.equal(r.game.placements.find(e=>e.player==='B').rank,1);
  assert.equal(r.game.placements.at(-1).rank,3);
});

test('the full result includes finish checkpoints without hidden hands and resets spectator privileges next round', t => {
  const {r,act}=setup(t),secret=card(4,'yellow');r.players[2].hand=[secret];
  act('A',{type:'play',card:r.players[0].hand[0].id});act('B',{type:'play',card:r.players[1].hand[0].id});
  const recap=publicView(r,'A',{},3).game.recap;
  assert.equal(recap.events.filter(e=>e.kind==='finish').length,3);assert.ok(recap.events.some(e=>e.counts.some(p=>p.finished&&p.rank===1)));
  assert.equal(JSON.stringify(recap).includes(secret.id),false);assert.equal(JSON.stringify(recap).includes('cards'),false);
  act('A',{type:'reset'});assert.ok(r.players.every(p=>!p.finished&&!p.out));assert.equal(publicView(r,'A',{},4).spectating,false);
  r.players.forEach(p=>p.ready=true);act('A',{type:'start'});assert.deepEqual(r.game.placements,[]);assert.equal(r.game.loser,null);assert.equal(publicView(r,'A',{},5).spectating,false);
});
