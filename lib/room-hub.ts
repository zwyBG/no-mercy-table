import { DurableObject } from "cloudflare:workers";
import { advanceRoom, applyAction, botAction, publicView, type Room } from "./game";
import { nextRoomWake } from "./room-timing";

type Seat = { player?: string; joinedAt: number };
type Row = { room: Room; version: number };

// D1 remains authoritative so existing rooms and HTTP clients keep working.
// Sockets contain a verified seat id, never another seat's hand or a bearer token.
export class RoomHub extends DurableObject<Cloudflare.Env> {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private async code() { return (await this.ctx.storage.get<string>("code"))!; }
  private async read(): Promise<Row | null> {
    const row = await this.env.DB!.prepare("SELECT state, version FROM rooms WHERE code = ?").bind(await this.code()).first<{ state: string; version: number }>();
    return row ? { room: JSON.parse(row.state), version: row.version } : null;
  }
  private seats() { return this.ctx.getWebSockets().filter(ws => (ws.deserializeAttachment() as Seat)?.player && ws.readyState === WebSocket.OPEN); }
  private async seen() {
    const { results } = await this.env.DB!.prepare("SELECT player, seen FROM presence WHERE room = ?").bind(await this.code()).all<{ player: string; seen: number }>();
    const seen: Record<string, number> = Object.fromEntries(results.map(p => [p.player, p.seen]));
    for (const ws of this.seats()) seen[(ws.deserializeAttachment() as Seat).player!] = Date.now();
    return seen;
  }
  private send(ws: WebSocket, value: unknown) { try { ws.send(JSON.stringify(value)); } catch { /* close handler reconciles presence */ } }
  private async broadcast(row: Row) {
    const seen = await this.seen();
    const offline = await this.ctx.storage.list<number>({ prefix: "offline:" });
    for (const ws of this.seats()) {
      const id = (ws.deserializeAttachment() as Seat).player!;
      if (!row.room.players.some(p => p.id === id)) { this.send(ws, { type: "expired", error: "你已离开牌桌" }); ws.close(1000); continue; }
      const view = publicView(row.room, id, seen, row.version);
      view.players = view.players.map(p => ({ ...p, online: p.bot || p.online && !(offline.has(`offline:${p.id}`) && (seen[p.id] || 0) <= offline.get(`offline:${p.id}`)!) }));
      this.send(ws, { type: "view", view });
    }
  }
  private async schedule(row: Row | null) {
    const deadlines = this.ctx.getWebSockets().filter(ws => !(ws.deserializeAttachment() as Seat)?.player).map(ws => (ws.deserializeAttachment() as Seat).joinedAt + 10000);
    if (row && this.seats().length) {
      const wake = nextRoomWake(row.room); if (wake !== null) deadlines.push(wake);
      const offline = await this.ctx.storage.list<number>({ prefix: "offline:" });
      for (const at of offline.values()) if (at + 45100 > Date.now()) deadlines.push(at + 45100);
    }
    if (!deadlines.length) { await this.ctx.storage.deleteAlarm(); return; }
    const when = Math.max(Date.now() + 1, Math.min(...deadlines));
    if (await this.ctx.storage.getAlarm() !== when) await this.ctx.storage.setAlarm(when);
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url), code = url.searchParams.get("code") || "";
    if (!/^[A-Z2-9]{6}$/.test(code)) return new Response("Invalid room", { status: 400 });
    const existing = await this.code();
    if (existing && existing !== code) return new Response("Invalid room", { status: 400 });
    if (!existing) await this.ctx.storage.put("code", code);
    if (url.pathname === "/presence") return Response.json(await this.seen());
    const row = await this.read();
    if (url.pathname === "/refresh") {
      if (row) await this.broadcast(row);
      await this.schedule(row);
      return new Response(null, { status: 204 });
    }
    if (!row) return new Response("Room not found", { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426 });
    if (this.ctx.getWebSockets().length >= 24) return new Response("Too many room connections", { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ joinedAt: Date.now() } satisfies Seat);
    await this.schedule(row);
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 4096) { ws.close(1009, "Invalid message"); return; }
    let data: { type?: string; token?: string }; try { data = JSON.parse(message); } catch { ws.close(1003); return; }
    const seat = ws.deserializeAttachment() as Seat;
    const row = await this.read();
    if (!row) { this.send(ws, { type: "expired", error: "房间已结束" }); ws.close(1000); return; }
    if (!seat.player) {
      if (data.type !== "auth" || typeof data.token !== "string" || data.token.length > 200) { ws.close(1008); return; }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.token)))).map(x => x.toString(16).padStart(2, "0")).join("");
      const p = row.room.players.find(p => p.tokenHash === hash && !p.bot);
      if (!p) { this.send(ws, { type: "expired", error: "座位凭证已失效，请重新加入" }); ws.close(1008); return; }
      ws.serializeAttachment({ ...seat, player: p.id });
      await this.ctx.storage.delete(`offline:${p.id}`);
      await this.env.DB!.prepare("INSERT INTO presence (room, player, seen) VALUES (?, ?, ?) ON CONFLICT(room, player) DO UPDATE SET seen = excluded.seen").bind(await this.code(), p.id, Date.now()).run();
    }
    await this.broadcast(row); await this.schedule(row);
  }
  async webSocketClose(ws: WebSocket, code: number) {
    const seat = ws.deserializeAttachment() as Seat;
    try { ws.close(code); } catch { /* already closed */ }
    if (seat?.player && !this.seats().some(other => other !== ws && (other.deserializeAttachment() as Seat).player === seat.player)) {
      const at = Date.now(); await this.ctx.storage.put(`offline:${seat.player}`, at);
      await this.env.DB!.prepare("INSERT INTO presence (room, player, seen) VALUES (?, ?, ?) ON CONFLICT(room, player) DO UPDATE SET seen = excluded.seen").bind(await this.code(), seat.player, at).run();
    }
    const row = await this.read(); if (row) await this.broadcast(row); await this.schedule(row);
  }
  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws, 1011); }
  async alarm() {
    for (const ws of this.ctx.getWebSockets()) if (!(ws.deserializeAttachment() as Seat)?.player && Date.now() - (ws.deserializeAttachment() as Seat).joinedAt >= 10000) ws.close(1008, "Authentication required");
    const row = await this.read(); if (!row || !this.seats().length) { await this.schedule(row); return; }
    const progressed = advanceRoom(row.room);
    if (!progressed && !row.room.pause && Date.now() - (row.room.botAt || 0) >= 1100) {
      const step = botAction(row.room);
      if (step) { applyAction(row.room, step.id, step.action, { hostOffline: false, automated: true }); row.room.botAt = Date.now(); }
      else { await this.broadcast(row); await this.schedule(row); return; }
    } else if (!progressed) { await this.broadcast(row); await this.schedule(row); return; }
    const saved = await this.env.DB!.prepare("UPDATE rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?").bind(JSON.stringify(row.room), Date.now(), row.room.code, row.version).run();
    const latest = saved.meta.changes ? { room: row.room, version: row.version + 1 } : await this.read();
    if (latest) await this.broadcast(latest); await this.schedule(latest);
  }
}
