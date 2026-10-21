export const LATENCY_INTERVAL = { room: 10000, background: 60000, home: 30000, timeout: 8000, stale: 25000 } as const;

// Only one static ping may be in flight. An unlabelled late pong must never
// measure a newer ping, and performance.now() === 0 is a valid start time.
export class LatencyProbe {
  startedAt: number | null = null;
  sampledAt: number | null = null;
  begin(now: number) { if (this.startedAt !== null) return false; this.startedAt = now; return true; }
  complete(now: number): number | null {
    if (this.startedAt === null) return null;
    const elapsed = now - this.startedAt; this.startedAt = null;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= LATENCY_INTERVAL.timeout) return null;
    this.sampledAt = now; return Math.max(1, Math.round(elapsed));
  }
  timedOut(now: number) { return this.startedAt !== null && now - this.startedAt >= LATENCY_INTERVAL.timeout; }
  reset() { this.startedAt = null; this.sampledAt = null; }
}
export function latencyQuality(ms: number | null) { return ms === null ? "checking" : ms <= 150 ? "good" : ms <= 350 ? "fair" : "poor"; }
