// Preserve in-progress manual ordering while a live update adds or removes cards.
export function reconcileHandOrder(current: string[], incoming: string[]): string[] {
  const valid = new Set(incoming), kept = current.filter(id => valid.has(id));
  const known = new Set(kept);
  return [...kept, ...incoming.filter(id => !known.has(id))];
}
