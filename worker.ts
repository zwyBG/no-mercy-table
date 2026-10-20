import handler from "vinext/server/fetch-handler";
export { RoomHub } from "./lib/room-hub";
export default { fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
  const url = new URL(request.url);
  if (url.pathname === "/api/room/live") {
    const code = url.searchParams.get("code") || "";
    const origin = request.headers.get("Origin");
    if (!/^[A-Z2-9]{6}$/.test(code) || origin && origin !== url.origin) return new Response("Invalid room connection", { status: 403 });
    if (!env.ROOMS) return new Response("Live rooms unavailable", { status: 503 });
    return env.ROOMS.getByName(code).fetch(request);
  }
  return handler.fetch(request, env, ctx);
} };
