import type { Room } from "./game";

// Only timed game work needs an alarm. Human thinking time remains idle.
export function nextRoomWake(room: Room, now = Date.now()): number | null {
  const g = room.game;
  if (!g || room.pause) return null;
  if (room.status === "dealing" && g.deal) return Math.max(now + 1, g.deal.nextAt);
  if (g.knockout) return Math.max(now + 1, g.knockout.until);
  if (g.drawing) return Math.max(now + 1, g.drawing.nextAt);
  if (room.status === "resolving" && g.result) return Math.max(now + 1, g.result.revealAt);
  if (room.status !== "playing") return null;
  const deadlines = [room.presentationUntil,g.transfer ? g.transfer.startedAt+g.transfer.duration : undefined].filter((t):t is number=>!!t);
  const pending = g.pending;
  const id = pending ? pending.kind === "return" ? pending.target : pending.actor : g.turn;
  const actor = room.players.find(p => p.id === id);
  if(actor && !actor.out && !actor.finished && (actor.bot || actor.autoplay)) deadlines.push((room.botAt||0)+1100);
  return deadlines.length ? Math.max(now+1,Math.min(...deadlines)) : null;
}
