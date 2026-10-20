import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, applyAction, advanceRoom, publicView, DEFAULT_CONFIG } from '../lib/game.ts';
import { SOCIAL_KINDS, SOCIAL_DURATION, SOCIAL_COOLDOWN, SOCIAL_ROOM_COOLDOWN } from '../lib/social.ts';
import { EffectQueue } from '../lib/presentation.ts';

const person = id => ({ id, name: id, tokenHash: `private-${id}`, hand: [], ready: true, out: false, uno: false });
function setup(t) {
  let now = 1000000; t.mock.method(Date, 'now', () => now);
  const room = createRoom('ABC234', person('A'), { ...DEFAULT_CONFIG, firstSeat: 0, dealDelayMs: 0 });
  room.players.push(person('B'), person('C')); applyAction(room, 'A', { type: 'start' });
  now = room.presentationUntil; advanceRoom(room);
  return { room, at(value) { now = value; advanceRoom(room); }, now: () => now };
}
const send = (r, actor = 'A', target = 'B', kind = 'tomato') => applyAction(r, actor, { type: 'social', target, kind });

test('all five props use the same public broadcast and animation gate', t => {
  const {room:r,at,now} = setup(t);
  for (const kind of SOCIAL_KINDS) {
    const before = structuredClone(r.game); send(r,'A','B',kind);
    assert.equal(publicView(r,'B',{},1).social.events.at(-1).kind,kind);
    assert.deepEqual(r.game,before);
    at(now()+SOCIAL_COOLDOWN+1);
  }
});

test('social props broadcast public attribution without changing hands, turns, rules or card history', t => {
  const { room: r } = setup(t), game = structuredClone(r.game), players = structuredClone(r.players), logs = structuredClone(r.logs);
  const q = new EffectQueue(); q.sync(r.code, r.logs);
  send(r);
  assert.deepEqual(r.game, game); assert.deepEqual(r.players, players); assert.deepEqual(r.logs, logs);
  q.sync(r.code, r.logs); assert.equal(q.pending.length, 0);
  const view = publicView(r, 'C', {}, 7), e = view.social.events[0];
  assert.deepEqual([e.from, e.to, e.kind, e.fromName, e.toName, e.ageMs], ['A', 'B', 'tomato', 'A', 'B', 0]);
  assert.equal(JSON.stringify(view).includes('private-'), false); assert.equal('sent' in view.social, false);
  assert.equal(view.social.cooldownMs, 0); assert.equal(view.social.roomCooldownMs, SOCIAL_ROOM_COOLDOWN);
  assert.equal(publicView(r, 'A', {}, 7).social.cooldownMs, SOCIAL_COOLDOWN);
  assert.throws(() => applyAction(r, 'A', { type: 'draw' }), /动画/);
});

test('props validate seated actors, targets and kinds; paused or unfinished card effects reject interaction', t => {
  const { room: r } = setup(t);
  for (const [target, kind] of [['A', 'tomato'], ['unknown', 'water'], ['B', 'unknown']]) assert.throws(() => send(r, 'A', target, kind));
  r.players[1].bot = true; assert.throws(() => send(r, 'B', 'C'), /坐上/);
  applyAction(r, 'A', { type: 'pause', paused: true }); assert.throws(() => send(r), /暂停/);
  applyAction(r, 'A', { type: 'pause', paused: false });
  r.game.pending = { kind: 'target', actor: 'A' }; assert.throws(() => send(r), /操作完成/); r.game.pending = null;
  send(r, 'A', 'B', 'water'); assert.equal(r.social.events[0].kind, 'water');
});

test('server cooldowns prevent animation backlogs and clear the shared turn gate at completion', t => {
  const { room: r, at, now } = setup(t), start = now(); send(r);
  at(start + SOCIAL_DURATION + 120); assert.equal(publicView(r, 'A', {}, 1).animation, null);
  assert.throws(() => send(r, 'C', 'B'), /收尾/);
  at(start + SOCIAL_ROOM_COOLDOWN); assert.throws(() => send(r), /冷却/);
  send(r, 'C', 'A', 'water');
  for (let i = 1; i < 20; i++) { at(start + SOCIAL_ROOM_COOLDOWN + i * 6000); send(r, i % 2 ? 'A' : 'C', 'B', i % 2 ? 'water' : 'tomato'); }
  assert.ok(r.social.events.length <= 8); assert.ok(Object.keys(r.social.sent).length <= r.players.length);
});

test('pause and resume preserve social playback and cooldown time, while older rooms need no migration', t => {
  const { room: r, at, now } = setup(t);
  assert.deepEqual(publicView(r, 'A', {}, 1).social, { events: [], cooldownMs: 0, roomCooldownMs: 0 });
  const start = now(); send(r); at(start + 800); applyAction(r, 'A', { type: 'pause', paused: true });
  const frozen = publicView(r, 'A', {}, 1); at(start + 10800);
  assert.deepEqual(publicView(r, 'A', {}, 1).social, frozen.social);
  applyAction(r, 'A', { type: 'pause', paused: false });
  assert.equal(publicView(r, 'A', {}, 1).social.events[0].ageMs, 800);
  assert.equal(publicView(r, 'A', {}, 1).social.cooldownMs, SOCIAL_COOLDOWN - 800);
  at(r.presentationUntil); assert.equal(publicView(r, 'A', {}, 1).animation, null);
});
