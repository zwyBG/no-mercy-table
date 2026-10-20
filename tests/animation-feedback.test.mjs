import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createRoom, applyAction, advanceRoom, botAction, publicView, presentationRemaining, DEFAULT_CONFIG } from '../lib/game.ts';
import { effectDuration, DRAW_DELIVERY_DURATION } from '../lib/presentation.ts';
import { nextRoomWake } from '../lib/room-timing.ts';
import { validateFeedback, INSERT_FEEDBACK } from '../lib/feedback.ts';

const person = id => ({ id, name: id, tokenHash: `secret-${id}`, hand: [], ready: true, out: false, uno: false });
const card = (id, color = 'red', kind = 'number', number = 3) => ({ id, color, kind, number });
function table() {
  const r = createRoom('ABC234', person('A'), { ...DEFAULT_CONFIG, dealDelayMs: 0, firstSeat: 0 });
  r.players.push(person('B'), person('C')); applyAction(r, 'A', { type: 'start' });
  advanceRoom(r, r.presentationUntil); r.game.discard = [card('top')]; r.game.color = 'red'; return r;
}

test('legal moves interrupt announcements immediately and bots keep their normal thinking cadence', t => {
  let clock = 100000; t.mock.method(Date, 'now', () => clock);
  const r = table(); r.players[0].hand = [card('ten', 'wild', 'draw10'), card('kept')];
  r.players[1].hand = [card('reply', 'wild', 'draw10'), card('other')]; r.players[1].bot = true;
  applyAction(r, 'A', { type: 'play', card: 'ten', color: 'red', uno: true }); const until = r.presentationUntil;
  assert.ok(presentationRemaining(r) >= effectDuration('draw10'));
  assert.equal(nextRoomWake(r), clock+1100); assert.ok(botAction(r));
  assert.ok(publicView(r, 'B', {}, 1).animation.remainingMs > 0);
  applyAction(r, 'B', { type: 'sort', order: ['other', 'reply'] });
  const next = botAction(r); assert.ok(next); applyAction(r, next.id, next.action, { hostOffline: false, automated: true });
  assert.equal(r.game.penalty, 20);
  assert.equal(r.presentationUntil,until,'new announcements replace rather than add their durations');
  applyAction(r,'C',{type:'draw'});assert.equal(r.game.drawing.player,'C');
  clock=r.game.drawing.nextAt;assert.equal(advanceRoom(r,clock),true);assert.equal(r.game.drawing.drawn,1);
});

test('pause freezes timing while deliberate roulette draws may replace a still-flying card', t => {
  let clock = 200000; t.mock.method(Date, 'now', () => clock);
  const r = table(); r.players[0].hand = [card('wheel', 'wild', 'roulette'), card('kept')];
  applyAction(r, 'A', { type: 'play', card: 'wheel' }); const until = r.presentationUntil;
  applyAction(r, 'A', { type: 'pause', paused: true }); const remaining = presentationRemaining(r);
  clock += 5000; assert.equal(presentationRemaining(r), remaining); assert.equal(nextRoomWake(r), null);
  applyAction(r, 'A', { type: 'pause', paused: false }); assert.equal(r.presentationUntil, until + 5000);
  clock = r.presentationUntil; advanceRoom(r, clock);
  applyAction(r, 'B', { type: 'color', color: 'blue' }); r.game.deck = [card('stop', 'blue'), card('not-yet', 'yellow')];
  applyAction(r, 'B', { type: 'drawRoulette' }); assert.ok(presentationRemaining(r) >= DRAW_DELIVERY_DURATION);
  assert.equal(r.game.pending.drawn, 1);const first=r.game.delivery.id;
  applyAction(r, 'B', { type: 'drawRoulette' }); assert.equal(r.game.pending, null); assert.equal(r.game.turn, 'C');
  assert.notEqual(r.game.delivery.id,first);
});

test('server presentation durations cover every voice asset, including the complete reverse +4', () => {
  const voices = { draw2:'add-two', draw4:'add-four', draw6:'add-six', draw10:'add-ten', reverse4:'reverse-four', begin:'begin', skip:'skip', skipall:'skip-all', reverse:'reverse', discard:'discard', roulette:'roulette', seven:'seven', zero:'zero', uno:'uno', win:'win', out:'out', penalty:'penalty' };
  for (const [kind, voice] of Object.entries(voices)) {
    const bytes = readFileSync(new URL(`../public/audio/announcer-${voice}.wav`, import.meta.url)); let rate = 0, size = 0;
    for (let i = 12; i + 8 < bytes.length;) { const chunk = bytes.toString('ascii', i, i + 4), n = bytes.readUInt32LE(i + 4); if (chunk === 'fmt ') rate = bytes.readUInt32LE(i + 16); if (chunk === 'data') size += n; i += 8 + n + n % 2; }
    assert.ok(effectDuration(kind) >= size / rate / .92 * 1000 + 150, `${kind} should finish speaking before the next action`);
  }
});

test('feedback validation bounds fields and prepared storage deduplicates submissions and caps bursts', () => {
  const db = new DatabaseSync(':memory:'); db.exec(readFileSync(new URL('../drizzle/0001_player_feedback.sql', import.meta.url), 'utf8'));
  const input = { id: crypto.randomUUID(), nickname: ' Test ', message: ' It\'s helpful <script>text only</script> ', release: '2026.10.20.7-preview' };
  const value = validateFeedback(input), save = db.prepare(INSERT_FEEDBACK);
  save.run(value.id, value.nickname, value.message, value.release); save.run(value.id, value.nickname, value.message, value.release);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM player_feedback').get().n, 1);
  const stored = db.prepare('SELECT * FROM player_feedback').get(); assert.equal(stored.nickname, 'Test'); assert.equal(stored.message, input.message.trim()); assert.match(stored.created_at, /Z$/);
  for (let i = 0; i < 35; i++) save.run(crypto.randomUUID(), 'Player', 'Feedback', 'test');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM player_feedback').get().n, 30);
  for (const patch of [{ nickname: ' ' }, { message: ' ' }, { nickname: 'x'.repeat(19) }, { message: 'x'.repeat(2001) }, { id: 'not-a-uuid' }]) assert.throws(() => validateFeedback({ ...input, ...patch }));
  db.close();
});
