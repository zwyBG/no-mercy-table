import type { Room } from "./game.ts";

export const SOCIAL_KINDS = ["tomato", "water", "duck", "glove", "party"] as const;
export type SocialKind = typeof SOCIAL_KINDS[number];
export type SocialEvent = { id: string; kind: SocialKind; from: string; to: string; fromName: string; toName: string; at: number };
export type SocialState = { events: SocialEvent[]; sent: Record<string, number>; lastAt: number };
export const SOCIAL_DURATION = 2600;
export const SOCIAL_COOLDOWN = 5500;
export const SOCIAL_ROOM_COOLDOWN = 3600;
const assertSocial = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

export function sendSocial(room: Room, actor: string, target: unknown, kind: unknown, now = Date.now()) {
  const from = room.players.find(p => p.id === actor), to = room.players.find(p => p.id === target);
  assertSocial(from && !from.bot, "请先坐上牌桌再互动");
  assertSocial(SOCIAL_KINDS.includes(kind as SocialKind), "没有这种互动道具");
  assertSocial(to && to.id !== actor, "请选择另一位玩家");
  assertSocial(room.status === "playing" && room.game, "开局后，点玩家头像就能互动");
  assertSocial(!room.pause, "牌局暂停中，先歇一会儿");
  assertSocial(!room.game?.pending && !room.game?.drawing && !room.game?.transfer && !room.game?.knockout && (room.presentationUntil || 0) <= now, "等当前牌桌动画和操作完成，再整活");
  const previous = room.social;
  assertSocial(!previous?.sent[actor] || now - previous.sent[actor] >= SOCIAL_COOLDOWN, "道具冷却中，过几秒再来");
  assertSocial(!previous?.lastAt || now - previous.lastAt >= SOCIAL_ROOM_COOLDOWN, "上一波互动还在收尾，稍等一下");
  const event: SocialEvent = { id: crypto.randomUUID(), kind: kind as SocialKind, from: actor, to: to!.id, fromName: from!.name, toName: to!.name, at: now };
  const sent = Object.fromEntries(room.players.filter(p => previous?.sent[p.id] && now - previous.sent[p.id] < SOCIAL_COOLDOWN).map(p => [p.id, previous!.sent[p.id]]));
  room.social = { events: [...(previous?.events || []).filter(e => now - e.at < 12000), event].slice(-8), sent: { ...sent, [actor]: now }, lastAt: now };
  // Social animations use the same turn gate; they never enter the card/voice queue.
  room.presentationUntil = now + SOCIAL_DURATION + 120;
  return room;
}

export function publicSocial(room: Room, player: string, now = Date.now()) {
  return {
    events: (room.social?.events || []).filter(e => now - e.at < 12000).map(e => ({ ...e, ageMs: Math.max(0, now - e.at) })),
    cooldownMs: Math.max(0, (room.social?.sent[player] || 0) + SOCIAL_COOLDOWN - now),
    roomCooldownMs: Math.max(0, (room.social?.lastAt || 0) + SOCIAL_ROOM_COOLDOWN - now),
  };
}
