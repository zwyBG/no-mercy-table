import type { Room } from "./game.ts";

export function scoreForPlace(seats: number, rank: number): number {
  return rank === seats ? -1 : Math.max(0, (seats - rank - 1) * 2);
}

// Finishers lead, then the final active player, then departures in reverse
// order. The first knockout/withdrawal is always last, even if its time ties.
export function rankedPlacements(room: Room) {
  const placements = room.game?.placements || [];
  return [
    ...placements.filter(p => p.kind === "finished").sort((a,b) => (a.rank || 0) - (b.rank || 0)),
    ...placements.filter(p => p.kind === "last"),
    ...placements.filter(p => p.kind === "knockout").reverse(),
  ];
}

// Everyone who started the round receives one place and one score update.
export function settleRoundScores(room: Room) {
  const g = room.game;
  if (!g || g.scored || (room.lastScoredRound || 0) >= g.round) return;
  const ordered = rankedPlacements(room);
  if (ordered.length !== room.players.length || new Set(ordered.map(p => p.player)).size !== room.players.length) return;
  room.scores ||= {};
  ordered.forEach((p,index) => {
    p.rank = index + 1;
    p.scoreDelta = scoreForPlace(ordered.length,p.rank);
    p.scoreTotal = (room.scores![p.player] || 0) + p.scoreDelta;
    room.scores![p.player] = p.scoreTotal;
  });
  g.placements = ordered; g.loser = ordered.at(-1)!.player; g.scored = true; room.lastScoredRound = g.round;
  const first = ordered[0].player;
  room.nextStarter = room.players.some(p => p.id === first && !p.removed) ? first : null;
}
