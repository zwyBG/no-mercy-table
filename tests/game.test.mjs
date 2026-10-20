import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, applyAction as performRaw, advanceRoom, arrangeHand, drawValue, botAction, makeDeck, canPlay, publicView, COLORS, DEFAULT_CONFIG } from '../lib/game.ts';
function perform(r, id, action, context) {
  if (r.presentationUntil && ['play','draw','uno','catch','chooseSeven','skipSeven','target','pick','color','drawRoulette','reset','start'].includes(action.type)) advanceRoom(r, r.presentationUntil);
  return performRaw(r, id, action, context);
}
function drain(r) { let n = 0; while (n++ < 500 && advanceRoom(r, Date.now() + n * 5000)) {} if (n >= 500) throw new Error('progress did not settle'); }
function applyAction(r, id, action, context) { const result = perform(r, id, action, context); drain(r); return result; }
let serial = 500;
const card = (color = 'red', number = 3, kind = 'number') => ({ id: `test-${serial++}`, color, number, kind });
const person = id => ({ id, tokenHash: `secret-${id}`, name: id, ready: true, hand: [], out: false, uno: false });
function fresh(seven = 'trade') {
  const r = createRoom('ABC234', person('A'), { ...DEFAULT_CONFIG, dealDelayMs: 0, firstSeat: 0, seven }); r.players.push(person('B'), person('C')); applyAction(r, 'A', { type: 'start' }); return r;
}
function hands(r, a, b = [card('blue', 1), card('blue', 2)], c = [card('yellow', 1), card('yellow', 2)]) {
  [a, b, c].forEach((h, i) => { r.players[i].hand = h; }); r.game.discard = [card('red', 5)]; r.game.color = 'red'; return r;
}
test('deck has 168 unique cards and the intended action distribution', () => {
  const d = makeDeck(); assert.equal(d.length, 168); assert.equal(new Set(d.map(c => c.id)).size, 168);
  assert.equal(d.filter(c => c.kind === 'number').length, 80); assert.equal(d.filter(c => c.kind === 'draw10').length, 4); assert.equal(d.filter(c => c.kind === 'draw2').length, 12);
});
test('opening respects initial count, direction, first seat; initial 7/0 has no action', () => {
  const r = fresh(); assert.equal(r.game.turn, 'A'); assert.equal(r.players[0].hand.length, 7); assert.equal(r.game.pending, null); assert.equal(r.game.discard[0].kind, 'number');
});
test('lobby validates capacity and host permissions', () => {
  const r = createRoom('ABC234', person('A'), DEFAULT_CONFIG); assert.throws(() => applyAction(r, 'A', { type: 'start' }), /还需要/);
  r.players.push(person('B')); assert.throws(() => applyAction(r, 'B', { type: 'config', config: DEFAULT_CONFIG }), /房主/);
});
test('stack threshold compares last card rather than total, and matching colors can stack', () => {
  const r = fresh(); const a = card('red', 0, 'draw2'), b = card('red', 0, 'draw4'), c = card('wild', 0, 'draw6'); hands(r, [a, card()], [b, card()], [c, card()]);
  applyAction(r, 'A', { type: 'play', card: a.id }); applyAction(r, 'B', { type: 'play', card: b.id }); applyAction(r, 'C', { type: 'play', card: c.id, color: 'blue' });
  assert.equal(r.game.penalty, 12); assert.equal(r.game.lastDraw, 6); assert.equal(canPlay(r, card('wild', 0, 'draw6')), true); assert.equal(canPlay(r, card('red', 0, 'draw4')), false);
});
test('stack cannot be bypassed with skip/reverse', () => {
  const r = fresh(); r.game.penalty = 4; r.game.lastDraw = 4; assert.equal(canPlay(r, card('red', 0, 'skip')), false); assert.equal(canPlay(r, card('red', 0, 'reverse')), false);
});
test('taking stacked penalty skips turn and clears penalty', () => {
  const r = fresh(); r.game.penalty = 6; r.game.lastDraw = 4; applyAction(r, 'A', { type: 'draw' }); assert.equal(r.players[0].hand.length, 13); assert.equal(r.game.turn, 'B'); assert.equal(r.game.penalty, 0);
});
test('custom seven is two privately selected draws, including drawing the same card back', () => {
  const r = fresh(), seven = card('red', 7), a = card('yellow', 4), b = card('green', 6); hands(r, [seven, a], [b, card('blue', 6)]);
  applyAction(r, 'A', { type: 'play', card: seven.id }); applyAction(r, 'A', { type: 'target', target: 'B' });
  assert.throws(() => applyAction(r, 'C', { type: 'pick', index: 0 }), /等待/);
  applyAction(r, 'A', { type: 'pick', index: 0 }); assert.equal(r.players[0].hand.at(-1).id, b.id); assert.equal(r.game.pending.kind, 'return');
  applyAction(r, 'B', { type: 'pick', index: 1 }); assert.deepEqual(r.players[0].hand.map(c => c.id), [a.id]); assert.equal(r.players[1].hand.at(-1).id, b.id); assert.equal(r.game.turn, 'B'); assert.equal(r.game.pending, null);
});
test('classic seven swaps complete hands', () => {
  const r = fresh('swap'), seven = card('red', 7), a = card(), b = [card(), card(), card()]; hands(r, [seven, a], b);
  applyAction(r, 'A', { type: 'play', card: seven.id }); applyAction(r, 'A', { type: 'target', target: 'B' }); assert.equal(r.players[0].hand.length, 3); assert.equal(r.players[1].hand[0].id, a.id);
});
test('zero passes whole hands in chosen direction', () => {
  const r = fresh(), zero = card('red', 0), a = card(), b = card(), c = card(); hands(r, [zero, a], [b], [c]);
  applyAction(r, 'A', { type: 'play', card: zero.id }); assert.equal(r.players[1].hand[0].id, a.id); assert.equal(r.players[2].hand[0].id, b.id); assert.equal(r.players[0].hand[0].id, c.id);
});
test('discard-all does not trigger actions on buried cards', () => {
  const r = fresh(), discard = card('red', 0, 'discard'), kept = card('blue', 2); hands(r, [discard, card('red', 7), card('red', 0), kept]); applyAction(r, 'A', { type: 'play', card: discard.id }); assert.deepEqual(r.players[0].hand.map(c => c.id), [kept.id]); assert.equal(r.game.pending, null); assert.equal(r.game.turn, 'B'); assert.equal(r.game.discard.at(-1).id, discard.id);
});
test('25 cards eliminates immediately even if the drawn 25th card could be played', () => {
  const r = fresh(); hands(r, Array.from({ length: 24 }, () => card('blue', 2))); r.game.deck = [card('red', 9)]; applyAction(r, 'A', { type: 'draw' }); assert.equal(r.players[0].out, true); assert.equal(r.game.turn, 'B');
});
test('mercy also triggers during a custom seven before reciprocal pick', () => {
  const r = fresh(), seven = card('red', 7); hands(r, [seven, ...Array.from({ length: 24 }, () => card())]); applyAction(r, 'A', { type: 'play', card: seven.id }); applyAction(r, 'A', { type: 'target', target: 'B' }); applyAction(r, 'A', { type: 'pick', index: 0 }); assert.equal(r.players[0].out, true); assert.equal(r.game.pending, null);
});
test('two-player reverse repeats turn, wild reverse4 hits self and can be stacked', () => {
  for (const kind of ['reverse', 'reverse4']) {
    const r = fresh(), special = card(kind === 'reverse4' ? 'wild' : 'red', 0, kind); hands(r, [special, card('wild', 0, 'draw6'), card()]); r.players[2].out = true;
    applyAction(r, 'A', { type: 'play', card: special.id, color: 'red' }); assert.equal(r.game.turn, 'A');
    if (kind === 'reverse4') { assert.equal(r.game.penalty, 4); applyAction(r, 'A', { type: 'play', card: r.players[0].hand[0].id, color: 'green' }); assert.equal(r.game.turn, 'B'); assert.equal(r.game.penalty, 10); }
  }
});
test('roulette victim chooses color; wild cards do not stop the draw', () => {
  const r = fresh(), roulette = card('wild', 0, 'roulette'); hands(r, [roulette, card()]); r.game.deck = [card('blue', 5), card('wild', 0, 'draw6')];
  applyAction(r, 'A', { type: 'play', card: roulette.id }); assert.equal(r.game.pending.actor, 'B'); applyAction(r, 'B', { type: 'color', color: 'blue' }); assert.equal(r.players[1].hand.length, 2); applyAction(r, 'B', { type: 'drawRoulette' }); assert.equal(r.players[1].hand.length, 3); assert.equal(r.game.turn, 'B'); applyAction(r, 'B', { type: 'drawRoulette' }); assert.equal(r.players[1].hand.length, 4); assert.equal(r.game.turn, 'C'); assert.equal(r.game.color, 'blue');
});
test('until-playable mode allows voluntary draws, stops at the next playable card and keeps the turn', () => {
  const r = fresh(), matching = card('red', 2); hands(r, [matching]); const wild = card('wild', 0, 'draw6'); r.game.deck = [wild, card('green', 9)];
  applyAction(r, 'A', { type: 'draw' }); assert.equal(r.players[0].hand.length, 3); assert.equal(r.game.turn, 'A'); assert.equal(r.game.forced, null);
  assert.equal(canPlay(r, matching), true); applyAction(r, 'A', { type: 'play', card: matching.id }); assert.equal(r.game.turn, 'B');
});
test('single-draw mode takes exactly one card and passes immediately even when that card or an old card is playable', () => {
  const r = fresh(), matching = card('red', 2); hands(r, [matching, card()]); r.config.drawMode = 'single'; r.game.deck = [card('green', 9), card('red', 5)];
  applyAction(r, 'A', { type: 'draw' }); assert.equal(r.players[0].hand.length, 3); assert.equal(r.game.deck.length, 1); assert.equal(r.game.turn, 'B'); assert.throws(() => applyAction(r, 'A', { type: 'play', card: matching.id }), /没有轮到/);
});
test('UNO can be announced with play, caught before next turn, and sorting does not close catch window', () => {
  const r = fresh(), red = card('red', 2); hands(r, [red, card('green', 2)]); applyAction(r, 'A', { type: 'play', card: red.id }); assert.deepEqual(r.game.risk, ['A']); applyAction(r, 'B', { type: 'sort', order: r.players[1].hand.map(c => c.id).reverse() }); applyAction(r, 'C', { type: 'catch', target: 'A' }); assert.equal(r.players[0].hand.length, 3);
  const q = fresh(), c = card('red', 2); hands(q, [c, card()]); applyAction(q, 'A', { type: 'play', card: c.id, uno: true }); assert.equal(q.players[0].uno, true); assert.throws(() => applyAction(q, 'B', { type: 'catch', target: 'A' }), /没有可抓/);
});
test('manual sort survives views; other hands, tokens, and draw pile never leak', () => {
  const r = fresh(), ids = r.players[0].hand.map(c => c.id).reverse(); applyAction(r, 'A', { type: 'sort', order: ids }); const v = publicView(r, 'A', {}, 1); assert.deepEqual(v.hand.map(c => c.id), ids); const json = JSON.stringify(v); assert.equal(json.includes('secret-'), false); assert.equal(v.players[1].hand, undefined); assert.equal(v.game.deck, undefined);
});
test('last card, including seven, wins after the visible resolution pause', () => {
  const r = fresh(), seven = card('red', 7); hands(r, [seven]); applyAction(r, 'A', { type: 'play', card: seven.id }); assert.equal(r.status, 'finished'); assert.equal(r.game.winner, 'A'); assert.equal(r.game.pending, null);
});
test('multiple complete games conserve all 168 cards through action chains, knockouts, and reshuffles', () => {
  for (let trial = 0; trial < 12; trial++) {
    const r = fresh(trial % 2 ? 'trade' : 'swap'); let steps = 0;
    while (r.status === 'playing' && steps++ < 3000) {
      const g = r.game, pending = g.pending;
      if (pending?.kind === 'target') applyAction(r, pending.actor, { type: 'target', target: r.players.find(p => !p.out && p.id !== pending.actor).id });
      else if (pending?.kind === 'take' || pending?.kind === 'return') applyAction(r, pending.kind === 'take' ? pending.actor : pending.target, { type: 'pick', index: 0 });
      else if (pending?.kind === 'roulette') applyAction(r, pending.actor, pending.color ? { type: 'drawRoulette' } : { type: 'color', color: COLORS[steps % 4] });
      else { const p = r.players.find(p => p.id === g.turn), card = p.hand.find(c => canPlay(r, c)); applyAction(r, p.id, card ? { type: 'play', card: card.id, color: COLORS[steps % 4], uno: true } : { type: 'draw', uno: true }); }
      const all = [...g.deck, ...g.discard, ...g.retired, ...r.players.flatMap(p => p.hand)]; assert.equal(all.length, 168); assert.equal(new Set(all.map(c => c.id)).size, 168);
    } assert.equal(r.status, 'finished', 'game should reach a winner');
  }
});

test('missed UNO catch window stays closed after the next player acts', () => {
  const r = fresh(), a = card('red', 2), b = card('red', 3); hands(r, [a, card('green', 4)], [b, card('blue', 1)]);
  applyAction(r, 'A', { type: 'play', card: a.id }); applyAction(r, 'B', { type: 'play', card: b.id }); assert.equal(r.game.risk.includes('A'), false);
  assert.throws(() => applyAction(r, 'C', { type: 'catch', target: 'A' }), /没有可抓/);
});
test('bots fill seats, remain ready after settings, can be removed and cannot be added by guests', () => {
  const r = createRoom('ABC234', person('A'), { ...DEFAULT_CONFIG, dealDelayMs: 0, seats: 6 }); applyAction(r, 'A', { type: 'addBots', all: true }); assert.equal(r.players.length, 6); assert.ok(r.players.every(p => p.ready));
  applyAction(r, 'A', { type: 'config', config: { ...r.config, initialCards: 12, seats: 4 } }); assert.equal(r.players.length, 4); assert.ok(r.players.every(p => p.ready));
  applyAction(r, 'A', { type: 'removeBot', target: r.players[1].id }); assert.equal(r.players.length, 3); assert.throws(() => applyAction(r, 'A', { type: 'removeBot', target: 'A' }), /真人/);
  applyAction(r, 'A', { type: 'addBots' }); applyAction(r, 'A', { type: 'start' }); assert.equal(r.players[0].hand.length, 12); assert.throws(() => applyAction(r, 'A', { type: 'addBots' }), /开局前/);
});
test('bots complete all seven modes with optional or mandatory exchanges at every table size', () => {
  for (const seats of [3, 4, 5, 6]) for (const seven of ['trade', 'swap', 'choice']) for (const sevenMaySkip of [true, false]) {
    const r = createRoom('ABC234', person('A'), { ...DEFAULT_CONFIG, dealDelayMs: 0, seats, seven, sevenMaySkip }); applyAction(r, 'A', { type: 'addBots', all: true }); r.players[0].bot = true; applyAction(r, 'A', { type: 'start' }); let steps = 0;
    while (r.status === 'playing' && steps++ < 3000) { const move = botAction(r); assert.ok(move); applyAction(r, move.id, move.action); const all = [...r.game.deck, ...r.game.discard, ...r.game.retired, ...r.players.flatMap(p => p.hand)]; assert.equal(all.length, 168); assert.equal(new Set(all.map(c => c.id)).size, 168); }
    assert.equal(r.status, 'finished');
  }
});

test('+10 can only be answered by +10, while equal values remain stackable', () => {
  const r = fresh(); r.game.penalty = 10; r.game.lastDraw = 10;
  for (const kind of ['draw2', 'draw4', 'reverse4', 'draw6']) assert.equal(canPlay(r, card(kind === 'draw2' || kind === 'draw4' ? 'red' : 'wild', 0, kind)), false);
  assert.equal(canPlay(r, card('wild', 0, 'draw10')), true);
  const ten = card('wild', 0, 'draw10'); hands(r, [ten, card()]); applyAction(r, 'A', { type: 'play', card: ten.id, color: 'red' }); assert.equal(r.game.penalty, 20); assert.equal(r.game.lastDraw, 10);
});

test('equal-value penalties may cross colors; a higher value still needs the color or a wild', () => {
  const r = fresh(), blueTwo = card('blue', 0, 'draw2'); hands(r, [blueTwo, card()]); r.game.color = 'blue';
  applyAction(r, 'A', { type: 'play', card: blueTwo.id });
  assert.equal(canPlay(r, card('yellow', 0, 'draw4')), false); assert.equal(canPlay(r, card('yellow', 0, 'draw2')), true);
  assert.equal(canPlay(r, card('blue', 0, 'draw2')), true); assert.equal(canPlay(r, card('blue', 0, 'draw4')), true); assert.equal(canPlay(r, card('wild', 0, 'reverse4')), true);
  const blackFour = card('wild', 0, 'reverse4'); r.players[1].hand = [blackFour, card()]; applyAction(r, 'B', { type: 'play', card: blackFour.id, color: 'yellow' });
  assert.equal(r.game.color, 'yellow'); assert.equal(canPlay(r, card('yellow', 0, 'draw4')), false); assert.equal(canPlay(r, card('blue', 0, 'draw4')), false); assert.equal(canPlay(r, card('yellow', 0, 'draw2')), false);
});

test('all seven modes allow opting out before a partner is selected when enabled', () => {
  for (const mode of ['trade', 'swap', 'choice']) {
    const r = fresh(mode), seven = card('red', 7), kept = card('green', 2); hands(r, [seven, kept]); const other = r.players[1].hand.map(c => c.id);
    applyAction(r, 'A', { type: 'play', card: seven.id }); assert.throws(() => applyAction(r, 'B', { type: 'skipSeven' }), /等待/);
    applyAction(r, 'A', { type: 'skipSeven' }); assert.equal(r.game.pending, null); assert.equal(r.game.turn, 'B'); assert.deepEqual(r.players[0].hand.map(c => c.id), [kept.id]); assert.deepEqual(r.players[1].hand.map(c => c.id), other);
  }
});

test('seven choice belongs to the player who played it and selects either full swap or reciprocal draw for that seven', () => {
  for (const mode of ['trade', 'swap']) {
    const r=fresh('choice'),seven=card('red',7),kept=card('yellow',3),other=[card('blue',4),card('green',5)];hands(r,[seven,kept],other);
    applyAction(r,'A',{type:'play',card:seven.id});assert.equal(r.game.pending.sevenMode,undefined);
    assert.throws(()=>applyAction(r,'A',{type:'target',target:'B'}),/先选择/);
    assert.throws(()=>applyAction(r,'B',{type:'chooseSeven',mode}),/只有出 7/);
    assert.throws(()=>applyAction(r,'A',{type:'chooseSeven',mode:'invalid'}),/只有出 7/);
    applyAction(r,'A',{type:'chooseSeven',mode:mode==='swap'?'trade':'swap'});
    applyAction(r,'A',{type:'chooseSeven',mode});assert.equal(r.game.pending.sevenMode,mode);assert.equal(r.config.seven,'choice');
    applyAction(r,'A',{type:'target',target:'B'});
    if(mode==='swap'){assert.deepEqual(r.players[0].hand,other);assert.deepEqual(r.players[1].hand,[kept]);}
    else {assert.equal(r.game.pending.kind,'take');applyAction(r,'A',{type:'pick',index:0});applyAction(r,'B',{type:'pick',index:0});assert.equal(r.players[0].hand.length,1);assert.equal(r.players[1].hand.length,2);}
    const again=card('red',7);r.players[1].hand.push(again);r.game.turn='B';r.game.color='red';
    applyAction(r,'B',{type:'play',card:again.id});assert.equal(r.game.pending.kind,'target');assert.equal(r.game.pending.sevenMode,undefined);
  }
  const fixed=fresh('trade'),seven=card('red',7);hands(fixed,[seven,card()]);applyAction(fixed,'A',{type:'play',card:seven.id});assert.throws(()=>applyAction(fixed,'A',{type:'chooseSeven',mode:'swap'}),/只有出 7/);
});

test('host config controls opting out in every seven mode and old configurations keep the previous default', () => {
  const old={...DEFAULT_CONFIG};delete old.sevenMaySkip;assert.equal(createRoom('ABC234',person('A'),old).config.sevenMaySkip,true);
  assert.throws(()=>createRoom('ABC234',person('A'),{...DEFAULT_CONFIG,sevenMaySkip:'false'}),/是否允许不交换/);
  for(const mode of ['trade','swap','choice']){
    const r=fresh(mode),seven=card('red',7);r.config.sevenMaySkip=false;hands(r,[seven,card()]);applyAction(r,'A',{type:'play',card:seven.id});
    assert.throws(()=>applyAction(r,'A',{type:'skipSeven'}),/必须交换/);assert.equal(r.game.pending.kind,'target');
    if(mode==='choice'){applyAction(r,'A',{type:'chooseSeven',mode:'trade'});assert.throws(()=>applyAction(r,'A',{type:'skipSeven'}),/必须交换/);}
    applyAction(r,'A',{type:'target',target:'B'});if(mode!=='swap'){applyAction(r,'A',{type:'pick',index:0});applyAction(r,'B',{type:'pick',index:0});}assert.equal(r.game.pending,null);
  }
});


test('dealing is round-robin, server-revealed one card per due tick, with no future cards in any view', () => {
  const r = createRoom('ABC234', person('A'), { ...DEFAULT_CONFIG, dealDelayMs: 300, initialCards: 2, firstSeat: 0 }); r.players.push(person('B'), person('C')); perform(r, 'A', { type: 'start' });
  assert.equal(r.status, 'dealing'); assert.equal(publicView(r, 'A', {}, 1).hand.length, 0);
  let time = r.game.deal.nextAt;
  assert.equal(advanceRoom(r, time - 1), false);
  for (let i = 1; i <= 6; i++) { assert.equal(advanceRoom(r, time), true); assert.equal(r.players.reduce((n,p) => n + p.hand.length, 0), i); assert.equal(r.players[(i - 1) % 3].hand.length, Math.ceil(i / 3)); time += 300; }
  assert.equal(r.status, 'playing'); assert.ok(r.players.every(p => p.hand.length === 2));
});
test('a last attack card waits for response, cumulative draws, and a result pause before naming a winner', () => {
  const r = fresh(), four = card('red', 0, 'draw4'); hands(r, [four], [card('blue', 1), card('green', 3)]); perform(r, 'A', { type: 'play', card: four.id });
  assert.equal(r.status, 'playing'); assert.equal(r.game.penalty, 4); assert.equal(r.game.winner, null); assert.equal(r.game.turn, 'B'); assert.equal(publicView(r, 'B', {}, 1).game.playable.length, 0);
  perform(r, 'B', { type: 'draw' }); assert.equal(r.players[1].hand.length, 2); let time = Math.max(r.game.drawing.nextAt, r.presentationUntil || 0);
  for (let i=1;i<=4;i++) { advanceRoom(r, time); assert.equal(r.players[1].hand.length, 2+i); if(i<4) assert.equal(r.status, 'playing'); time += 220; }
  assert.equal(r.status, 'resolving'); assert.equal(r.game.winner, null); assert.equal(publicView(r, 'B', {}, 1).game.winner, null); advanceRoom(r, r.game.result.revealAt); assert.equal(r.status, 'finished'); assert.equal(r.game.winner, 'A');
});
test('25-card knockout stays visible before its hand is cleared and the last survivor is revealed', () => {
  const r = fresh(); hands(r, Array.from({length:24},()=>card('blue',2))); r.players[2].out = true; r.game.penalty=4; r.game.lastDraw=4;
  perform(r,'A',{type:'draw'}); advanceRoom(r,Math.max(r.game.drawing.nextAt,r.presentationUntil || 0)); assert.equal(r.players[0].out,true); assert.equal(r.players[0].hand.length,25); assert.equal(r.status,'playing'); assert.equal(r.game.winner,null); assert.equal(publicView(r,'A',{},1).game.knockout.count,25);
  advanceRoom(r,r.game.knockout.until); assert.equal(r.players[0].hand.length,0); assert.equal(r.status,'resolving'); advanceRoom(r,r.game.result.revealAt); assert.equal(r.game.winner,'B');
});
test('roulette requires the next player to choose, then exactly one deliberate draw per action', () => {
  const r=fresh(), roulette=card('wild',0,'roulette'); hands(r,[roulette,card()]); r.game.deck=[card('blue',5),card('yellow',3),card('wild',0,'draw10')];
  perform(r,'A',{type:'play',card:roulette.id}); assert.throws(()=>perform(r,'A',{type:'color',color:'blue'}),/下一位/); perform(r,'B',{type:'color',color:'blue'});
  assert.equal(r.players[1].hand.length,2); assert.equal(advanceRoom(r,Date.now()+10000),false);
  perform(r,'B',{type:'drawRoulette'}); assert.equal(r.players[1].hand.length,3); assert.equal(r.game.pending.drawn,1); advanceRoom(r,Date.now()+10000); assert.equal(r.players[1].hand.length,3);
  perform(r,'B',{type:'drawRoulette'}); assert.equal(r.players[1].hand.length,4); assert.equal(r.game.pending.actor,'B');
  perform(r,'B',{type:'drawRoulette'}); assert.equal(r.players[1].hand.length,5); assert.equal(r.game.pending,null); assert.equal(r.game.turn,'C');
});
test('same-value cross-color stacking updates active color while smaller penalties remain invalid', () => {
  const r=fresh(), blue=card('blue',0,'draw2'),green=card('green',0,'draw2'); hands(r,[blue,card()],[green,card()]); r.game.color='blue'; perform(r,'A',{type:'play',card:blue.id}); perform(r,'B',{type:'play',card:green.id}); assert.equal(r.game.penalty,4); assert.equal(r.game.color,'green'); assert.equal(canPlay(r,card('yellow',0,'draw4')),false); assert.equal(canPlay(r,card('green',0,'draw4')),true);
});

test('a black wild draw can only be followed by an equal-or-higher black wild draw', () => {
 const r=fresh(),four=card('wild',0,'reverse4');hands(r,[four,card()]); perform(r,'A',{type:'play',card:four.id,color:'red'});
 for(const color of COLORS)for(const kind of ['draw2','draw4'])assert.equal(canPlay(r,card(color,0,kind)),false);
 for(const kind of ['reverse4','draw6','draw10'])assert.equal(canPlay(r,card('wild',0,kind)),true);
 const v=publicView(r,r.game.turn,{},1);assert.ok(v.game.playable.every(id=>r.players.find(p=>p.id===r.game.turn).hand.find(c=>c.id===id).color==='wild'));
});
test('leaving during progressive drawing cancels that sequence without drawing forever for an absent player', () => {
 const r=fresh();r.game.penalty=6;r.game.lastDraw=6;perform(r,'A',{type:'draw'});perform(r,'A',{type:'leave'});assert.equal(r.game.drawing,null);assert.equal(r.game.penalty,0);assert.equal(r.game.turn,'B');advanceRoom(r,Date.now()+10000);assert.equal(r.game.drawing,null);
});


test('any seated player can finish the remaining deal atomically without changing order, first turn or future delay', () => {
 for (const seats of [3,4,5,6]) {
  const r=createRoom('ABC234',person('A'),{...DEFAULT_CONFIG,seats,initialCards:24,dealDelayMs:1500,firstSeat:seats-1,direction:-1});
  assert.throws(()=>perform(r,'A',{type:'finishDeal'}),/没有正在/);
  for(let i=1;i<seats;i++)r.players.push(person(String.fromCharCode(65+i)));
  perform(r,'A',{type:'start'});
  for(let i=0;i<seats*2+1;i++)advanceRoom(r,r.game.deal.nextAt);
  perform(r,'A',{type:'sort',order:r.players[0].hand.map(c=>c.id).reverse()});
  const expected=structuredClone(r);while(expected.status==='dealing')advanceRoom(expected,expected.game.deal.nextAt);perform(r,'B',{type:'finishDeal'});
  assert.equal(r.status,'playing');assert.equal(r.game.deal,null);assert.equal(r.game.turn,r.players[seats-1].id);assert.equal(r.game.direction,-1);assert.equal(r.config.dealDelayMs,1500);
  assert.deepEqual(r.players.map(p=>p.hand),expected.players.map(p=>p.hand));assert.deepEqual(r.game.deck,expected.game.deck);assert.ok(r.players.every(p=>p.hand.length===24));
  const before=r.players.map(p=>p.hand.map(c=>c.id));perform(r,'C',{type:'finishDeal'});assert.deepEqual(r.players.map(p=>p.hand.map(c=>c.id)),before);
  const all=[...r.game.deck,...r.game.discard,...r.players.flatMap(p=>p.hand)];assert.equal(all.length,168);assert.equal(new Set(all.map(c=>c.id)).size,168);
 }
});


test('explicit auto-arrange groups colors, sorts numbers, randomly places draw cards and never drops or mutates cards', () => {
 const input=COLORS.flatMap(color=>[card(color,9),card(color,1),card(color,7),card(color,0,'draw2'),card(color,0,'skip')]);input.push(card('wild',0,'draw6'),card('wild',0,'draw10'),card('wild',0,'reverse4'),card('wild',0,'roulette'));
 const original=input.map(c=>c.id), positions=new Set();
 for(let trial=0;trial<40;trial++){
  const sorted=arrangeHand(input),colors=[...COLORS,'wild'];assert.deepEqual(new Set(sorted.map(c=>c.id)),new Set(original));assert.deepEqual(input.map(c=>c.id),original);
  assert.ok(sorted.every((c,i)=>i===0||colors.indexOf(c.color)>=colors.indexOf(sorted[i-1].color)));
  for(const color of COLORS)assert.deepEqual(sorted.filter(c=>c.color===color&&c.kind==='number').map(c=>c.number),[1,7,9]);
  positions.add(sorted.map(c=>drawValue(c)?c.id:'_').join(','));
 }assert.ok(positions.size>1);
});
test('whole-hand exchanges reserve an animation interval and expose only public transfer metadata', () => {
 const r=fresh('swap'),seven=card('red',7);hands(r,[seven,card('red',6),card('blue',2)],[card('green',1),card('blue',4),card('yellow',9)]);perform(r,'A',{type:'play',card:seven.id});perform(r,'A',{type:'target',target:'B'});
 const t=r.game.transfer;assert.equal(t.kind,'swap');assert.equal(t.from,'A');assert.equal(t.to,'B');assert.equal(t.fromCount,2);assert.equal(t.toCount,3);assert.equal(r.players[0].hand.length,3);assert.equal(r.players[1].hand.length,2);
 assert.throws(()=>perform(r,'B',{type:'play',card:r.players[1].hand[0].id}),/换牌动画/);assert.equal(publicView(r,'B',{},1).game.playable.length,0);r.players[1].bot=true;assert.equal(botAction(r),null);
 const visible=publicView(r,'C',{},1).game.transfer;assert.deepEqual(Object.keys(visible).sort(),['duration','from','fromCount','id','kind','remainingMs','to','toCount'].sort());
 assert.equal(advanceRoom(r,t.startedAt+t.duration-1),false);assert.equal(advanceRoom(r,t.startedAt+t.duration),true);assert.equal(r.game.transfer,null);assert.ok(botAction(r));
});
test('each reciprocal seven pick has a directed flight and waits before the other player can pick', () => {
 const r=fresh('trade'),seven=card('red',7);hands(r,[seven,card('yellow',1)]);perform(r,'A',{type:'play',card:seven.id});perform(r,'A',{type:'target',target:'B'});perform(r,'A',{type:'pick',index:0});
 let t=r.game.transfer;assert.equal(t.kind,'take');assert.equal(t.from,'B');assert.equal(t.to,'A');assert.equal(r.game.pending.kind,'return');assert.throws(()=>perform(r,'B',{type:'pick',index:0}),/换牌动画/);
 advanceRoom(r,t.startedAt+t.duration);perform(r,'B',{type:'pick',index:0});t=r.game.transfer;assert.equal(t.kind,'return');assert.equal(t.from,'A');assert.equal(t.to,'B');assert.equal(r.game.pending,null);assert.equal(r.game.turn,'B');advanceRoom(r,t.startedAt+t.duration);assert.equal(r.game.transfer,null);
});
