import type { Card, Color, Room } from "./game.ts";

// A window identifies a physical card, never just its face. It closes when a
// subsequent decision starts drawing or actually transfers hand cards.
export type JumpWindow = { top: string; actor: string; direction: 1 | -1; color: Color; blocked: string[] };
export function sameCardFace(a: Card, b: Card): boolean {
  return a.color === b.color && a.kind === b.kind && (a.kind !== "number" || a.number === b.number);
}
export function jumpCards(room: Room, id: string): Card[] {
  const g = room.game, p = room.players.find(p => p.id === id), window = g?.jump;
  if (!g || !window || room.status !== "playing" || room.pause || g.drawing || g.knockout || !p || p.out || p.finished || p.withdrawn || p.removed || p.autoplay || window.blocked.includes(id)) return [];
  const top = g.discard.at(-1);
  return top?.id === window.top ? p.hand.filter(c => sameCardFace(c, top)) : [];
}

// Count active seats in both directions, retaining the previous player if they
// just finished. Ties/self retain the direction before the replaced effect.
export function jumpDirection(room: Room, id: string): 1 | -1 {
  const window = room.game!.jump!;
  const seats = room.players.filter(p => p.id === window.actor || !p.out && !p.finished && !p.withdrawn && !p.removed).map(p => p.id);
  const from = seats.indexOf(window.actor), to = seats.indexOf(id);
  if (from < 0 || to < 0 || from === to) return window.direction;
  const clockwise = (to - from + seats.length) % seats.length, counterclockwise = seats.length - clockwise;
  return clockwise === counterclockwise ? window.direction : clockwise < counterclockwise ? 1 : -1;
}
