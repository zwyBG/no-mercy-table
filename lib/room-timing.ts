import type { Room } from "./game";

// Only timed game work needs an alarm. Human thinking time remains idle.
export function nextRoomWake(room: Room, now = Date.now()): number | null {
  const g = room.game;
  if (!g || room.pause) return null;
  if (room.presentationUntil) return Math.max(now + 1, room.presentationUntil);
  if (room.status === "dealing" && g.deal) return Math.max(now + 1, g.deal.nextAt);
  if (g.transfer) return Math.max(now + 1, g.transfer.startedAt + g.transfer.duration);
  if (g.knockout) return Math.max(now + 1, g.knockout.until);
  if (g.drawing) return Math.max(now + 1, g.drawing.nextAt);
  if (room.status === "resolving" && g.result) return Math.max(now + 1, g.result.revealAt);
  if (room.status !== "playing") return null;
  const pending = g.pending;
  const id = pending ? pending.kind === "return" ? pending.target : pending.actor : g.turn;
  const actor = room.players.find(p => p.id === id);
  return actor && !actor.out && (actor.bot || actor.autoplay) ? Math.max(now + 1, (room.botAt || 0) + 1100) : null;
}
