import { isConnectionError, readApiResponse } from "./api-response.ts";

// Only authenticated seat actions have server-side action-id deduplication.
// Reuse the identical body after an ambiguous timeout; never replay create/join.
export async function postRoomAction<T>(payload: Record<string, unknown>, token?: string, onRetry?: () => void, request: typeof fetch = fetch) {
  const body = JSON.stringify(payload);
  const retryable = !!token && typeof payload.actionId === "string" && !["create", "join", "heartbeat", "tick"].includes(String(payload.type));
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await request("/api/room", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body, signal: AbortSignal.timeout(12000),
      });
      return { response, data: await readApiResponse<T>(response) };
    } catch (error) {
      if (!retryable || attempt >= 1 || !isConnectionError(error)) throw error;
      onRetry?.();
    }
  }
}
