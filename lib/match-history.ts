import type { Action, Card, Color, Room } from "./game";

export type PublicCard = Pick<Card, "color" | "kind" | "number">;
export type ReplaySeat = { id: string; count: number; out: boolean; finished?: boolean; rank?: number };
export type ReplayFrame = {
  id: number; at: number; kind: "opening" | "play" | "swap" | "trade" | "rotation" | "roulette" | "draw" | "penalty" | "knockout" | "finish" | "leave";
  text: string; actor?: string; target?: string; card?: PublicCard; color: Color; direction: 1 | -1;
  counts: ReplaySeat[]; before?: ReplaySeat[]; penalty: number; amount?: number; drawn?: number;
  chain?: { player: string; value: number; color: Card["color"] }[];
};
export type MatchHistory = {
  startedAt: number; endedAt?: number; reason?: string; serial: number; plays: number; trimmed: number; partial: boolean;
  events: ReplayFrame[]; maxPenalty?: { total: number; chain: NonNullable<ReplayFrame["chain"]>; target?: string; drawn: number; knockedOut?: boolean; event: ReplayFrame };
  keyExchange?: { swing: number; event: ReplayFrame }; lastPlay?: ReplayFrame;
  activeDraw?: { player: string; mode: string; total: number; drawn: number; before: ReplaySeat[] };
};
export const REPLAY_LIMIT = 200;
export const newMatchHistory = (partial = false): MatchHistory => ({ startedAt: Date.now(), serial: 0, plays: 0, trimmed: 0, partial, events: [] });
const seats = (r: Room): ReplaySeat[] => r.players.map(p => ({ id: p.id, count: p.hand.length, out: p.out, ...(p.finished ? {finished:true,rank:r.game?.placements?.find(e => e.player === p.id && e.kind === "finished")?.rank} : {}) }));
const name = (r: Room, id?: string) => r.players.find(p => p.id === id)?.name || "玩家";
const publicCard = (c: Card): PublicCard => ({ color: c.color, kind: c.kind, ...(c.number === undefined ? {} : { number: c.number }) });

export function roundSnapshot(r: Room, actor?: string, action?: Action) {
  const g = r.game;
  return { status: r.status, counts: seats(r), pending: g?.pending ? { ...g.pending } : null,
    drawing: g?.drawing ? { ...g.drawing } : null,
    card: action?.type === "play" ? r.players.find(p => p.id === actor)?.hand.find(c => c.id === action.card) : undefined };
}
type Before = ReturnType<typeof roundSnapshot>;
function append(r: Room, frame: Pick<ReplayFrame, "kind" | "text"> & Partial<ReplayFrame>) {
  const g = r.game!, h = g.history!;
  const event: ReplayFrame = { id: ++h.serial, at: Date.now(), color: g.color, direction: g.direction, counts: seats(r), penalty: g.penalty, ...frame };
  h.events.push(event);
  if (h.events.length > REPLAY_LIMIT) { h.trimmed += h.events.length - REPLAY_LIMIT; h.events = h.events.slice(-REPLAY_LIMIT); }
  return event;
}
function exchange(r: Room, frame: ReplayFrame, before: Before) {
  const old = before.counts.find(p => p.id === frame.actor)?.count || 0;
  const current = frame.counts.find(p => p.id === frame.actor)?.count || 0;
  const swing = Math.abs(old - current), h = r.game!.history!;
  if (!h.keyExchange || frame.kind === "swap" && h.keyExchange.event.kind !== "swap" || frame.kind === h.keyExchange.event.kind && swing > h.keyExchange.swing) h.keyExchange = { swing, event: frame };
}

// Store public plays and counts only. Drawn cards and blind picks never enter a replay.
export function recordRoundChange(r: Room, before: Before, actor?: string, action?: Action) {
  const g = r.game; if (!g) return;
  g.history ||= newMatchHistory(true);
  const h = g.history;
  if ((r.status === "playing" && before.status === "dealing" || before.status === "lobby" && r.status === "playing") && !h.events.some(e => e.kind === "opening")) {
    append(r, { kind: "opening", text: `发牌完成，${name(r, g.turn)} 先出牌` });
  }
  if (action?.type === "play" && before.card) {
    const c = before.card; h.plays++;
    const text = r.logs.findLast(e => e.text.startsWith(`${name(r, actor)} 出了`))?.text || `${name(r, actor)} 出牌`;
    const event = append(r, { kind: "play", actor, card: publicCard(c), target: g.penalty || c.kind === "roulette" ? g.turn : undefined, text: text + (g.penalty ? `，累计 ${g.penalty} 张 → ${name(r, g.turn)}` : ""), before: before.counts,
      ...(g.penalty ? { chain: (g.penaltyChain || []).map(s => ({ ...s })) } : {}) });
    h.lastPlay = event;
    if (g.penalty && (!h.maxPenalty || g.penalty >= h.maxPenalty.total)) h.maxPenalty = { total: g.penalty, chain: event.chain || [], drawn: 0, event };
  }
  if (action?.type === "target" && g.transfer?.kind === "swap") {
    const target = g.transfer.to;
    const from = before.counts.find(p => p.id === actor)?.count || 0, to = before.counts.find(p => p.id === target)?.count || 0;
    exchange(r, append(r, { kind: "swap", actor, target, before: before.counts, amount: from, drawn: to,
      text: `${name(r, actor)} 与 ${name(r, target)} 互换整手：${from} 张 ↔ ${to} 张` }), before);
  }
  if (action?.type === "chooseZero" && before.pending?.kind === "zero") append(r,{kind:"rotation",actor,before:before.counts,text:action.rotate ? `${name(r,actor)} 选择按${g.direction === 1 ? "顺时针" : "逆时针"}方向传牌，所有在局玩家交换整手` : `${name(r,actor)} 出 0 后选择不换牌`});
  if (action?.type === "pick" && before.pending) {
    const target = before.pending.kind === "take" ? before.pending.target : before.pending.actor;
    exchange(r, append(r, { kind: "trade", actor, target, before: before.counts, text: `${name(r, actor)} 从 ${name(r, target)} 的手牌抽走一张` }), before);
  }
  if (action?.type === "color" && g.pending?.color) append(r, { kind: "roulette", actor, text: `${name(r, actor)} 选择${({ red: "红", yellow: "黄", green: "绿", blue: "蓝" })[g.pending.color]}色，开始逐张抽牌` });
  if (action?.type === "drawRoulette") {
    const drawn = (before.pending?.drawn || 0) + 1;
    append(r, { kind: "roulette", actor, before: before.counts, drawn, amount: 1, text: `${name(r, actor)} 轮盘抽第 ${drawn} 张${g.pending && !r.players.find(p => p.id === actor)?.out ? "，继续抽牌" : "，轮盘结束"}` });
  }
  if (!before.drawing && g.drawing) {
    const d = g.drawing; h.activeDraw = { player: d.player, mode: d.mode, total: d.total, drawn: 0, before: before.counts };
    if (d.mode === "penalty") {
      append(r, { kind: "penalty", actor: d.player, before: before.counts, amount: d.total, drawn: 0, chain: (g.penaltyChain || []).map(s => ({ ...s })), text: `${name(r, d.player)} 接不上，接受累计 ${d.total} 张罚抽` });
      if (h.maxPenalty?.total === d.total) { h.maxPenalty.target = d.player; h.maxPenalty.drawn = 0; }
    }
  }
  if (h.activeDraw && before.drawing) {
    const d = h.activeDraw;
    d.drawn += Math.max(0, (r.players.find(p => p.id === d.player)?.hand.length || 0) - (before.counts.find(p => p.id === d.player)?.count || 0));
    if (h.maxPenalty?.total === d.total && h.maxPenalty.target === d.player && d.mode === "penalty") h.maxPenalty.drawn = d.drawn;
    const eliminated = r.players.find(p => p.id === d.player)?.out;
    if (h.maxPenalty?.total === d.total && h.maxPenalty.target === d.player && d.mode === "penalty") h.maxPenalty.knockedOut = !!eliminated;
    if (!g.drawing || eliminated) {
      append(r, { kind: "draw", actor: d.player, before: d.before, amount: d.total || d.drawn, drawn: d.drawn,
        text: `${name(r, d.player)} ${d.mode === "penalty" ? "罚抽" : d.mode === "catch" ? "漏喊 UNO 罚抽" : "摸牌"} ${d.drawn} 张${eliminated ? "，达到 25 张淘汰" : d.mode === "until" ? "，摸到可出的牌" : "，抽牌完成"}` });
      delete h.activeDraw;
    }
  }
  for (const p of r.players.filter(p => p.out && !before.counts.find(q => q.id === p.id)?.out)) {
    const departure = action?.type === "leave" || action?.type === "kick";
    append(r, { kind: departure ? "leave" : "knockout", actor: p.id, before: before.counts, text: departure ? `${p.name} ${action?.type === "kick" ? "被房主移出了牌桌" : "退出本局，进入观战"}` : `${p.name} 达到 ${p.hand.length} 张手牌，被淘汰`, amount: before.counts.find(q => q.id === p.id)?.count || p.hand.length });
  }
  for (const p of r.players.filter(p => p.finished && !before.counts.find(q => q.id === p.id)?.finished)) {
    const rank = g.placements?.find(e => e.player === p.id && e.kind === "finished")?.rank;
    append(r, {kind:"finish",actor:p.id,before:before.counts,text:`${p.name} 出完手牌，第 ${rank} 名，进入观战；剩余玩家继续`});
  }
  if (r.status === "finished" && before.status !== "finished") {
    h.endedAt = Date.now(); h.reason = g.result?.reason || "本局结束"; append(r, { kind: "finish", actor: g.loser || undefined, text: `本局排位结束：${h.reason}` });
  }
}

export function publicRecap(r: Room) {
  const h = r.game?.history; if (!h || r.status !== "finished") return null;
  const { activeDraw: _activeDraw, ...recap } = h;
  return recap;
}

export function keyReplayFrames(events: ReplayFrame[]) {
  const ids = new Set(events.filter(e => ["swap", "trade", "rotation", "penalty", "knockout", "finish", "roulette"].includes(e.kind) || (e.kind === "play" && (!!e.penalty || e.card?.number === 0 || e.card?.number === 7))).map(e => e.id));
  for (const e of events.filter(e => e.kind === "draw")) if (e.amount && e.amount > 1) ids.add(e.id);
  events.slice(-5).forEach(e => ids.add(e.id));
  const lastPlay = events.findLast(e => e.kind === "play"); if (lastPlay) ids.add(lastPlay.id);
  if (events[0]) ids.add(events[0].id);
  return events.filter(e => ids.has(e.id));
}
