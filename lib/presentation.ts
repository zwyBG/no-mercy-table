export const TRANSFER_TIMING = {
  swap: { duration: 2800, reveal: 2020, first: 420, second: 1290, flight: 690 },
  single: { duration: 1250, reveal: 900, first: 100, flight: 800 },
} as const;
export type AttackCue = { from: string; to: string; fromName: string; toName: string; amount: number; total: number; chain: number[] };
export type JumpCue = { from: string; to: string; fromName: string; toName: string };
export type EffectEvent = { id: number; text: string; effect?: string; cue?: AttackCue; jump?: JumpCue; copies?: number };

// Visual/audio lifetimes only. They never delay a legal game action.
// These cover complete announcement WAVs when no newer action interrupts.
export function effectDuration(kind: string): number {
  if (kind === "play") return 180;
  if (kind === "take") return 100;
  if (kind === "swap") return 0;
  if (kind === "reverse4") return 1900;
  if (kind === "skipall") return 1300;
  if (kind === "draw10" || kind === "win") return 1550;
  return 1200;
}
export const DRAW_DELIVERY_DURATION = 1100;
export const ADVANCING_ACTIONS = new Set(["play", "jump", "draw", "uno", "catch", "chooseZero", "chooseSeven", "skipSeven", "target", "pick", "color", "drawRoulette", "reset", "start"]);

// Keep only the latest event. A newer action replaces the active effect.
export class EffectQueue {
  scope = "";
  last = 0;
  active: EffectEvent | null = null;
  pending: EffectEvent[] = [];
  sync(scope: string, logs: EffectEvent[]) {
    if (scope !== this.scope) { this.scope = scope; this.last = logs.at(-1)?.id || 0; this.active = null; this.pending = []; return true; }
    const latest=logs.filter(e=>e.id>this.last&&e.effect).at(-1);
    if(latest) {this.active=null;this.pending=[latest];}
    this.last = logs.at(-1)?.id || this.last;
    return false;
  }
  next() { if (!this.active) this.active = this.pending.shift() || null; return this.active; }
  complete() { const event = this.active; this.active = null; return event; }
  clear() { this.active = null; this.pending = []; }
}
