import test from 'node:test';
import assert from 'node:assert/strict';
import { postRoomAction } from '../lib/room-request.ts';
import { readApiResponse, requestErrorMessage } from '../lib/api-response.ts';
import { createRoom, applyAction, advanceRoom, DEFAULT_CONFIG } from '../lib/game.ts';

test('a response lost after a committed draw retries the same action id without drawing twice', async () => {
  const person = id => ({ id, tokenHash: id, name: id, hand: [], ready: true, out: false, uno: false });
  const room = createRoom('ABC234', person('A'), { ...DEFAULT_CONFIG, dealDelayMs: 0, firstSeat: 0 });
  room.players.push(person('B'), person('C')); applyAction(room, 'A', { type: 'start' }); advanceRoom(room, room.presentationUntil);
  const sent = [], signals = []; let retryNotices = 0, applied = 0;
  const request = async (_url, options) => {
    sent.push(options.body); signals.push(options.signal);
    const action = JSON.parse(options.body);
    if (!room.actions.includes(action.actionId)) {
      applyAction(room, 'A', action); room.actions.push(action.actionId); applied++;
    }
    if (sent.length === 1) throw new DOMException('signal timed out', 'TimeoutError');
    return Response.json({ version: 2, drawing: room.game.drawing });
  };
  const { data } = await postRoomAction({ type: 'draw', code: room.code, actionId: 'draw-once', version: 1 }, 'seat-token', () => retryNotices++, request);
  assert.equal(applied, 1); assert.equal(retryNotices, 1); assert.equal(sent.length, 2);
  assert.equal(sent[0], sent[1]); assert.notEqual(signals[0], signals[1]); assert.equal(data.drawing.drawn, 0);
});

test('timeouts retry only authenticated actions with an action id, never create or join', async () => {
  for (const [payload, token, expected] of [
    [{ type: 'create', actionId: 'x' }, 'old-seat-token', 1],
    [{ type: 'join', actionId: 'x' }, 'old-seat-token', 1],
    [{ type: 'tick', actionId: 'x' }, 'seat-token', 1],
    [{ type: 'draw', actionId: 'x' }, undefined, 1],
    [{ type: 'draw' }, 'seat-token', 1],
    [{ type: 'pick', actionId: 'x' }, 'seat-token', 2],
  ]) {
    let calls = 0;
    await assert.rejects(postRoomAction(payload, token, undefined, async () => { calls++; throw new DOMException('signal timed out', 'TimeoutError'); }), { name: 'TimeoutError' });
    assert.equal(calls, expected);
  }
});

test('a body download timeout preserves its type and can recover, while server rejections are not retried', async () => {
  const timedBody = () => ({ headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => { throw new DOMException('signal timed out', 'TimeoutError'); } });
  await assert.rejects(readApiResponse(timedBody()), { name: 'TimeoutError' });
  let calls = 0;
  const recovered = await postRoomAction({ type: 'play', actionId: 'same-card' }, 'token', undefined, async () => ++calls === 1 ? timedBody() : Response.json({ version: 2 }));
  assert.equal(calls, 2); assert.equal(recovered.data.version, 2);
  calls = 0;
  const rejected = await postRoomAction({ type: 'play', actionId: 'invalid-card' }, 'token', undefined, async () => { calls++; return Response.json({ error: '还没轮到你' }, { status: 400 }); });
  assert.equal(calls, 1); assert.equal(rejected.response.status, 400); assert.equal(rejected.data.error, '还没轮到你');
  assert.match(requestErrorMessage(new DOMException('signal timed out', 'TimeoutError')), /暂时未能确认操作结果/);
  assert.match(requestErrorMessage(new Error('signal timed out')), /暂时未能确认操作结果/);
  assert.equal(requestErrorMessage(new Error('还没轮到你')), '还没轮到你');
});
