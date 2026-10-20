export const TRANSFER_TIMING = {
  swap: { duration: 2800, reveal: 2020, first: 420, second: 1290, flight: 690 },
  single: { duration: 1250, reveal: 900, first: 100, flight: 800 },
} as const;
export type AttackCue = { from: string; to: string; fromName: string; toName: string; amount: number; total: number; chain: number[] };
export type EffectEvent = { id: number; text: string; effect?: string; cue?: AttackCue };

// One active event survives later updates; subsequent effects wait in log order.
export class EffectQueue {
  scope = "";
  last = 0;
  active: EffectEvent | null = null;
  pending: EffectEvent[] = [];
  sync(scope: string, logs: EffectEvent[]) {
    if (scope !== this.scope) { this.scope = scope; this.last = logs.at(-1)?.id || 0; this.active = null; this.pending = []; return true; }
    this.pending.push(...logs.filter(e => e.id > this.last && e.effect));
    this.last = logs.at(-1)?.id || this.last;
    return false;
  }
  next() { if (!this.active) this.active = this.pending.shift() || null; return this.active; }
  complete() { const event = this.active; this.active = null; return event; }
  clear() { this.active = null; this.pending = []; }
}
