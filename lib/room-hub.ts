import { DurableObject } from "cloudflare:workers";
import { advanceRoom, applyAction, botAction, publicView, type Room, type Action } from "./game";
import { nextRoomWake } from "./room-timing";
import { commitRoomAction } from "./room-commit";
import { commandResult, validRoomCommand } from "./room-command";
import { RoomQueue } from "./room-queue";
import { DEVELOPER_ACTIONS, verifyDeveloperPassword } from "./developer-access";

type Seat = { player?: string; joinedAt: number };
type Row = { room: Room; version: number };

// D1 remains authoritative so existing rooms and HTTP clients keep working.
// Sockets contain a verified seat id, never another seat's hand or a bearer token.
export class RoomHub extends DurableObject<Cloudflare.Env> {
  private queue = new RoomQueue();
  private presence: {until:number;values:Record<string,number>} | null = null;
  private offline: Map<string,number> | null = null;
  private latestVersion = 0;
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private async code() { return (await this.ctx.storage.get<string>("code"))!; }
  private async read(): Promise<Row | null> {
    const row = await this.env.DB!.prepare("SELECT state, version FROM rooms WHERE code = ?").bind(await this.code()).first<{ state: string; version: number }>();
    if(row)this.latestVersion=Math.max(this.latestVersion,row.version);
    return row ? { room: JSON.parse(row.state), version: row.version } : null;
  }
  private seats() { return this.ctx.getWebSockets().filter(ws => (ws.deserializeAttachment() as Seat)?.player && ws.readyState === WebSocket.OPEN); }
  private async seen() {
    if (!this.presence || Date.now() >= this.presence.until) {
      const { results } = await this.env.DB!.prepare("SELECT player, seen FROM presence WHERE room = ?").bind(await this.code()).all<{ player: string; seen: number }>();
      this.presence = {until:Date.now()+10000,values:Object.fromEntries(results.map(p => [p.player,p.seen]))};
    }
    const seen = {...this.presence.values};
    for (const ws of this.seats()) seen[(ws.deserializeAttachment() as Seat).player!] = Date.now();
    return seen;
  }
  private send(ws: WebSocket, value: unknown) { try { ws.send(JSON.stringify(value)); } catch { /* close handler reconciles presence */ } }
  private async broadcast(row: Row) {
    const seen = await this.seen();
    const offline = this.offline ||= await this.ctx.storage.list<number>({ prefix: "offline:" });
    for (const ws of this.seats()) {
      const id = (ws.deserializeAttachment() as Seat).player!;
      if (!row.room.players.some(p => p.id === id && !p.removed)) { this.send(ws, { type: "expired", error: "你已离开或被移出牌桌" }); ws.close(1000); continue; }
      const view = publicView(row.room, id, seen, row.version);
      view.players = view.players.map(p => ({ ...p, online: p.bot || p.online && !(offline.has(`offline:${p.id}`) && (seen[p.id] || 0) <= offline.get(`offline:${p.id}`)!) }));
      this.send(ws, { type: "view", protocol:2, view });
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
    if (url.pathname === "/action" || url.pathname === "/tick") return this.queue.run(async () => {
      const raw = await request.text();
      if (raw.length > 16000) return Response.json({error:"请求过大"},{status:413});
      let action:Action;try {action=JSON.parse(raw);} catch {return Response.json({error:"操作无效"},{status:400});}
      const tick=url.pathname === "/tick";
      if(!action||typeof action!=="object"||Array.isArray(action)||action.code!==code||(tick?action.type!=="tick":!validRoomCommand(action)))return Response.json({error:"操作凭证无效"},{status:400});
      const row=await this.read();if(!row)return Response.json({error:"没有找到这个房间"},{status:404});
      const p=await this.authorized(request.headers.get("Authorization")?.replace(/^Bearer /,""),row.room);
      if(!p)return Response.json({error:"座位凭证已失效，请重新加入"},{status:401});
      if(tick){
        const latest=await this.progress(row);if(!latest)return Response.json({error:"没有找到这个房间"},{status:404});
        if(latest.version!==row.version)this.notify(latest);
        return Response.json(publicView(latest.room,p.id,await this.seen(),latest.version),{headers:{"Cache-Control":"no-store, private"}});
      }
      const result=await this.command(row,p.id,action);
      return Response.json(result.body,{status:result.status,headers:{"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"}});
    });
    if (url.pathname === "/refresh") {
      return this.queue.run(async () => {
        this.presence=null;
        const row=await this.read();if (row) await this.broadcast(row);
        await this.schedule(row);return new Response(null,{status:204});
      });
    }
    return this.queue.run(async()=>{
      const row=await this.read();
      if (!row) return new Response("Room not found", { status: 404 });
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426 });
      if (this.ctx.getWebSockets().length >= 24) return new Response("Too many room connections", { status: 429 });
      const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server);
      server.serializeAttachment({joinedAt:Date.now()} satisfies Seat);await this.schedule(row);
      return new Response(null,{status:101,webSocket:client});
    });
  }
  private async authorized(token:string|undefined, room:Room) {
    if (!token || token.length>200) return null;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,"0")).join("");
    return room.players.find(p=>p.tokenHash===hash&&!p.bot&&!p.removed)||null;
  }
  private async command(row:Row,id:string,action:Action) {
    try {
      const seen=await this.seen();
      let developerAuthorized = false;
      if (DEVELOPER_ACTIONS.has(action.type)) {
        const key = `developer-attempts:${id}`, now = Date.now();
        const previous = await this.ctx.storage.get<{count:number;until:number}>(key);
        if (previous && previous.until > now && previous.count >= 8) throw new Error("尝试过于频繁，请 10 分钟后重试");
        developerAuthorized = await verifyDeveloperPassword(action.password,this.env.DEVELOPER_PASSWORD_HASH);
        if (developerAuthorized) await this.ctx.storage.delete(key);
        else await this.ctx.storage.put(key,{count:(previous && previous.until > now ? previous.count : 0)+1,until:previous && previous.until > now ? previous.until : now+600000});
      }
      const result=await commitRoomAction(row,id,action,current=>({developerAuthorized,hostOffline:Date.now()-(seen[current.host]||0)>45000,offlineIds:current.players.filter(p=>!p.bot&&Date.now()-(seen[p.id]||0)>45000).map(p=>p.id)}),{
        read:()=>this.read(),save:async current=>{
          const saved=await this.env.DB!.prepare("UPDATE rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?").bind(JSON.stringify(current.room),Date.now(),current.room.code,current.version).run();
          return !!saved.meta.changes;
        },
      });
      // Acknowledge the durable commit immediately. Peer delivery and alarms
      // continue on the room queue, without delaying the player's response.
      this.latestVersion=Math.max(this.latestVersion,result.row.version);
      if(result.committed)this.notify(result.row);
      return commandResult(result,id,seen,developerAuthorized);
    } catch(error) {return {status:400,body:{error:error instanceof Error?error.message:"操作失败，请重试"}};}
  }
  private notify(row:Row) {
    this.ctx.waitUntil(this.queue.run(async()=>{if(row.version<this.latestVersion)return;await this.broadcast(row);await this.schedule(row);}));
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > 20000) { ws.close(1009, "Invalid message"); return; }
    let data: { type?: string; token?: string; action?: Action }; try { data = JSON.parse(message); } catch { ws.close(1003); return; }
    if(!data||typeof data!=="object"||Array.isArray(data)){ws.close(1003);return;}
    return this.queue.run(()=>this.socketMessage(ws,data));
  }
  private async socketMessage(ws:WebSocket,data:{type?:string;token?:string;action?:Action}) {
    const seat = ws.deserializeAttachment() as Seat;
    const row = await this.read();
    if (!row) { this.send(ws, { type: "expired", error: "房间已结束" }); ws.close(1000); return; }
    if (!seat.player) {
      if (data.type !== "auth" || typeof data.token !== "string" || data.token.length > 200) { ws.close(1008); return; }
      const p = await this.authorized(data.token,row.room);
      if (!p) { this.send(ws, { type: "expired", error: "座位凭证已失效，请重新加入" }); ws.close(1008); return; }
      ws.serializeAttachment({ ...seat, player: p.id });
      await this.ctx.storage.delete(`offline:${p.id}`);
      this.offline?.delete(`offline:${p.id}`);
      if(this.presence)this.presence.values[p.id]=Date.now();
      await this.env.DB!.prepare("INSERT INTO presence (room, player, seen) VALUES (?, ?, ?) ON CONFLICT(room, player) DO UPDATE SET seen = excluded.seen").bind(await this.code(), p.id, Date.now()).run();
    } else if (!row.room.players.some(p=>p.id===seat.player&&!p.removed)) {this.send(ws,{type:"expired",error:"你已离开或被移出牌桌"});ws.close(1000);return;}
    if(data.type === "action" && seat.player) {
      const action=data.action;
      if(!validRoomCommand(action)||action.code!==row.room.code) {this.send(ws,{type:"ack",actionId:action?.actionId,status:400,error:"操作凭证无效"});return;}
      const result=await this.command(row,seat.player,action),body=result.body;
      this.send(ws,{type:"ack",actionId:action.actionId,status:result.status,...(result.status===200?{view:body}:body)});
      return;
    }
    await this.broadcast(row); await this.schedule(row);
  }
  async webSocketClose(ws: WebSocket, code: number) {
    return this.queue.run(()=>this.socketClosed(ws,code));
  }
  private async socketClosed(ws:WebSocket,code:number) {
    const seat = ws.deserializeAttachment() as Seat;
    try { ws.close(code); } catch { /* already closed */ }
    if (seat?.player && !this.seats().some(other => other !== ws && (other.deserializeAttachment() as Seat).player === seat.player)) {
      const at = Date.now(); await this.ctx.storage.put(`offline:${seat.player}`, at);
      this.offline?.set(`offline:${seat.player}`,at);
      if(this.presence)this.presence.values[seat.player]=at;
      await this.env.DB!.prepare("INSERT INTO presence (room, player, seen) VALUES (?, ?, ?) ON CONFLICT(room, player) DO UPDATE SET seen = excluded.seen").bind(await this.code(), seat.player, at).run();
    }
    const row = await this.read(); if (row) await this.broadcast(row); await this.schedule(row);
  }
  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws, 1011); }
  async alarm() {
    return this.queue.run(()=>this.advance());
  }
  private async advance() {
    for (const ws of this.ctx.getWebSockets()) if (!(ws.deserializeAttachment() as Seat)?.player && Date.now() - (ws.deserializeAttachment() as Seat).joinedAt >= 10000) ws.close(1008, "Authentication required");
    const row = await this.read(); if (!row || !this.seats().length) { await this.schedule(row); return; }
    const latest=await this.progress(row);
    if(latest)await this.broadcast(latest);await this.schedule(latest);
  }
  private async progress(row:Row):Promise<Row|null> {
    const progressed = advanceRoom(row.room);
    if (!progressed && !row.room.pause && Date.now() - (row.room.botAt || 0) >= 1100) {
      const step = botAction(row.room);
      if (step) { applyAction(row.room, step.id, step.action, { hostOffline: false, automated: true }); row.room.botAt = Date.now(); }
      else return row;
    } else if (!progressed) return row;
    const saved = await this.env.DB!.prepare("UPDATE rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?").bind(JSON.stringify(row.room), Date.now(), row.room.code, row.version).run();
    const latest = saved.meta.changes ? { room: row.room, version: row.version + 1 } : await this.read();
    if(latest)this.latestVersion=Math.max(this.latestVersion,latest.version);
    return latest;
  }
}
