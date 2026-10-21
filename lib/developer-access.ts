export const DEVELOPER_ACTIONS = new Set(["devUnlock", "devCard", "devRoulette", "devScore"]);

// The configured digest is a Worker secret. Neither the password nor its
// digest is bundled into the browser or persisted with a room command.
export async function verifyDeveloperPassword(password: unknown, digest: string | undefined): Promise<boolean> {
  if (typeof password !== "string" || !password.trim() || password.length > 128 || !digest || !/^[a-f0-9]{64}$/i.test(digest)) return false;
  const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password.trim().toLowerCase())));
  let different = 0;
  for (let i = 0; i < actual.length; i++) different |= actual[i] ^ Number.parseInt(digest.slice(i * 2, i * 2 + 2), 16);
  return different === 0;
}

export class PrivateEntryTaps {
  private count = 0;
  private last: number | null = null;
  tap(now: number): boolean {
    this.count = this.last !== null && now >= this.last && now - this.last <= 800 ? this.count + 1 : 1;
    this.last = now;
    if (this.count < 5) return false;
    this.count = 0; this.last = null; return true;
  }
}
