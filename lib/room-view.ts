type RoomVersion = { code: string; version: number };
type Session = { code: string; token: string };

// A socket may deliver a final buffered view before React has cleaned up its
// old effect. Leaving/switching a seat must take effect synchronously.
export function canAcceptRoomView(current: RoomVersion | null, next: RoomVersion, active: Session | null, sourceToken?: string): boolean {
  if (!active || next.code !== active.code || sourceToken !== undefined && sourceToken !== active.token) return false;
  return !current || current.code !== next.code || next.version >= current.version;
}
