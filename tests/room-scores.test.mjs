import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, applyAction, advanceRoom, publicView, makeDeck, DEFAULT_CONFIG } from '../lib/game.ts';
import { scoreForPlace, settleRoundScores } from '../lib/room-scores.ts';
import { commitRoomAction } from '../lib/room-commit.ts';

const person = id => ({id,name:id,tokenHash:`private-${id}`,hand:[],ready:true,out:false,uno:false});
function setup(t,seats=4) {
  let now=1000000;t.mock.method(Date,'now',()=>now);
  const r=createRoom('SCORE2',person('A'),{...DEFAULT_CONFIG,seats,firstSeat:0,initialCards:1,dealDelayMs:0});
  for(let i=1;i<seats;i++) r.players.push(person(String.fromCharCode(65+i)));
  applyAction(r,'A',{type:'start'});
  const flush=()=>{for(let i=0;i<500;i++){now+=5000;if(!advanceRoom(r,now))return;}throw new Error('did not settle');};
  flush();
  const seed=(specs=r.players.map((_,i)=>[{color:'red',kind:'number',number:i+1}]))=>{
    const deck=makeDeck();
    const take=s=>{const i=deck.findIndex(c=>c.color===s.color&&c.kind===s.kind&&(s.number===undefined||c.number===s.number));assert.ok(i>=0);return deck.splice(i,1)[0];};
    r.game.discard=[take({color:'red',kind:'number',number:9})];r.game.color='red';r.game.retired=[];
    r.players.forEach((p,i)=>p.hand=specs[i].map(take));r.game.deck=deck;
  };
  seed();
  const act=(id,a)=>{applyAction(r,id,a);flush();};
  const finish=()=>{while(r.status==='playing'){const p=r.players.find(p=>p.id===r.game.turn);act(p.id,{type:'play',card:p.hand[0].id});}};
  return {r,act,flush,seed,finish};
}
const conserved=r=>{
  const all=[...r.game.deck,...r.game.discard,...r.game.retired,...r.players.flatMap(p=>p.hand)];
  assert.equal(all.length,168);assert.equal(new Set(all.map(c=>c.id)).size,168);
};

test('three to six seats use the requested score trend, including zero and negative last place',()=>{
  assert.deepEqual([3,4,5,6].map(n=>Array.from({length:n},(_,i)=>scoreForPlace(n,i+1))),[[2,0,-1],[4,2,0,-1],[6,4,2,0,-1],[8,6,4,2,0,-1]]);
});

test('each complete round awards once and room totals survive reset, serialization and negative rounds',t=>{
  for(const n of [3,4,5,6]) {
    const {r,act,seed,finish}=setup(t,n);finish();conserved(r);
    const points=Array.from({length:n},(_,i)=>scoreForPlace(n,i+1));
    assert.deepEqual(r.players.map(p=>r.scores[p.id]),points);
    assert.deepEqual(r.game.placements.map(p=>p.scoreDelta),points);
    settleRoundScores(r);advanceRoom(r,Date.now()+50000);assert.deepEqual(r.players.map(p=>r.scores[p.id]),points);
    const persisted=JSON.parse(JSON.stringify(r));assert.deepEqual(publicView(persisted,'A',{},4).players.map(p=>p.score),points);
    act('A',{type:'reset'});assert.deepEqual(r.players.map(p=>r.scores[p.id]),points);
    r.players.forEach(p=>p.ready=true);act('A',{type:'start'});seed();finish();
    assert.deepEqual(r.players.map(p=>r.scores[p.id]),points.map(p=>p*2));
    assert.equal(r.players.at(-1).id,r.game.loser);assert.equal(r.scores[r.game.loser],-2);
  }
});

test('round two starts with the previous winner even when the configured first seat differs',t=>{
  const {r,act,finish}=setup(t);r.game.turn='B';finish();assert.equal(r.game.winner,'B');assert.equal(r.nextStarter,'B');
  act('A',{type:'reset'});assert.equal(publicView(r,'A',{},1).nextStarter,'B');
  r.players.forEach(p=>p.ready=true);act('A',{type:'start'});assert.equal(r.game.round,2);assert.equal(r.game.turn,'B');
});

test('a missing previous winner falls back to the lobby starter and preserves everyone else’s score',t=>{
  const {r,act,finish}=setup(t);r.game.turn='B';finish();act('A',{type:'reset'});
  act('A',{type:'kick',target:'B'});assert.equal(publicView(r,'A',{},1).nextStarter,null);
  act('A',{type:'addBots'});r.players.forEach(p=>p.ready=true);act('A',{type:'start'});
  assert.equal(r.game.turn,'A');assert.equal(r.scores.B,4);assert.equal(r.scores.A,-1);
});

test('withdrawal grants live spectator hands; a winner keeps spectator access after leaving active play',t=>{
  const {r,act}=setup(t);act('A',{type:'play',card:r.players[0].hand[0].id});
  assert.equal(publicView(r,'A',{},1).spectating,true);act('A',{type:'leave'});
  assert.equal(publicView(r,'A',{},2).spectating,true);assert.equal(r.players[0].finished,true);
  act('C',{type:'leave'});const watch=publicView(r,'C',{},3);
  assert.equal(watch.spectating,true);assert.equal(watch.players.find(p=>p.id==='C').withdrawn,true);
  assert.deepEqual(watch.spectatorHands.map(p=>p.id),['B','D']);assert.deepEqual(watch.hand,[]);
  assert.equal(publicView(r,'B',{},3).spectatorHands.length,0);conserved(r);
  assert.throws(()=>act('C',{type:'draw'}));
});

test('knockouts fill the middle ranks in reverse departure order; final survivor is still last',t=>{
  const {r,act,finish}=setup(t,5);act('D',{type:'leave'});act('E',{type:'leave'});finish();
  assert.deepEqual(r.game.placements.map(p=>[p.player,p.rank,p.scoreDelta]),[['A',1,6],['B',2,4],['E',3,2],['D',4,0],['C',5,-1]]);
  conserved(r);
});

test('the final penalty knockout receives last-place points when the other remaining hands finish together',t=>{
  const {r,act,seed}=setup(t);
  const numbers=Array.from({length:20},(_,i)=>({color:'blue',kind:'number',number:i%10}));
  seed([[{color:'red',kind:'draw2'}],[{color:'blue',kind:'draw2'}],[...numbers,...Array.from({length:3},()=>({color:'blue',kind:'skip'})),{color:'blue',kind:'reverse'}],[{color:'green',kind:'number',number:5}]]);
  act('D',{type:'leave'});act('A',{type:'play',card:r.players[0].hand[0].id});act('B',{type:'play',card:r.players[1].hand[0].id});act('C',{type:'draw'});
  assert.equal(r.status,'finished');assert.equal(r.game.loser,'C');
  assert.deepEqual(r.game.placements.map(p=>[p.player,p.scoreDelta]),[['A',4],['B',2],['D',0],['C',-1]]);conserved(r);
});

test('host kick validates permissions, preserves a live round, revokes viewing and survives reset',async t=>{
  const {r,act}=setup(t);assert.throws(()=>act('B',{type:'kick',target:'C'}),/房主/);assert.throws(()=>act('A',{type:'kick',target:'A'}),/另一位/);
  act('A',{type:'kick',target:'B'});assert.equal(r.status,'playing');assert.equal(r.players[1].removed,true);
  assert.equal(publicView(r,'B',{},1).spectating,false);assert.deepEqual(publicView(r,'B',{},1).spectatorHands,[]);
  assert.throws(()=>act('B',{type:'claimHost'}),/移出/);conserved(r);
  const committed=await commitRoomAction({room:r,version:1},'B',{type:'sort',actionId:'revoked',version:1},()=>({hostOffline:false}),{read:async()=>null,save:async()=>{throw new Error('revoked seat must not write');}});
  assert.equal(committed.conflict,'expired');
  act('A',{type:'play',card:r.players[0].hand[0].id});act('C',{type:'play',card:r.players[2].hand[0].id});
  assert.equal(r.status,'finished');assert.equal(r.scores.B,0);act('A',{type:'reset'});
  assert.equal(r.players.some(p=>p.id==='B'),false);assert.equal(r.scores.A,4);assert.equal(r.config.seats,4);
});

test('kicking a pending participant or a player receiving a penalty cannot strand the turn',t=>{
  for(const pending of [{kind:'zero',actor:'B'},{kind:'target',actor:'B'},{kind:'take',actor:'C',target:'B'},{kind:'return',actor:'B',target:'C'},{kind:'roulette',actor:'B',color:'red'}]) {
    const {r,act}=setup(t);r.game.turn=pending.actor;r.game.pending=pending;
    act('A',{type:'kick',target:'B'});assert.equal(r.game.pending,null);assert.notEqual(r.game.turn,'B');assert.equal(r.status,'playing');conserved(r);
  }
  const {r,act}=setup(t);r.game.turn='B';r.game.penalty=8;r.game.lastDraw=4;r.game.drawing={player:'B',mode:'penalty',drawn:2,total:8,nextAt:Date.now()+1000};
  act('A',{type:'kick',target:'B'});assert.equal(r.game.drawing,null);assert.equal(r.game.penalty,0);assert.equal(r.game.turn,'C');conserved(r);
});

test('kicking during dealing returns safely to lobby without awarding points',t=>{
  const {r,act,finish}=setup(t);finish();act('A',{type:'reset'});r.config.dealDelayMs=300;r.players.forEach(p=>p.ready=true);
  applyAction(r,'A',{type:'start'});assert.equal(r.status,'dealing');applyAction(r,'A',{type:'kick',target:'C'});
  assert.equal(r.status,'lobby');assert.equal(r.game,null);assert.equal(r.players.length,3);assert.ok(r.players.every(p=>p.hand.length===0));assert.equal(r.scores.A,4);
});
