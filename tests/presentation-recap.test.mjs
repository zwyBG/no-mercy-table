import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction as perform, advanceRoom, createRoom, publicView, DEFAULT_CONFIG } from '../lib/game.ts';
import { EffectQueue, TRANSFER_TIMING } from '../lib/presentation.ts';
import { keyReplayFrames, REPLAY_LIMIT } from '../lib/match-history.ts';

function applyAction(r, id, action, context) {
  if (r.presentationUntil && !r.pause) advanceRoom(r, r.presentationUntil);
  return perform(r, id, action, context);
}

const person = id => ({ id, tokenHash: `secret-${id}`, name: id, hand: [], ready: true, out: false, uno: false });
const card = (id, color, kind = 'number', number = 3) => ({ id, color, kind, number });
function fresh(seven = 'swap') {
  const r = createRoom('REC234', person('A'), { ...DEFAULT_CONFIG, seven, dealDelayMs: 0, firstSeat: 0 });
  r.players.push(person('B'), person('C')); applyAction(r, 'A', { type: 'start' });
  r.game.discard = [card('top', 'red', 'number', 5)]; r.game.color = 'red'; return r;
}
function drain(r) { for (let i = 0; i < 150 && advanceRoom(r, Date.now() + 10000 * (i + 1)); i++); }

test('new effects replace the active announcement and never build a playback backlog', () => {
  const q = new EffectQueue(); q.sync('first', [{ id: 1, text: 'old', effect: 'begin' }]);
  assert.equal(q.next(), null, 'joining does not replay old logs');
  q.sync('first', [{ id: 2, text: '+2', effect: 'draw2' }, { id: 3, text: '+4', effect: 'draw4' }]);
  assert.equal(q.next().id, 3);assert.equal(q.pending.length,0);
  q.sync('first', [{ id: 3, text: '+4', effect: 'draw4' }, { id: 4, text: '+10', effect: 'draw10' }]);
  assert.equal(q.next().id, 4);assert.equal(q.pending.length,0);q.complete();assert.equal(q.next(),null);
  q.sync('other', [{ id: 99, text: 'old winner', effect: 'win' }]); assert.equal(q.next(), null);
});

test('a completed round preserves the strongest chain, actual draws, knockouts and the last public play', () => {
  const r = fresh();
  r.players[0].hand = [card('two', 'red', 'draw2'), ...Array.from({ length: 18 }, (_, i) => card('a' + i, 'blue'))];
  r.players[1].hand = [card('four', 'red', 'draw4'), card('b-hidden', 'yellow')];
  r.players[2].hand = [card('ten', 'wild', 'draw10')];
  applyAction(r, 'A', { type: 'play', card: 'two' }); applyAction(r, 'B', { type: 'play', card: 'four' });
  applyAction(r, 'C', { type: 'play', card: 'ten', color: 'blue' });
  const cue = r.logs.find(e => e.effect === 'draw10').cue;
  assert.deepEqual([cue.from, cue.to, cue.amount, cue.total], ['C', 'A', 10, 16]);
  assert.equal(publicView(r, 'B', {}, 5).game.recap, null, 'history is not sent on every live update');
  applyAction(r, 'A', { type: 'draw' }); drain(r);
  assert.equal(r.status, 'finished');
  const recap = publicView(r, 'B', {}, 6).game.recap;
  assert.equal(recap.maxPenalty.total, 16); assert.equal(recap.maxPenalty.drawn, 7);
  assert.equal(recap.maxPenalty.knockedOut, true);
  assert.deepEqual(recap.maxPenalty.chain.map(s => s.value), [2, 4, 10]);
  assert.equal(recap.lastPlay.card.kind, 'draw10'); assert.equal(recap.lastPlay.actor, 'C');
  assert.equal(recap.events.find(e => e.kind === 'knockout').counts.find(p => p.id === 'A').count, 25);
  const replay = keyReplayFrames(recap.events); assert.ok(replay.some(e => e.kind === 'penalty')); assert.equal(replay.at(-1).kind, 'finish');
  const serialized = JSON.stringify(recap);
  for (const secret of ['tokenHash', 'secret-', 'b-hidden', 'a-hidden', 'deck', 'retired']) assert.equal(serialized.includes(secret), false);
  assert.equal('id' in recap.lastPlay.card, false, 'public plays have no hidden card identifiers');
});

test('whole-hand exchanges retain before/after counts and a complete animation interval', () => {
  const r = fresh(); r.players[0].hand = [card('seven', 'red', 'number', 7), card('kept', 'red')];
  r.players[1].hand = Array.from({ length: 12 }, (_, i) => card('other-' + i, 'green'));
  applyAction(r, 'A', { type: 'play', card: 'seven' }); applyAction(r, 'A', { type: 'target', target: 'B' });
  const g = r.game, event = g.history.keyExchange.event;
  assert.deepEqual([event.amount, event.drawn, g.history.keyExchange.swing], [1, 12, 11]);
  assert.equal(event.before.find(p => p.id === 'A').count, 1); assert.equal(event.counts.find(p => p.id === 'A').count, 12);
  assert.equal(g.transfer.duration, TRANSFER_TIMING.swap.duration);
  assert.ok(TRANSFER_TIMING.swap.reveal >= TRANSFER_TIMING.swap.second + TRANSFER_TIMING.swap.flight);
  assert.ok(g.transfer.duration - TRANSFER_TIMING.swap.reveal >= 650, 'the incoming hand has time to spread');
});

test('draw delivery broadcasts card backs and public progress without exposing the received card', () => {
  const r = fresh(); r.players[0].hand = [card('two', 'red', 'draw2'), card('kept', 'blue')];
  applyAction(r, 'A', { type: 'play', card: 'two' }); applyAction(r, 'B', { type: 'draw' });
  const nextCard = r.game.deck.at(-1).id; advanceRoom(r, Math.max(Date.now() + 1000, r.presentationUntil || 0));
  const v = publicView(r, 'C', {}, 8), delivery = v.game.delivery;
  assert.deepEqual([delivery.player, delivery.ordinal, delivery.total, delivery.mode], ['B', 1, 2, 'penalty']);
  assert.equal('card' in delivery, false); assert.equal(JSON.stringify(delivery).includes(nextCard), false);
  const first = delivery.id; advanceRoom(r, Date.now() + 2000);
  assert.notEqual(r.game.delivery.id, first); assert.equal(r.game.delivery.ordinal, 2);
});

test('long rounds bound replay storage while retaining highlights, and the next round starts fresh', () => {
  const r = fresh(), g = r.game;
  for (let i = 0; i < REPLAY_LIMIT + 10; i++) {
    const p = r.players.find(p => p.id === g.turn), c = card('visible-' + i, g.color);
    p.hand = [c, card('kept-' + i, 'blue')]; applyAction(r, p.id, { type: 'play', card: c.id });
  }
  assert.equal(g.history.events.length, REPLAY_LIMIT); assert.ok(g.history.trimmed > 0);
  assert.equal(g.history.plays, REPLAY_LIMIT + 10);
  const p = r.players.find(p => p.id === g.turn); p.hand = [card('last', g.color)]; applyAction(r, p.id, { type: 'play', card: 'last' }); drain(r);
  const next = r.players.find(p => p.id === g.turn); next.hand = [card('next-last', g.color)]; applyAction(r, next.id, {type:'play',card:'next-last'}); drain(r);
  assert.ok(publicView(r, 'A', {}, 20).game.recap.endedAt);
  applyAction(r, 'A', { type: 'reset' }); r.players.forEach(p => p.ready = true); applyAction(r, 'A', { type: 'start' });
  assert.equal(r.game.history.plays, 0); assert.equal(r.game.history.partial, false); assert.equal(r.game.history.trimmed, 0);
});

test('a two-player reverse draw points the attack back at its sender', () => {
  const r = fresh(); r.players[2].out = true; r.players[2].hand = [];
  r.players[0].hand = [card('reverse', 'wild', 'reverse4'), card('kept', 'red')];
  applyAction(r, 'A', { type: 'play', card: 'reverse', color: 'yellow' });
  const cue = r.logs.findLast(e => e.cue).cue;
  assert.deepEqual([cue.from, cue.to, cue.amount, cue.total], ['A', 'A', 4, 4]);
  assert.equal(r.game.history.lastPlay.target, 'A');
});

test('rounds started before the update explicitly mark the recap as partial', () => {
  const r = fresh(); delete r.game.history;
  r.players[0].hand = [card('last', 'red')]; applyAction(r, 'A', { type: 'play', card: 'last' }); drain(r);
  r.players[1].hand = [card('second-last','red')]; applyAction(r,'B',{type:'play',card:'second-last'}); drain(r);
  const recap = publicView(r, 'B', {}, 2).game.recap;
  assert.equal(recap.partial, true); assert.equal(recap.plays, 2);
  assert.equal(recap.lastPlay.card.color, 'red');
});
