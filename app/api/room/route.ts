import { env } from "cloudflare:workers";
import { advanceRoom, applyAction, botAction, createRoom, log, publicView, DEFAULT_CONFIG, type Room, type Player, type Action } from "@/lib/game";
import { commitRoomAction } from "@/lib/room-commit";
import { validRoomCommand } from "@/lib/room-command";

export const dynamic = "force-dynamic";
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
function database() { if (!env.DB) throw new Error("牌桌服务暂时不可用，请稍后重试"); return env.DB; }
async function hash(token: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map(x => x.toString(16).padStart(2, "0")).join(""); }
async function newPlayer(name: unknown, ready: boolean) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 18) throw new Error("昵称需要 1～18 个字");
  const token = crypto.randomUUID() + crypto.randomUUID();
  const p: Player = { id: crypto.randomUUID(), tokenHash: await hash(token), name: name.trim(), hand: [], ready, out: false, uno: false }; return { token, p };
}
function validCode(value: unknown) { const code = String(value || "").trim().toUpperCase(); if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error("请输入 6 位房间码"); return code; }
async function read(code: string) {
  const row = await database().prepare("SELECT state, version FROM rooms WHERE code = ?").bind(code).first<{ state: string; version: number }>();
  if (!row) return null; return { room: JSON.parse(row.state) as Room, version: row.version };
}
async function seen(code: string) {
  if (env.ROOMS) {
    const result = await env.ROOMS.getByName(code).fetch(`https://room.internal/presence?code=${code}`);
    if (result.ok) return await result.json() as Record<string, number>;
  }
  const { results } = await database().prepare("SELECT player, seen FROM presence WHERE room = ?").bind(code).all<{ player: string; seen: number }>();
  return Object.fromEntries(results.map(row => [row.player, row.seen]));
}
async function publish(code: string) {
  if (env.ROOMS) await env.ROOMS.getByName(code).fetch(`https://room.internal/refresh?code=${code}`, { method: "POST" });
}
async function touch(code: string, player: string) { await database().prepare("INSERT INTO presence (room, player, seen) VALUES (?, ?, ?) ON CONFLICT(room, player) DO UPDATE SET seen = excluded.seen").bind(code, player, Date.now()).run(); }
async function authorized(request: Request, room: Room) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, ""); if (!token || token.length > 200) return null;
  const digest = await hash(token); return room.players.find(p => p.tokenHash === digest && !p.removed) || null;
}
export async function GET(request: Request) {
  try {
    const code = validCode(new URL(request.url).searchParams.get("code")); const row = await read(code);
    if (!row) return response({ error: "没有找到这个房间" }, 404);
    const p = await authorized(request, row.room); if (!p) return response({ error: "座位凭证已失效，请重新加入" }, 401);
    return response(publicView(row.room, p.id, await seen(code), row.version));
  } catch (e) { return response({ error: e instanceof Error ? e.message : "读取牌桌失败" }, 400); }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("Origin"); if (origin && origin !== new URL(request.url).origin) return response({ error: "请求来源无效" }, 403);
    const raw = await request.text(); if (raw.length > 16000) return response({ error: "请求过大" }, 413);
    const a = JSON.parse(raw) as Action;
    if (a.type === "create") {
      const { token, p } = await newPlayer(a.name, true);
      for (let attempt = 0; attempt < 5; attempt++) {
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const bytes = crypto.getRandomValues(new Uint8Array(6)); const code = Array.from(bytes, x => alphabet[x % alphabet.length]).join("");
        const room = createRoom(code, p, (a.config || DEFAULT_CONFIG) as typeof DEFAULT_CONFIG);
        if (a.fillBots === true) applyAction(room, p.id, { type: "addBots", all: true });
        const inserted = await database().prepare("INSERT OR IGNORE INTO rooms (code, state, version, updated_at) VALUES (?, ?, 1, ?)").bind(code, JSON.stringify(room), Date.now()).run();
        if (inserted.meta.changes) { await touch(code, p.id); return response({ token, view: publicView(room, p.id, { [p.id]: Date.now() }, 1) }); }
      } return response({ error: "创建房间繁忙，请重试" }, 503);
    }
    const code = validCode(a.code);
    if(env.ROOMS && !["join","heartbeat"].includes(a.type)) {
      if(a.type!=="tick"&&!validRoomCommand(a))return response({error:"操作凭证无效"},400);
      const result=await env.ROOMS.getByName(code).fetch(`https://room.internal/${a.type==="tick"?"tick":"action"}?code=${code}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:request.headers.get("Authorization")||""},body:JSON.stringify({...a,code})});
      return new Response(result.body,{status:result.status,headers:new Headers(result.headers)});
    }
    const row = await read(code); if (!row) return response({ error: "没有找到这个房间" }, 404);
    const { room, version } = row;
    if (a.type === "join") {
      if (room.status !== "lobby") return response({ error: "这桌已经开始，请等待下一局" }, 400);
      if (room.players.length >= room.config.seats) return response({ error: "房间已满" }, 400);
      const { token, p } = await newPlayer(a.name, false); room.players.push(p); log(room, `${p.name} 加入了牌桌`);
      const saved = await database().prepare("UPDATE rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?").bind(JSON.stringify(room), Date.now(), code, version).run();
      if (!saved.meta.changes) return response({ error: "有人同时加入了房间，请再点一次加入" }, 409);
      await touch(code, p.id); await publish(code); return response({ token, view: publicView(room, p.id, await seen(code), version + 1) });
    }
    const p = await authorized(request, room); if (!p) return response({ error: "座位凭证已失效，请重新加入" }, 401);
    if (a.type === "heartbeat") { await touch(code, p.id); return response({ ok: true }); }
    const timestamps = await seen(code);
    if (a.type === "tick") {
      const progressed = advanceRoom(room), step = progressed ? null : botAction(room);
      if (!progressed && (!step || Date.now() - (room.botAt || 0) < 1100)) return response(publicView(room, p.id, timestamps, version));
      if (step) applyAction(room, step.id, step.action, { hostOffline: false, automated: true }); room.botAt = Date.now();
      const saved = await database().prepare("UPDATE rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?").bind(JSON.stringify(room), Date.now(), code, version).run();
      if (!saved.meta.changes) return response({ ok: true });
      await publish(code); return response(publicView(room, p.id, timestamps, version + 1));
    }
    if (typeof a.actionId !== "string" || a.actionId.length > 100) return response({ error: "操作凭证无效" }, 400);
    const committed = await commitRoomAction(row,p.id,a,current => ({hostOffline:Date.now()-(timestamps[current.host]||0)>45000,offlineIds:current.players.filter(q=>!q.bot&&Date.now()-(timestamps[q.id]||0)>45000).map(q=>q.id)}),{
      read:()=>read(code),
      save:async current => {
        const result=await database().prepare("UPDATE rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?").bind(JSON.stringify(current.room),Date.now(),code,current.version).run();
        return !!result.meta.changes;
      },
    });
    if(committed.conflict==="expired") return response({error:"座位凭证已失效，请重新加入"},401);
    const view=publicView(committed.row.room,p.id,timestamps,committed.row.version);
    if(committed.conflict) return response({error:committed.conflict==="changed"?"回合或手牌已更新，请按当前牌面操作":"正在同步本次操作，请稍后重试",retryable:committed.conflict==="busy",view},409);
    if(committed.committed) await publish(code);
    return response(view);
  } catch (e) { return response({ error: e instanceof Error ? e.message : "操作失败，请重试" }, 400); }
}
