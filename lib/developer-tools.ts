import type { Action, Card, Color, Room } from "./game.ts";

export const COLORED_KINDS = ["number", "skip", "reverse", "draw2", "draw4", "discard", "skipall"];
export const WILD_KINDS = ["reverse4", "roulette", "draw6", "draw10"];
export const cardFaceKey = (c: Pick<Card, "color" | "kind" | "number">) => `${c.color}:${c.kind}:${c.kind === "number" ? c.number : ""}`;
function requireValue(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function validFace(value: unknown): Omit<Card, "id"> {
  const c = value as Partial<Card> | null;
  requireValue(c && (c.color === "wild" ? WILD_KINDS.includes(String(c.kind)) : ["red", "yellow", "green", "blue"].includes(String(c.color)) && COLORED_KINDS.includes(String(c.kind))), "请选择有效的颜色和牌型");
  requireValue(c.kind !== "number" || Number.isInteger(c.number) && c.number! >= 0 && c.number! <= 9, "数字应为 0～9");
  return {color:c.color!,kind:c.kind!,...(c.kind === "number" ? {number:c.number} : {})};
}

export function applyDeveloperAction(room: Room, id: string, action: Action, authorized: boolean): Room {
  requireValue(authorized, "密码不正确或后台尚未配置");
  const p = room.players.find(p => p.id === id && !p.removed && !p.bot);
  requireValue(p, "座位凭证已失效");
  if (action.type === "devUnlock") return room;
  if (action.type === "devScore") {
    const target = room.players.find(p => p.id === action.target);
    requireValue(target, "玩家已离开牌桌");
    requireValue(Number.isSafeInteger(action.score) && Math.abs(action.score as number) <= 1000000, "积分应为 −1000000～1000000 的整数");
    requireValue(action.previousScore === (room.scores?.[target.id] || 0), "该玩家积分已更新，请重新确认");
    (room.scores ||= {})[target.id] = action.score as number;
    const placement = room.game?.scored && room.game.placements?.find(p => p.player === target.id);
    if (placement) placement.scoreTotal = action.score as number;
    return room;
  }
  const g = room.game;
  requireValue(g && room.status === "playing", "请在进行中的牌局操作");
  if (action.type === "devCard") {
    requireValue(!p.out && !p.finished && !p.withdrawn && !g.drawing && !g.knockout, "当前不能修改自己的手牌");
    const index = p.hand.findIndex(c => c.id === action.card);
    requireValue(index >= 0, "这张牌已经离开你的手牌");
    requireValue(action.previous === cardFaceKey(p.hand[index]), "这张牌已变化，请重新选择");
    const face = validFace(action.face);
    p.hand[index] = {id:p.hand[index].id,...face};
    return room;
  }
  requireValue(action.type === "devRoulette", "操作无效");
  const pending = g.pending;
  requireValue(pending?.kind === "roulette" && pending.color && !g.knockout, "当前没有已选好颜色的轮盘");
  requireValue(action.actor === pending.actor && action.color === pending.color && action.drawn === (pending.drawn || 0) && action.top === g.discard.at(-1)?.id, "轮盘进度已变化，请重新确认");
  if (action.hitAt === null) { delete g.rouletteControl; return room; }
  const target = room.players.find(p => p.id === pending.actor)!;
  requireValue(Number.isInteger(action.hitAt) && (action.hitAt as number) > (pending.drawn || 0), "请设置尚未抽到的张数");
  requireValue((action.hitAt as number) <= (pending.drawn || 0) + 25 - target.hand.length, "目标张数不能超过本次达到 25 张手牌的时刻");
  g.rouletteControl = {actor:pending.actor,color:pending.color,hitAt:action.hitAt as number,top:g.discard.at(-1)!.id};
  return room;
}

export function controlledRouletteFace(card: Card, color: Color, hit: boolean): Card {
  if (hit) return card.color === color ? card : {id:card.id,color,kind:"number",number:card.kind === "number" ? card.number : 0};
  if (card.color !== color) return card;
  const colors: Color[] = ["red", "yellow", "green", "blue"];
  return {...card,color:colors[(colors.indexOf(color) + 1) % colors.length]};
}
