import { newMatchHistory, publicRecap, recordRoundChange, roundSnapshot, type MatchHistory } from "./match-history.ts";
import { TRANSFER_TIMING, ADVANCING_ACTIONS, DRAW_DELIVERY_DURATION, effectDuration, type EffectEvent } from "./presentation.ts";

import { sendSocial, publicSocial, type SocialState } from "./social.ts";
import { actionKey } from "./action-intent.ts";
import { settleRoundScores } from "./room-scores.ts";
import { jumpCards, jumpDirection, type JumpWindow } from "./jump-in.ts";

export type Color = "red" | "yellow" | "green" | "blue";
export const COLORS: Color[] = ["red", "yellow", "green", "blue"];
export type Card = { id: string; color: Color | "wild"; kind: string; number?: number };
export type Config = { seats: number; initialCards: number; seven: "swap" | "trade" | "choice"; sevenMaySkip: boolean; direction: 1 | -1; firstSeat: number; drawMode: "until" | "single"; dealDelayMs: number };
export const DEFAULT_CONFIG: Config = { seats: 3, initialCards: 7, seven: "trade", sevenMaySkip: true, direction: 1, firstSeat: -1, drawMode: "until", dealDelayMs: 300 };
export type Player = { id: string; tokenHash: string; name: string; hand: Card[]; ready: boolean; out: boolean; uno: boolean; bot?: boolean; autoplay?: boolean; finished?: boolean; withdrawn?: boolean; removed?: boolean };
export type Pending = { kind: "target" | "take" | "return" | "roulette" | "zero"; actor: string; target?: string; color?: Color; drawn?: number; sevenMode?: "swap" | "trade" };
export type Transfer = { id: string; kind: "swap" | "take" | "return"; from: string; to: string; fromCount: number; toCount: number; startedAt: number; duration: number };
export type Placement = { player: string; kind: "finished" | "knockout" | "last"; rank?: number; count: number; at: number; scoreDelta?: number; scoreTotal?: number };
export type Game = { deck: Card[]; discard: Card[]; retired: Card[]; color: Color; turn: string; direction: 1 | -1; penalty: number; lastDraw: number; pending: Pending | null; risk: string[]; winner: string | null; round: number; forced: string | null;
  deal?: { dealt: number; total: number; nextAt: number; lastPlayer: string | null } | null;
  drawing?: { player: string; mode: "penalty" | "until" | "single" | "catch"; total: number; drawn: number; nextAt: number } | null;
  knockout?: { player: string; count: number; until: number; from: string | null } | null;
  placements?: Placement[]; scored?: boolean; loser?: string | null; finishers?: string[]; result?: { candidate: string | null; revealAt: number; reason: string } | null; transfer?: Transfer | null;
  penaltyChain?: { player: string; value: number; color: Card["color"] }[];
  history?: MatchHistory;
  delivery?: { id: string; player: string; ordinal: number; total: number; mode: string };
  jump?: JumpWindow | null;
};
export type Room = { code: string; host: string; config: Config; players: Player[]; status: "lobby" | "dealing" | "playing" | "resolving" | "finished"; game: Game | null; logs: EffectEvent[]; serial: number; actions: string[]; rounds: number; scores?: Record<string,number>; lastScoredRound?: number; nextStarter?: string | null; botAt?: number; presentationUntil?: number; social?: SocialState; pause?: { by: string; at: number } | null };
export type Action = { type: string; [key: string]: unknown };
export const COLOR_NAMES: Record<string, string> = { red: "红", yellow: "黄", green: "绿", blue: "蓝", wild: "万能" };
export const LABELS: Record<string, string> = { skip: "跳过", reverse: "反转", draw2: "+2", draw4: "+4", discard: "同色全弃", skipall: "跳过所有人", reverse4: "反转 +4", draw6: "+6", draw10: "+10", roulette: "颜色轮盘" };
export function cardLabel(c: Card) { return `${COLOR_NAMES[c.color]}${c.kind === "number" ? c.number : LABELS[c.kind]}`; }
export function drawValue(c: Card) { return ({ draw2: 2, draw4: 4, reverse4: 4, draw6: 6, draw10: 10 } as Record<string, number>)[c.kind] || 0; }
export function arrangeHand(cards: Card[]): Card[] {
  return [...COLORS, "wild" as const].flatMap(color => {
    const group = cards.filter(c => c.color === color), regular = group.filter(c => !drawValue(c)).sort((a, b) => a.kind === "number" && b.kind === "number" ? a.number! - b.number! : a.kind === "number" ? -1 : b.kind === "number" ? 1 : a.kind.localeCompare(b.kind));
    const draws = shuffle(group.filter(c => drawValue(c))); let i = 0, j = 0;
    return shuffle([...regular.map(() => false), ...draws.map(() => true)]).map(isDraw => isDraw ? draws[j++] : regular[i++]);
  });
}
export function shuffle<T>(cards: T[]): T[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const bound = i + 1, limit = Math.floor(0x100000000 / bound) * bound;
    let value: number; do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
    const j = value % bound; [a[i], a[j]] = [a[j], a[i]];
  } return a;
}
export function makeDeck(): Card[] {
  const deck: Card[] = []; let n = 0;
  const add = (color: Card["color"], kind: string, count: number, number?: number) => { for (let i = 0; i < count; i++) deck.push({ id: `c${n++}`, color, kind, ...(number === undefined ? {} : { number }) }); };
  for (const color of COLORS) {
    for (let number = 0; number < 10; number++) add(color, "number", 2, number);
    for (const kind of ["skip", "reverse", "draw2", "discard"]) add(color, kind, 3);
    for (const kind of ["draw4", "skipall"]) add(color, kind, 2);
  }
  add("wild", "reverse4", 8); add("wild", "roulette", 8); add("wild", "draw6", 4); add("wild", "draw10", 4); return shuffle(deck);
}
export function log(r: Room, text: string, effect?: string) {
  const event: EffectEvent = { id: ++r.serial, text, ...(effect ? { effect } : {}) }; r.logs.push(event); r.logs = r.logs.slice(-40);
  if (effect && effectDuration(effect)) r.presentationUntil = Date.now() + effectDuration(effect) + 120;
  return event;
}
export function presentationRemaining(r: Room, now = Date.now()) { return Math.max(0, (r.presentationUntil || 0) - (r.pause?.at || now)); }
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
export function normalizeConfig(value: unknown): Config {
  const c = value as Config;
  assert(c && Number.isInteger(c.seats) && c.seats >= 3 && c.seats <= 6, "人数应为 3～6 人");
  assert(Number.isInteger(c.initialCards) && c.initialCards >= 1 && c.initialCards <= 24, "初始手牌应为 1～24 张");
  assert(c.seven === "swap" || c.seven === "trade" || c.seven === "choice", "请选择 7 的玩法");
  const sevenMaySkip = c.sevenMaySkip ?? true; assert(typeof sevenMaySkip === "boolean", "请选择出 7 是否允许不交换");
  assert(c.direction === 1 || c.direction === -1, "请选择出牌方向");
  assert(Number.isInteger(c.firstSeat) && c.firstSeat >= -1 && c.firstSeat < c.seats, "请选择有效的先手座位");
  const drawMode = c.drawMode || "until"; assert(drawMode === "until" || drawMode === "single", "请选择摸牌模式");
  const dealDelayMs = c.dealDelayMs ?? DEFAULT_CONFIG.dealDelayMs;
  assert(Number.isInteger(dealDelayMs) && dealDelayMs >= 0 && dealDelayMs <= 1500, "发牌间隔应为 0～1500 毫秒");
  return { drawMode, dealDelayMs, seats: c.seats, initialCards: c.initialCards, seven: c.seven, sevenMaySkip, direction: c.direction, firstSeat: c.firstSeat };
}
export function createRoom(code: string, p: Player, config: Config): Room {
  const r: Room = { code, host: p.id, config: normalizeConfig(config), players: [p], status: "lobby", game: null, logs: [], serial: 0, actions: [], rounds: 0 }; log(r, `${p.name} 创建了牌桌`); return r;
}
export const stillPlaying = (p: Player) => !p.out && !p.finished && !p.withdrawn && !p.removed;
export function nextPlayer(r: Room, from: string, steps = 1): string {
  let index = r.players.findIndex(p => p.id === from); assert(index >= 0, "玩家不存在");
  if (!r.players.some(stillPlaying)) return from;
  for (let i = 0; i < steps; i++) do { index = (index + r.game!.direction + r.players.length) % r.players.length; } while (!stillPlaying(r.players[index]));
  return r.players[index].id;
}
function player(r: Room, id: string) { const p = r.players.find(p => p.id === id); assert(p, "玩家不存在"); return p; }
function awardFinish(r: Room, id: string) {
  const g = r.game!, p = player(r, id); if (!stillPlaying(p) || p.hand.length) return;
  p.finished = true; p.uno = false; p.autoplay = false;
  g.placements ||= []; const rank = g.placements.filter(e => e.kind === "finished").length + 1;
  g.placements.push({player:id,kind:"finished",rank,count:0,at:Date.now()}); g.winner ||= id;
  g.finishers = g.finishers?.filter(other => other !== id); g.risk = g.risk.filter(other => other !== id);
  log(r, `${p.name} 已出完手牌，第 ${rank} 名！剩余玩家继续`, "finish");
}
function survivors(r: Room) {
  const g = r.game!; if (r.status !== "playing" || g.knockout || g.pending || g.drawing || g.penalty) return;
  const active = r.players.filter(stillPlaying); if (active.length > 1) return;
  const last = active[0]; g.placements ||= [];
  g.loser = last?.id || g.placements.findLast(e => e.kind === "knockout")?.player || null;
  if (last && !g.placements.some(e => e.player === last.id)) g.placements.push({player:last.id,kind:"last",rank:r.players.length,count:last.hand.length,at:Date.now()});
  const reason = last ? `${last.name} 还剩 ${last.hand.length} 张牌，是本局最后一名` : "所有玩家已结束本局";
  g.risk = []; g.result = {candidate:g.winner,revealAt:Date.now()+2200,reason}; r.status = "resolving";
  log(r, reason);
}
function settleFinishers(r: Room) {
  const g = r.game!; if (r.status !== "playing" || g.penalty || g.pending || g.drawing || g.knockout) return;
  const ordered = [...new Set([...(g.finishers || []), ...r.players.filter(p => stillPlaying(p) && !p.hand.length).map(p => p.id)])];
  for (const id of ordered) awardFinish(r,id);
  if (!stillPlaying(player(r,g.turn))) g.turn = nextPlayer(r,g.turn);
  survivors(r);
}
function eliminate(r: Room, p: Player) {
  const g = r.game!; p.out = true; p.uno = false; p.autoplay = false;
  (g.placements ||= []).push({player:p.id,kind:"knockout",count:p.hand.length,at:Date.now()});
  g.knockout = { player: p.id, count: p.hand.length, until: Date.now() + 1600, from: g.turn === p.id || g.pending?.actor === p.id || g.pending?.target === p.id ? g.pending?.actor || p.id : null };
  log(r, `${p.name} 达到 ${p.hand.length} 张手牌，被淘汰`, "out");
}
function drawOne(r: Room): Card {
  const g = r.game!;
  if (!g.deck.length) { const top = g.discard.pop()!; g.deck = shuffle([...g.discard, ...g.retired]); g.discard = [top]; g.retired = []; log(r, "牌堆已重新洗牌"); }
  const card = g.deck.pop(); assert(card, "牌堆暂时无法抽牌"); return card;
}
function receive(r: Room, p: Player, c: Card) {
  const g = r.game!; p.hand.push(c); p.uno = false; g.finishers = g.finishers?.filter(id => id !== p.id);
  if (g.drawing || g.pending?.kind === "roulette") g.delivery = { id: crypto.randomUUID(), player: p.id, ordinal: g.drawing ? g.drawing.drawn + 1 : (g.pending?.drawn || 0) + 1, total: g.drawing?.total || 0, mode: g.drawing?.mode || "roulette" };
  if (p.hand.length >= 25) eliminate(r, p);
}
function beginDraw(r: Room, p: Player, mode: "penalty" | "until" | "single" | "catch", total: number) { r.game!.jump = null; r.game!.drawing = { player: p.id, mode, total, drawn: 0, nextAt: Date.now() + 180 }; }
function beginTransfer(r: Room, kind: Transfer["kind"], from: string, to: string, fromCount: number, toCount: number) {
  r.game!.transfer = { id: crypto.randomUUID(), kind, from, to, fromCount, toCount, startedAt: Date.now(), duration: kind === "swap" ? TRANSFER_TIMING.swap.duration : TRANSFER_TIMING.single.duration };
}
function finishTurn(r: Room, from: string, steps = 1, affected = [from]) {
  if (r.status !== "playing" || r.game!.knockout) return;
  r.game!.pending = null; r.game!.forced = null; r.game!.turn = nextPlayer(r, from, steps);
  r.game!.risk = r.players.filter(p => affected.includes(p.id) && stillPlaying(p) && p.hand.length === 1 && !p.uno).map(p => p.id);
}
function withdrawSeat(r: Room, p: Player, kicked = false) {
  if (r.game) r.game.jump = null;
  if (r.status === "dealing") {
    r.status = "lobby"; r.game = null; r.pause = null; delete r.presentationUntil;
    r.players.forEach(q => { q.hand = []; q.ready = q.id === r.host || !!q.bot; });
    log(r, "有人离开发牌阶段，回到大厅重新准备");
  }
  if (r.status === "lobby") {
    r.players = r.players.filter(q => q.id !== p.id);
    if (r.nextStarter === p.id) r.nextStarter = null;
  } else {
    const g = r.game!;
    if (r.status === "playing" && stillPlaying(p)) {
      (g.placements ||= []).push({player:p.id,kind:"knockout",count:p.hand.length,at:Date.now()});
      p.out = true; p.withdrawn = true;
    }
    p.autoplay = false; p.uno = false;
    if (!p.finished) p.withdrawn = true;
    if (g.transfer && (g.transfer.from === p.id || g.transfer.to === p.id)) g.transfer = null;
    if (g.drawing?.player === p.id) {
      if (g.drawing.mode === "penalty") { g.penalty = 0; g.lastDraw = 0; g.penaltyChain = []; }
      g.drawing = null;
    }
    const knockoutFrom = g.knockout?.player === p.id ? g.knockout.from : null;
    if (g.knockout?.player === p.id) g.knockout = null;
    if (!p.finished) { g.retired.push(...p.hand); p.hand = []; }
    g.risk = g.risk.filter(q => q !== p.id);
    g.finishers = g.finishers?.filter(q => q !== p.id);
    if (r.status === "playing" && (g.turn === p.id || g.pending?.actor === p.id || g.pending?.target === p.id || knockoutFrom)) finishTurn(r, knockoutFrom || g.pending?.actor || p.id);
    if (!r.players.some(stillPlaying)) { g.penalty = 0; g.pending = null; g.drawing = null; }
    settleFinishers(r);
    if (kicked) p.removed = true;
  }
  log(r, kicked ? `房主将 ${p.name} 移出了牌桌` : `${p.name} 离开了本局，进入观战`);
  if (r.host === p.id) {
    const successor = r.players.find(q => q.id !== p.id && !q.bot && !q.removed && stillPlaying(q)) || r.players.find(q => q.id !== p.id && !q.bot && !q.removed);
    if (successor) { r.host = successor.id; successor.ready = true; }
  }
}
export function canPlay(r: Room, card: Card): boolean {
  const g = r.game; if (!g || r.pause || g.pending || g.drawing || g.knockout || r.status !== "playing") return false;
  const top = g.discard[g.discard.length - 1];
  if (g.penalty && top.color === "wild") return card.color === "wild" && drawValue(card) >= g.lastDraw;
  if (g.penalty) return drawValue(card) >= g.lastDraw && (card.color === "wild" || card.color === g.color || drawValue(card) === g.lastDraw);
  return card.color === "wild" || card.color === g.color || (card.kind === top.kind && (card.kind !== "number" || card.number === top.number));
}
export function cardBlockReason(r: Room, id: string, card: Card): string | null {
  const g = r.game;
  const participant = r.players.find(p => p.id === id);
  if (participant && !stillPlaying(participant)) return "你已进入观战，可以查看剩余玩家的手牌";
  if (r.players.find(p => p.id === id)?.autoplay) return "请先在右上角菜单接管手牌";
  if (r.pause) return "牌局已暂停，恢复后可以出牌";
  if (!g || r.status !== "playing") return r.status === "dealing" ? "正在发牌，可以先整理手牌" : "请等待下一局开始";
  if (g.knockout) return "正在结算淘汰，请稍候";
  if (g.drawing) return "请等待逐张摸牌完成";
  if (jumpCards(r, id).some(c => c.id === card.id)) return null;
  if (g.pending) return "先完成换牌或颜色轮盘";
  if (g.turn !== id) return "还没轮到你，可以先选牌、理牌";
  if (canPlay(r, card)) return null;
  if (g.penalty) {
    if (!drawValue(card)) return `累计罚抽 ${g.penalty} 张，只能接加牌`;
    if (g.discard.at(-1)?.color === "wild" && card.color !== "wild") return "万能加牌后只能接黑色万能加牌";
    if (drawValue(card) < g.lastDraw) return `加牌面值需 ≥ +${g.lastDraw}，不能用 +${drawValue(card)} 接`;
    return `更大的加牌须为${COLOR_NAMES[g.color]}色或黑色；同值 +${g.lastDraw} 可跨色`;
  }
  return `需要${COLOR_NAMES[g.color]}色、相同数字／符号，或黑色万能牌`;
}
function start(r: Room) {
  r.config = normalizeConfig(r.config);
  assert(r.players.length === r.config.seats, `还需要 ${r.config.seats - r.players.length} 位玩家加入`); assert(r.players.every(p => p.ready), "请等待所有玩家准备");
  for (const p of r.players) { p.hand = []; p.out = false; p.finished = false; p.withdrawn = false; p.uno = false; }
  const deck = makeDeck(), [top] = deck.splice(deck.findIndex(c => c.kind === "number"), 1);
  const first = (r.rounds > 0 && r.players.find(p => p.id === r.nextStarter && !p.removed)) || (r.config.firstSeat < 0 ? shuffle(r.players)[0] : r.players[r.config.firstSeat]);
  r.game = { deck, discard: [top], retired: [], color: top.color as Color, turn: first.id, direction: r.config.direction, penalty: 0, lastDraw: 0, pending: null, risk: [], winner: null, round: ++r.rounds, forced: null, placements: [], loser: null, finishers: [], deal: { dealt: 0, total: r.config.initialCards * r.players.length, nextAt: Date.now() + r.config.dealDelayMs, lastPlayer: null } };
  r.game.history = newMatchHistory();
  r.status = "dealing"; log(r, `第 ${r.rounds} 局开始，按座位依次发牌，每人 ${r.config.initialCards} 张`);
  if (r.config.dealDelayMs === 0) while (r.status === "dealing") advanceRoom(r, Date.now());
}

function dealNext(r: Room, now: number) {
  const g = r.game!, deal = g.deal!, p = r.players[deal.dealt % r.players.length];
  p.hand.push(g.deck.pop()!); deal.dealt++; deal.lastPlayer = p.id; deal.nextAt = now + r.config.dealDelayMs;
  if (deal.dealt === deal.total) { r.status = "playing"; g.deal = null; r.botAt = now; log(r, `发牌完成，${player(r, g.turn).name} 先出牌`, "begin"); }
}

// A single persisted tick reveals at most one card, even after a slow/offline client returns.
export function advanceRoom(r: Room, now = Date.now()): boolean {
  if (r.pause) return false;
  const before = roundSnapshot(r), released = !!r.presentationUntil && now >= r.presentationUntil;
  if (released) delete r.presentationUntil;
  const changed = advanceRoomInternal(r, now) || released;
  if (changed) recordRoundChange(r, before);
  return changed;
}
function advanceRoomInternal(r: Room, now: number): boolean {
  const g = r.game; if (!g || r.pause) return false;
  if (r.status === "dealing" && g.deal && now >= g.deal.nextAt) {
    dealNext(r, now); return true;
  }
  if (g.transfer && now >= g.transfer.startedAt + g.transfer.duration) { g.transfer = null; settleFinishers(r); return true; }
  if (g.knockout) {
    if (now < g.knockout.until) return false;
    const k = g.knockout, p = player(r, k.player); g.retired.push(...p.hand); p.hand = []; g.knockout = null;
    if (g.drawing?.player === p.id) { if (g.drawing.mode === "penalty") { g.penalty = 0; g.lastDraw = 0; g.penaltyChain = []; } g.drawing = null; }
    if (k.from) finishTurn(r, k.from); settleFinishers(r); return true;
  }
  if (r.status === "playing" && g.drawing && now >= g.drawing.nextAt) {
    const d = g.drawing, p = player(r, d.player), c = drawOne(r); receive(r, p, c); d.drawn++; d.nextAt = now + 220;
    if (p.out) return true;
    const complete = d.mode !== "until" ? d.drawn >= d.total : c.color === "wild" || c.color === g.color || (c.kind === g.discard.at(-1)!.kind && (c.kind !== "number" || c.number === g.discard.at(-1)!.number));
    if (complete) {
      r.presentationUntil = Math.max(r.presentationUntil || 0, Date.now() + DRAW_DELIVERY_DURATION);
      g.drawing = null;
      if (d.mode === "penalty") { g.penalty = 0; g.lastDraw = 0; g.penaltyChain = []; log(r, `${p.name} 抽完 ${d.drawn} 张罚牌，回合结束`); finishTurn(r, p.id); }
      else if (d.mode === "single") { log(r, `${p.name} 摸了 1 张，回合结束`); finishTurn(r, p.id); }
      else if (d.mode === "catch") log(r, `${p.name} 抽完漏喊 UNO 的 ${d.drawn} 张罚牌`);
      else log(r, `${p.name} 连续摸了 ${d.drawn} 张，已摸到可出的牌`);
      settleFinishers(r);
    } return true;
  }
  if (r.status === "resolving" && g.result && now >= g.result.revealAt) { g.winner = g.result.candidate; r.status = "finished"; settleRoundScores(r); log(r, g.loser ? `${player(r,g.loser).name} 成为本局最后一名，排位结束` : "本局排位结束", "end"); return true; }
  return false;
}
function resolvePlay(r: Room, p: Player, card: Card, color?: unknown, uno?: unknown, jumpedFrom?: string) {
  const g = r.game!;
  if (card.color === "wild" && card.kind !== "roulette") assert(COLORS.includes(color as Color), "请选择接下来的颜色");
  g.jump = { top: card.id, actor: p.id, direction: g.direction, color: g.color, blocked: [] };
  g.forced = null; p.hand.splice(p.hand.findIndex(c => c.id === card.id), 1);
  if (card.kind === "discard") { const extra = p.hand.filter(c => c.color === card.color); p.hand = p.hand.filter(c => c.color !== card.color); g.discard.push(...extra); }
  g.discard.push(card); if (card.color !== "wild") g.color = card.color; else if (card.kind !== "roulette") g.color = color as Color;
  p.uno = p.hand.length === 1 && uno === true; const playEvent = log(r, `${p.name} ${jumpedFrom ? "抢出了" : "出了"}${cardLabel(card)}${p.uno ? " · UNO！" : ""}`, card.kind === "number" ? card.number === 7 ? "seven" : card.number === 0 ? "zero" : jumpedFrom ? "jump" : "play" : card.kind);
  if (jumpedFrom) playEvent.jump = { from: jumpedFrom, to: p.id, fromName: player(r, jumpedFrom).name, toName: p.name };
  if (!p.hand.length) {
    if (drawValue(card) || card.kind === "roulette") { g.finishers = [...(g.finishers || []), p.id]; log(r, `${p.name} 已出完手牌，等待最后一张效果结算`); }
    else { awardFinish(r,p.id); finishTurn(r,p.id); survivors(r); return; }
  }
  if (card.kind === "number" && card.number === 7) { g.pending = { kind: "target", actor: p.id }; return; }
  if (card.kind === "number" && card.number === 0) { g.pending = { kind: "zero", actor: p.id }; return; }
  if (card.kind === "reverse" || card.kind === "reverse4") g.direction = g.direction === 1 ? -1 : 1;
  const active = r.players.filter(stillPlaying).length;
  if (card.kind === "skipall") g.jump.blocked = r.players.filter(q => stillPlaying(q) && q.id !== p.id).map(q => q.id);
  else if (card.kind === "skip" || card.kind === "reverse" && active === 2) g.jump.blocked = [nextPlayer(r, p.id)];
  if (drawValue(card)) { g.penaltyChain = [...(g.penaltyChain || []), { player: p.id, value: drawValue(card), color: card.color }]; g.penalty += drawValue(card); g.lastDraw = drawValue(card); finishTurn(r, p.id, card.kind === "reverse4" && active === 2 ? 2 : 1); playEvent.cue = { from: p.id, to: g.turn, fromName: p.name, toName: player(r, g.turn).name, amount: drawValue(card), total: g.penalty, chain: g.penaltyChain.map(s => s.value) }; return; }
  if (card.kind === "roulette") { const target = nextPlayer(r, p.id); g.turn = target; g.pending = { kind: "roulette", actor: target }; return; }
  finishTurn(r, p.id, card.kind === "skipall" ? active : card.kind === "skip" || (card.kind === "reverse" && active === 2) ? 2 : 1);
}
type ActionContext = { hostOffline: boolean; offlineIds?: string[]; automated?: boolean };
export function applyAction(r: Room, id: string, a: Action, context: ActionContext = { hostOffline: false }): Room {
  assert(r.players.some(p => p.id === id && !p.removed), "你已被移出牌桌");
  if (a.type === "social") {
    const result = sendSocial(r,id,a.target,a.kind);
    delete r.presentationUntil; if(r.game) {if(r.game.transfer)r.game.transfer=null;delete r.game.delivery;}
    return result;
  }
  if (ADVANCING_ACTIONS.has(a.type)) {
    delete r.presentationUntil;
    if(r.game) {if(r.game.transfer)r.game.transfer=null;delete r.game.delivery;}
    if(r.social) r.social.events=[];
  }
  const before = roundSnapshot(r, id, a), result = applyActionInternal(r, id, a, context);
  if(r.game) settleFinishers(r);
  recordRoundChange(r, before, id, a);
  return result;
}
function applyActionInternal(r: Room, id: string, a: Action, context: ActionContext): Room {
  const p = player(r, id), g = r.game;
  if (a.type === "pause") {
    assert(id === r.host && g && ["dealing", "playing", "resolving"].includes(r.status), "只有房主可以暂停进行中的牌局");
    if (a.paused === true && !r.pause) { r.pause = { by: id, at: Date.now() }; log(r, `${p.name} 暂停了牌局`); }
    else if (a.paused === false && r.pause) {
      const elapsed = Math.max(0, Date.now() - r.pause.at);
      if (g.deal) g.deal.nextAt += elapsed;
      if (g.drawing) g.drawing.nextAt += elapsed;
      if (g.knockout) g.knockout.until += elapsed;
      if (g.transfer) g.transfer.startedAt += elapsed;
      if (g.result) g.result.revealAt += elapsed;
      if (r.botAt) r.botAt += elapsed;
      if (r.presentationUntil) r.presentationUntil += elapsed;
      if (r.social) { r.social.events.forEach(e => { e.at += elapsed; }); for (const player of Object.keys(r.social.sent)) r.social.sent[player] += elapsed; r.social.lastAt += elapsed; }
      r.pause = null; log(r, `${p.name} 恢复了牌局`);
    } return r;
  }
  if (a.type === "autoplay") {
    const target = a.target ? player(r, String(a.target)) : p;
    assert(g && !target.bot && stillPlaying(target) && r.status !== "finished", "当前不能切换托管");
    assert(target.id === id || id === r.host && context.offlineIds?.includes(target.id) && a.enabled === true, "只能为自己，或离线超过 45 秒的玩家开启托管");
    target.autoplay = a.enabled === true; log(r, `${target.name}${target.autoplay ? " 开启了临时托管" : " 已接管自己的手牌"}`); return r;
  }
  if (a.type === "addBots") {
    assert(r.status === "lobby" && id === r.host, "只有房主可以在开局前添加人机");
    const count = a.all === true ? r.config.seats - r.players.length : 1;
    assert(count > 0 && count <= r.config.seats - r.players.length, "座位已经坐满了");
    const names = ["阿七", "蓝莓", "小绿", "小黄", "栗子", "泡泡"];
    for (let i = 0; i < count; i++) { const name = names.find(n => !r.players.some(q => q.name === `人机 · ${n}`)) || "小七";
      r.players.push({ id: crypto.randomUUID(), tokenHash: "bot-no-login", name: `人机 · ${name}`, bot: true, hand: [], ready: true, out: false, uno: false }); }
    log(r, `添加了 ${count} 位人机，已自动准备`); return r;
  }
  if (a.type === "removeBot") {
    assert(r.status === "lobby" && id === r.host, "只有房主可以在开局前移除人机"); const target = player(r, String(a.target)); assert(target.bot, "这位是真人玩家");
    r.players = r.players.filter(q => q.id !== target.id); log(r, `${target.name} 让出了座位`); return r;
  }
  if (a.type === "config") {
    assert(r.status === "lobby" && id === r.host, "只有房主可以在开局前修改设置"); const c = normalizeConfig(a.config); assert(c.seats >= r.players.filter(q => !q.bot).length, "座位数不能少于真人玩家数"); while (r.players.length > c.seats) { const bot = [...r.players].reverse().find(q => q.bot)!; r.players = r.players.filter(q => q.id !== bot.id); }
    r.config = c; r.players.forEach(x => x.ready = x.id === r.host || !!x.bot); log(r, "房主更新了开局设置，请重新准备"); return r;
  }
  if (a.type === "ready") { assert(r.status === "lobby", "对局已经开始"); p.ready = id === r.host || a.ready === true; return r; }
  if (a.type === "seats") {
    assert(r.status === "lobby" && id === r.host && Array.isArray(a.order), "只有房主可以调整座位"); const order = a.order as string[];
    assert(order.length === r.players.length && new Set(order).size === order.length && order.every(x => r.players.some(p => p.id === x)), "座位列表无效");
    r.players = order.map(x => player(r, x)); r.players.forEach(x => x.ready = x.id === r.host || !!x.bot); return r;
  }
  if (a.type === "claimHost") { assert(context.hostOffline, "房主仍在线，无需接管"); r.host = id; p.ready = true; log(r, `${p.name} 接管了房主`); return r; }
  if (a.type === "start") { assert(id === r.host && r.status === "lobby", "只有房主可以开始游戏"); r.pause = null; start(r); return r; }
  if (a.type === "finishDeal") {
    assert(!r.pause, "请先恢复牌局");
    assert(stillPlaying(p) && g && (r.status === "dealing" || r.status === "playing"), "现在没有正在进行的发牌");
    if (r.status === "dealing") {
      log(r, `${p.name} 选择立即发完剩余手牌`);
      while (g.deal) dealNext(r, Date.now());
    }
    return r;
  }
  if (a.type === "reset") { assert(id === r.host && r.status === "finished", "本局尚未结束"); settleRoundScores(r); r.players = r.players.filter(q => !q.removed); if (r.config.firstSeat >= r.players.length) r.config.firstSeat = -1; r.status = "lobby"; r.game = null; r.pause = null; delete r.presentationUntil; for (const q of r.players) { q.hand = []; q.out = false; q.finished = false; q.withdrawn = false; q.autoplay = false; q.ready = q.id === r.host || !!q.bot; } log(r, "回到大厅，累计分数保留，准备再来一局"); return r; }
  if (a.type === "kick") {
    assert(id === r.host, "只有房主可以踢人");
    const target = player(r, String(a.target));
    assert(target.id !== id && !target.removed, "请选择另一位仍在房间的玩家");
    withdrawSeat(r,target,true); return r;
  }
  if (a.type === "leave") {
    withdrawSeat(r,p); return r;
  }
  assert(g && (r.status === "playing" || r.status === "dealing") && stillPlaying(p), "当前不能进行这个操作");
  if (a.type === "sort") {
    assert(Array.isArray(a.order), "顺序无效"); const ids = a.order as string[];
    assert(ids.length <= p.hand.length && new Set(ids).size === ids.length && ids.every(x => p.hand.some(c => c.id === x)), "手牌已变化，请重新整理"); p.hand = [...ids.map(x => p.hand.find(c => c.id === x)!), ...p.hand.filter(c => !ids.includes(c.id))]; return r;
  }
  assert(!r.pause, "牌局已暂停，请先恢复");
  assert(!p.autoplay || context.automated || a.type === "uno", "请先在牌局管理中接管手牌再操作");
  assert(r.status === "playing" && !g.drawing && !g.knockout, "请等待发牌或逐张抽牌完成");
  if (a.type === "uno") { assert(p.hand.length === 1, "剩一张牌时可以喊 UNO"); p.uno = true; g.risk = g.risk.filter(x => x !== id); log(r, `${p.name} 喊了 UNO！`, "uno"); return r; }
  if (a.type === "catch") {
    const target = player(r, String(a.target)); assert(!g.pending && target.id !== id && g.risk.includes(target.id) && target.hand.length === 1 && !target.uno && stillPlaying(target), "现在没有可抓的漏喊");
    g.risk = g.risk.filter(x => x !== target.id); log(r, `${p.name} 抓到 ${target.name} 漏喊 UNO，罚抽 2 张`); beginDraw(r, target, "catch", 2); return r;
  }
  if (a.type === "jump") {
    const card = jumpCards(r, id).find(c => c.id === a.card);
    assert(card && a.top === g.jump?.top, "抢出机会已变化，请按当前牌面操作");
    if (card.color === "wild" && card.kind !== "roulette") assert(COLORS.includes(a.color as Color), "请选择接下来的颜色");
    const from = g.jump!.actor, direction = jumpDirection(r, id), previousColor = g.jump!.color;
    g.direction = direction; g.color = previousColor; g.turn = id; g.pending = null; g.penalty = 0; g.lastDraw = 0; g.penaltyChain = []; g.forced = null; g.risk = [];
    resolvePlay(r, p, card, a.color, a.uno, from); return r;
  }
  if (g.pending) {
    const pending = g.pending;
    if (pending.kind === "zero") {
      assert(pending.actor === id, "请等待出 0 的玩家选择");
      assert(a.type === "chooseZero" && typeof a.rotate === "boolean", "请选择按顺序传牌或不换牌");
      g.jump = null;
      const active = r.players.filter(stillPlaying);
      if (a.rotate) {
        const hands = new Map(active.map(q => [q.id, q.hand]));
        for (const [from, hand] of hands) { const target = player(r, nextPlayer(r, from)); target.hand = hand; target.uno = false; }
        log(r, `${p.name} 选择按${g.direction === 1 ? "顺时针" : "逆时针"}方向传牌，所有在局玩家把整手牌交给下一位`);
      } else log(r, `${p.name} 出 0 后选择不换牌`);
      finishTurn(r, id, 1, a.rotate ? active.map(q => q.id) : [id]); return r;
    }
    if (pending.kind === "roulette") {
      assert(pending.actor === id, "请等待下一位玩家操作颜色轮盘");
      if (a.type === "color") { assert(!pending.color && COLORS.includes(a.color as Color), "请选择轮盘颜色"); g.risk = []; pending.color = a.color as Color; pending.drawn = 0; g.color = pending.color; log(r, `${p.name} 选择${COLOR_NAMES[pending.color]}色，请逐张点击牌堆抽牌`); return r; }
      assert(a.type === "drawRoulette" && pending.color, "请先选择颜色，再逐张抽牌");
      g.jump = null;
      const c = drawOne(r); receive(r, p, c); pending.drawn = (pending.drawn || 0) + 1;
      log(r, `${p.name} 轮盘抽了第 ${pending.drawn} 张${c.color === pending.color ? "，抽中所选颜色" : "，继续抽牌"}`, "take");
      r.presentationUntil = Math.max(r.presentationUntil || 0, Date.now() + DRAW_DELIVERY_DURATION);
      if (!p.out && c.color === pending.color) { finishTurn(r, id); settleFinishers(r); } return r;
    }
    if (pending.kind === "target") {
      if (a.type === "skipSeven") { assert(pending.actor === id, "请等待出 7 的玩家选择"); assert(r.config.sevenMaySkip !== false, "本桌出 7 必须交换"); g.jump = null; log(r, `${p.name} 选择不交换手牌`); finishTurn(r, id); return r; }
      if (a.type === "chooseSeven") { assert(r.config.seven === "choice" && pending.actor === id && (a.mode === "swap" || a.mode === "trade"), "只有出 7 的玩家可以选择换牌方式"); pending.sevenMode = a.mode; return r; }
      const mode = pending.sevenMode || r.config.seven; assert(mode === "swap" || mode === "trade", "请先选择换一张或换整手");
      assert(a.type === "target" && pending.actor === id, "请等待出 7 的玩家选择对手"); const target = player(r, String(a.target)); assert(target.id !== id && stillPlaying(target), "请选择另一名在局玩家");
      if (mode === "swap") { g.jump = null; const fromCount = p.hand.length, toCount = target.hand.length; [p.hand, target.hand] = [target.hand, p.hand]; p.uno = false; target.uno = false; log(r, `${p.name} 与 ${target.name} 交换了全部手牌`, "swap"); finishTurn(r, id, 1, [id, target.id]); beginTransfer(r, "swap", id, target.id, fromCount, toCount); }
      else g.pending = { kind: "take", actor: id, target: target.id, sevenMode: "trade" }; return r;
    }
    assert(a.type === "pick", "请先完成互抽"); const chooser = pending.kind === "take" ? pending.actor : pending.target!, source = pending.kind === "take" ? pending.target! : pending.actor;
    assert(id === chooser, "请等待对方抽牌"); const other = player(r, source), index = a.index as number; assert(Number.isInteger(index) && index >= 0 && index < other.hand.length, "这张牌已经变化，请重选");
    g.jump = null;
    const fromCount = other.hand.length, toCount = p.hand.length;
    const [card] = other.hand.splice(index, 1); receive(r, p, card); beginTransfer(r, pending.kind, source, id, fromCount, toCount); log(r, `${p.name} 从 ${other.name} 的手牌抽走一张`, "take");
    if (r.status !== "playing") return r;
    if (p.out) { finishTurn(r, pending.actor); return r; }
    if (pending.kind === "take") g.pending = { ...pending, kind: "return" }; else finishTurn(r, pending.actor, 1, [pending.actor, pending.target!]); return r;
  }
  assert(g.turn === id, "还没有轮到你"); assert(a.type === "play" || a.type === "draw", "操作无效"); g.risk = [];
  if (a.type === "play") { const card = p.hand.find(c => c.id === a.card); assert(card && canPlay(r, card), "这张牌现在不能出"); resolvePlay(r, p, card, a.color, a.uno); return r; }
  if (g.penalty) { const n = g.penalty; log(r, `${p.name} 接受罚抽 ${n} 张，开始逐张抽牌`, "penalty"); beginDraw(r, p, "penalty", n); return r; }
  g.forced = null;
  if (r.config.drawMode === "single") {
    beginDraw(r, p, "single", 1); return r;
  }
  beginDraw(r, p, "until", 0); return r;
}
export function publicView(r: Room, id: string, seen: Record<string, number>, version: number) {
  const g = r.game, me = r.players.find(p => p.id === id && !p.removed);
  const now = r.pause?.at || Date.now();
  const spectating = !!me && !!g && (!!me.finished || me.out || me.withdrawn || r.status === "finished");
  return { actionKey: actionKey(r,id), spectating, spectatorHands: spectating ? r.players.filter(stillPlaying).map(p => ({id:p.id,name:p.name,cards:p.hand})) : [], nextStarter: r.rounds > 0 && r.players.some(p => p.id === r.nextStarter && !p.removed) ? r.nextStarter : null, code: r.code, host: r.host, config: { ...DEFAULT_CONFIG, ...r.config }, status: r.status, version, me: id, social: publicSocial(r, id, now), pause: r.pause || null, animation: r.presentationUntil ? { remainingMs: presentationRemaining(r) } : null,
    players: r.players.map(p => ({ id: p.id, name: p.name, score: r.scores?.[p.id] || 0, count: p.hand.length, ready: p.ready, out: p.out, withdrawn: !!p.withdrawn, removed: !!p.removed, finished: !!p.finished, rank: g?.placements?.find(e => e.player === p.id)?.rank || null, uno: p.uno, bot: !!p.bot, autoplay: !!p.autoplay, online: !p.removed && (!!p.bot || Date.now() - (seen[p.id] || 0) < 25000), lastSeen: seen[p.id] || 0 })), hand: me?.hand || [], blockedReasons: Object.fromEntries((me?.hand || []).map(c => [c.id, cardBlockReason(r, id, c)])), logs: r.logs,
    game: g ? { jump: g.jump ? { top: g.jump.top, actor: g.jump.actor, cards: jumpCards(r,id).map(c => c.id), direction: jumpDirection(r,id) } : null, recap: publicRecap(r), delivery: g.delivery || null, top: g.discard[g.discard.length - 1], color: g.color, turn: g.turn, direction: g.direction, penalty: g.penalty, penaltyChain: g.penaltyChain || [], lastDraw: g.lastDraw, pending: g.pending, risk: g.risk, winner: g.winner, loser: g.loser || null, placements: g.placements || [], round: g.round, deckCount: g.deck.length, forced: g.forced, deal: g.deal ? { dealt: g.deal.dealt, total: g.deal.total, lastPlayer: g.deal.lastPlayer } : null, drawing: g.drawing ? { player: g.drawing.player, mode: g.drawing.mode, drawn: g.drawing.drawn, total: g.drawing.total } : null, knockout: g.knockout ? { player: g.knockout.player, count: g.knockout.count } : null, resolution: r.status === "resolving" ? g.result?.reason || "最后一张牌正在结算" : null, transfer: g.transfer ? { id: g.transfer.id, kind: g.transfer.kind, from: g.transfer.from, to: g.transfer.to, fromCount: g.transfer.fromCount, toCount: g.transfer.toCount, duration: g.transfer.duration, remainingMs: Math.max(0, g.transfer.startedAt + g.transfer.duration - now) } : null, finishers: (g.finishers || []).filter(id => !player(r, id).out && player(r, id).hand.length === 0), playable: me && stillPlaying(me) && !me.autoplay && g.turn === id && !g.pending ? me.hand.filter(c => canPlay(r, c)).map(c => c.id) : [] } : null };
}

// Bots choose using their own hand and public counts; hidden picks use positions only.
export function botAction(r: Room): { id: string; action: Action } | null {
  const g = r.game; if (!g || r.pause || r.status !== "playing" || g.drawing || g.knockout) return null;
  const pending = g.pending, id = pending ? pending.kind === "return" ? pending.target! : pending.actor : g.turn;
  const p = player(r, id); if ((!p.bot && !p.autoplay) || !stillPlaying(p)) return null;
  const favoriteColor = () => [...COLORS].sort((a, b) => p.hand.filter(c => c.color === b).length - p.hand.filter(c => c.color === a).length)[0];
  if (pending?.kind === "zero") { const incoming = player(r, nextPlayer(r, id, r.players.filter(stillPlaying).length - 1)); return {id,action:{type:"chooseZero",rotate:incoming.hand.length < p.hand.length}}; }
  if (pending?.kind === "roulette") return { id, action: pending.color ? { type: "drawRoulette" } : { type: "color", color: shuffle(COLORS)[0] } };
  if (pending?.kind === "target") {
    if (r.config.seven === "choice" && !pending.sevenMode) return { id, action: { type: "chooseSeven", mode: r.players.some(q => stillPlaying(q) && q.id !== id && q.hand.length < p.hand.length) ? "swap" : "trade" } };
    const others = shuffle(r.players.filter(q => stillPlaying(q) && q.id !== id));
    if ((pending.sevenMode || r.config.seven) === "swap") {
      others.sort((a, b) => a.hand.length - b.hand.length);
      if (r.config.sevenMaySkip !== false && p.hand.length <= others[0].hand.length) return { id, action: { type: "skipSeven" } };
    } else if (r.config.sevenMaySkip !== false && shuffle([true, false, false, false])[0]) return { id, action: { type: "skipSeven" } };
    return { id, action: { type: "target", target: others[0].id } };
  }
  if (pending?.kind === "take" || pending?.kind === "return") {
    const source = player(r, pending.kind === "take" ? pending.target! : pending.actor);
    return { id, action: { type: "pick", index: shuffle(source.hand.map((_, i) => i))[0] } };
  }
  const risk = g.risk.find(target => target !== id && player(r, target).hand.length === 1 && !player(r, target).uno);
  if (risk) return { id, action: { type: "catch", target: risk } };
  const playable = shuffle(p.hand.filter(c => canPlay(r, c)));
  const score = (c: Card) => c.kind === "discard" ? p.hand.filter(q => q.color === c.color).length * 20 : c.kind === "number" && c.number === 7 ? 30 : c.color !== "wild" ? 15 : 5;
  playable.sort((a, b) => score(b) - score(a));
  const card = playable[0];
  return { id, action: card ? { type: "play", card: card.id, color: favoriteColor(), uno: true } : { type: "draw", uno: true } };
}
