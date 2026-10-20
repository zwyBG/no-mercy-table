import type { Room } from "./game.ts";

export function scoreForPlace(seats: number, rank: number): number {
  return rank === seats ? -1 : Math.max(0, (seats - rank - 1) * 2);
}

// Successful finishers lead, followed by later knockouts, with the final
// remaining player last. Everyone who started the round receives one place.
export function settleRoundScores(room: Room) {
  const g = room.game;
  if (!g || g.scored || (room.lastScoredRound || 0) >= g.round) return;
  const placements = g.placements || [];
  const ordered = [
    ...placements.filter(p => p.kind === "finished").sort((a,b) => (a.rank || 0) - (b.rank || 0)),
    ...placements.filter(p => p.kind === "knockout" && p.player !== g.loser).reverse(),
    ...placements.filter(p => p.kind === "last"),
    ...placements.filter(p => p.kind === "knockout" && p.player === g.loser),
  ];
  if (ordered.length !== room.players.length || new Set(ordered.map(p => p.player)).size !== room.players.length) return;
  room.scores ||= {};
  ordered.forEach((p,index) => {
    p.rank = index + 1;
    p.scoreDelta = scoreForPlace(ordered.length,p.rank);
    p.scoreTotal = (room.scores![p.player] || 0) + p.scoreDelta;
    room.scores![p.player] = p.scoreTotal;
  });
  g.placements = ordered; g.scored = true; room.lastScoredRound = g.round;
  room.nextStarter = g.winner && room.players.some(p => p.id === g.winner && !p.removed) ? g.winner : null;
}
