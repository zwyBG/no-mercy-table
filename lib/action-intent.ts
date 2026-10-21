import type { Action, Room } from "./game.ts";
import { jumpCards } from "./jump-in.ts";

// Ignore presentation deadlines, logs and hand ordering. Only state that can
// change the meaning of a turn action participates in its consistency key.
export function actionKey(room: Room, id: string): string {
  const g = room.game, p = room.players.find(p => p.id === id), pending = g?.pending;
  return JSON.stringify([room.status,g?.round,g?.turn,g?.discard.at(-1)?.id,g?.color,g?.direction,g?.penalty,
    pending ? [pending.kind,pending.actor,pending.target,pending.color,pending.drawn,pending.sevenMode] : null,
    g?.drawing ? [g.drawing.player,g.drawing.mode,g.drawing.drawn,g.drawing.total] : null,
    g?.knockout?.player,!!room.pause,(p?.hand || []).map(c => c.id).sort()]);
}

const independent = new Set(["sort","uno","pause","autoplay","claimHost","leave","kick","social","ready","config","seats","addBots","removeBot"]);
const turnActions = new Set(["play","draw","catch","chooseZero","chooseSeven","skipSeven","target","pick","color","drawRoulette","reset"]);
export function canRebaseAction(room: Room, id: string, action: Action): boolean {
  if (action.type === "jump") return action.top === room.game?.jump?.top && jumpCards(room,id).some(c => c.id === action.card);
  if (independent.has(action.type)) return true;
  return turnActions.has(action.type) && typeof action.actionKey === "string" && action.actionKey === actionKey(room,id);
}
