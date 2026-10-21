"use client";

import { useEffect, useRef, useState } from "react";
import type { publicView } from "@/lib/game";
import { readApiResponse } from "@/lib/api-response";
import { LiveActions } from "@/lib/live-actions";

type View = ReturnType<typeof publicView>;
export type Connection = "idle" | "connecting" | "live" | "reconnecting" | "limited" | "offline";

export function useLiveRoom(session: { code: string; token: string } | null, onView: (view: View) => void, onExpired: (message: string) => void) {
  const [connection, setConnection] = useState<Connection>("idle");
  const [latencyMs,setLatencyMs]=useState<number|null>(null);
  const actions=useRef(new LiveActions());
  const callbacks = useRef({ onView, onExpired }); callbacks.current = { onView, onExpired };
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    actions.current.bind(null);setLatencyMs(null);
    if (!session) { setConnection("idle"); return; }
    let active = true, socket: WebSocket | null = null, failures = 0, lastPong = Date.now();
    let pingAt=0,pingSent=false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined, authTimer: ReturnType<typeof setTimeout> | undefined, fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let fallbackRunning = false,lastHeartbeat=0;
    const expire = (message: string) => { if (!active) return; active = false; actions.current.bind(null); callbacks.current.onExpired(message); socket?.close(); };
    const fallback = async () => {
      if (!active || socket?.readyState === WebSocket.OPEN || fallbackRunning) return;
      fallbackRunning = true; let delay = document.hidden ? 25000 : 1800;
      try {
        const response = await fetch(`/api/room?code=${session.code}`, { headers: { Authorization: `Bearer ${session.token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
        const data = await readApiResponse<View & { error?: string }>(response);
        if (!active) return;
        if ([401, 404].includes(response.status)) { expire(data.error || "座位凭证已失效，请重新加入"); return; }
        if (!response.ok) throw new Error();
        callbacks.current.onView(data); setConnection("limited");
        if(data.status==="lobby"&&!document.hidden)delay=3000;
        const g = data.game, pending = g?.pending, actor = pending ? pending.kind === "return" ? pending.target : pending.actor : g?.turn;
        const timed = !data.pause && (data.status === "dealing" || data.status === "resolving" || g?.drawing || g?.knockout || data.players.some(p => p.id === actor && (p.bot || p.autoplay)));
        if (timed && !document.hidden) {
          const tick=await fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ type: "tick", code: session.code }), signal: AbortSignal.timeout(7000) });
          const progressed=await readApiResponse<View>(tick);
          if(active&&tick.ok&&progressed.code===session.code)callbacks.current.onView(progressed);
          delay = 600;
        }
        if(Date.now()-lastHeartbeat>=20000){
          lastHeartbeat=Date.now();
          void fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ type: "heartbeat", code: session.code }), signal: AbortSignal.timeout(7000) }).catch(()=>{});
        }
      } catch { if (active) setConnection(navigator.onLine ? "reconnecting" : "offline"); }
      finally { fallbackRunning = false; if (active && socket?.readyState !== WebSocket.OPEN) fallbackTimer = setTimeout(fallback, delay); }
    };
    const connect = () => {
      if (!active || !navigator.onLine) { if (active) setConnection("offline"); return; }
      clearTimeout(reconnectTimer); clearTimeout(authTimer);
      if (socket && socket.readyState < WebSocket.CLOSING) return;
      setConnection(failures ? "reconnecting" : "connecting");
      const url = new URL("/api/room/live", location.href); url.protocol = location.protocol === "https:" ? "wss:" : "ws:"; url.searchParams.set("code", session.code);
      const current = new WebSocket(url); socket = current;
      let actionSenderBound=false;
      pingAt=0;pingSent=false;actions.current.bind(null);
      authTimer = setTimeout(() => current.close(), 10000);
      current.onopen = () => { if (!active) return current.close(); current.send(JSON.stringify({ type: "auth", token: session.token })); };
      current.onmessage = event => {
        if (!active || current !== socket) return;
        lastPong = Date.now();
        if (event.data === "pong") {if(pingAt){setLatencyMs(Math.max(1,Math.round(performance.now()-pingAt)));pingAt=0;}return;}
        try {
          const data = JSON.parse(event.data);
          if (data.type === "expired") return expire(data.error);
          if(data.type === "ack") {
            actions.current.receive(data);
            if(data.view?.code===session.code)callbacks.current.onView(data.view);
            return;
          }
          if (data.type === "view" && data.view?.code === session.code) {
            failures = 0; clearTimeout(authTimer); clearTimeout(fallbackTimer); setConnection("live"); callbacks.current.onView(data.view);
            if(data.protocol>=2&&!actionSenderBound){actions.current.bind(frame=>{if(current!==socket||current.readyState!==WebSocket.OPEN)throw new Error("Socket unavailable");current.send(frame);});actionSenderBound=true;}
            if(!pingSent){pingSent=true;pingAt=performance.now();current.send("ping");}
          }
        } catch { /* malformed frames never replace a valid hand */ }
      };
      current.onclose = () => {
        if (!active || socket !== current) return;
        actions.current.bind(null);setLatencyMs(null);
        clearTimeout(authTimer); failures++; setConnection(navigator.onLine ? "reconnecting" : "offline");
        if (failures >= 2) { clearTimeout(fallbackTimer); fallbackTimer = setTimeout(fallback, 0); }
        reconnectTimer = setTimeout(connect, Math.min(12000, 700 * 2 ** Math.min(failures - 1, 5)) + Math.random() * 300);
      };
      current.onerror = () => { current.close(); };
    };
    const refresh = () => {
      if (!active || document.hidden) return;
      if (socket?.readyState === WebSocket.OPEN) { lastPong = Date.now(); socket.send(JSON.stringify({ type: "resync" })); }
      else { failures = 0; connect(); }
    };
    const offline = () => { actions.current.bind(null);setLatencyMs(null);setConnection("offline"); socket?.close(); };
    retry.current = refresh;
    window.addEventListener("online", refresh); window.addEventListener("offline", offline); window.addEventListener("pageshow", refresh); document.addEventListener("visibilitychange", refresh);
    const heartbeat = setInterval(() => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      if (!document.hidden && Date.now() - lastPong > 45000) { socket.close(); return; }
      pingAt=performance.now();socket.send("ping");
    }, 20000);
    connect();
    return () => { active = false; actions.current.bind(null);clearTimeout(reconnectTimer); clearTimeout(authTimer); clearTimeout(fallbackTimer); clearInterval(heartbeat); socket?.close(1000); window.removeEventListener("online", refresh); window.removeEventListener("offline", offline); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [session?.code, session?.token]);
  return { connection, latencyMs, reconnect: () => retry.current(), sendAction:<T,>(payload:Record<string,unknown>)=>actions.current.send<T>(payload) };
}
