import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, applyAction, advanceRoom, botAction, publicView, canPlay, cardBlockReason, DEFAULT_CONFIG } from '../lib/game.ts';
import { nextRoomWake } from '../lib/room-timing.ts';
import { reconcileHandOrder } from '../lib/hand-order.ts';

const person = id => ({ id, tokenHash: `private-${id}`, name: id, hand: [], ready: true, out: false, uno: false });
const card = (id, color, kind, number) => ({ id, color, kind, number });
function room() {
  const r = createRoom('ABC234', person('A'), { ...DEFAULT_CONFIG, firstSeat: 0, dealDelayMs: 0 });
  r.players.push(person('B'), person('C')); applyAction(r, 'A', { type: 'start' });
  r.game.discard = [card('top', 'red', 'number', 5)]; r.game.color = 'red';
  return r;
}

test('pause freezes timed work, restricts play and resumes all deadlines without skipping cards', () => {
  const r = room(); applyAction(r, 'A', { type: 'draw' });
  const before = structuredClone(r.game.drawing), count = r.players[0].hand.length;
  assert.throws(() => applyAction(r, 'B', { type: 'pause', paused: true }), /房主/);
  applyAction(r, 'A', { type: 'pause', paused: true }); r.pause.at -= 5000;
  assert.equal(advanceRoom(r, Date.now() + 20000), false);
  assert.equal(r.players[0].hand.length, count);
  assert.equal(canPlay(r, card('play', 'red', 'number', 3)), false);
  applyAction(r, 'A', { type: 'pause', paused: false });
  assert.equal(r.pause, null);
  assert.ok(r.game.drawing.nextAt >= before.nextAt + 5000);
  assert.equal(advanceRoom(r, Date.now()), false);
});

test('temporary autoplay is opt-in, can be reclaimed, and cannot be enabled for an online opponent', () => {
  const r = room();
  assert.throws(() => applyAction(r, 'A', { type: 'autoplay', target: 'B', enabled: true }), /离线/);
  applyAction(r, 'A', { type: 'autoplay', enabled: true });
  assert.ok(botAction(r));
  assert.throws(() => applyAction(r, 'A', { type: 'draw' }), /托管/);
  const step = botAction(r); applyAction(r, step.id, step.action, { hostOffline: false, automated: true });
  applyAction(r, 'A', { type: 'autoplay', enabled: false });
  assert.equal(r.players[0].autoplay, false);
  applyAction(r, 'A', { type: 'autoplay', target: 'B', enabled: true }, { hostOffline: false, offlineIds: ['B'] });
  assert.equal(r.players[1].autoplay, true);
  assert.throws(() => applyAction(r, 'C', { type: 'autoplay', target: 'B', enabled: true }, { hostOffline: false, offlineIds: ['B'] }), /只能/);
});

test('penalty chains retain public attribution and clear only after the penalty resolves', () => {
  const r = room();
  r.players[0].hand = [card('a', 'red', 'draw2'), card('a2', 'blue', 'number', 1)];
  r.players[1].hand = [card('b', 'red', 'draw4'), card('b2', 'blue', 'number', 1)];
  r.players[2].hand = [card('c', 'wild', 'draw10'), card('c2', 'blue', 'number', 1)];
  applyAction(r, 'A', { type: 'play', card: 'a' }); applyAction(r, 'B', { type: 'play', card: 'b' }); applyAction(r, 'C', { type: 'play', card: 'c', color: 'blue' });
  assert.deepEqual(r.game.penaltyChain.map(s => s.value), [2, 4, 10]); assert.equal(r.game.penalty, 16);
  const v = publicView(r, 'B', {}, 1); assert.deepEqual(v.game.penaltyChain.map(s => s.player), ['A', 'B', 'C']);
  assert.deepEqual(Object.keys(v.blockedReasons), ['b2']); assert.equal(JSON.stringify(v).includes('private-'), false);
  assert.match(cardBlockReason(r, 'A', card('x', 'red', 'draw4')), /只能接黑色/);
  applyAction(r, 'A', { type: 'draw' }); assert.equal(r.game.penaltyChain.length, 3);
  for (let i = 0; i < 30; i++) advanceRoom(r, Date.now() + i * 5000);
  assert.equal(r.game.penalty, 0); assert.deepEqual(r.game.penaltyChain, []);
});

test('alarms are scheduled only for due game work; idle human turns and paused rooms sleep', () => {
  const r = room(); assert.equal(nextRoomWake(r), null);
  r.players[0].autoplay = true; assert.ok(nextRoomWake(r) > Date.now() - 1);
  r.pause = { by: 'A', at: Date.now() }; assert.equal(nextRoomWake(r), null);
  r.pause = null; r.game.drawing = { player: 'A', mode: 'penalty', drawn: 0, total: 4, nextAt: Date.now() + 1000 };
  assert.equal(nextRoomWake(r), r.game.drawing.nextAt);
});

test('live hand updates preserve local dragging order and append newly dealt cards exactly once', () => {
  assert.deepEqual(reconcileHandOrder(['b', 'a', 'gone'], ['a', 'b', 'new']), ['b', 'a', 'new']);
  assert.deepEqual(reconcileHandOrder(['old'], ['x', 'y']), ['x', 'y']);
  const r = room(); r.players[0].hand = [card('a', 'red', 'number', 2), card('b', 'blue', 'number', 3), card('new', 'green', 'number', 4)];
  applyAction(r, 'A', { type: 'sort', order: ['b', 'a'] });
  assert.deepEqual(r.players[0].hand.map(c => c.id), ['b', 'a', 'new']);
  assert.throws(() => applyAction(r, 'A', { type: 'sort', order: ['secret'] }), /手牌/);
});
