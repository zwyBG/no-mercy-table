"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { LATENCY_INTERVAL, latencyQuality } from "@/lib/latency";
import type { Connection } from "./use-live-room";

export function ServerLatency({ inRoom, connection, latencyMs }: { inRoom: boolean; connection: Connection; latencyMs: number | null }) {
  const [home, setHome] = useState<{ ms: number | null; state: "checking" | "live" | "offline" | "timeout" }>({ ms: null, state: "checking" });
  useEffect(() => {
    if (inRoom) return;
    let active = true, running = false, generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | null = null;
    const check = async () => {
      clearTimeout(timer);
      if (!active || running || document.hidden) return;
      if (!navigator.onLine) { setHome({ms:null,state:"offline"}); return; }
      running = true; const current = ++generation, request = new AbortController(); controller = request;
      const timeout = setTimeout(() => request.abort(), LATENCY_INTERVAL.timeout), started = performance.now();
      try {
        const response = await fetch("/api/ping", { cache: "no-store", credentials: "omit", signal: request.signal });
        if (response.status !== 204) throw new Error("Ping unavailable");
        if (active && current === generation) setHome({ms:Math.max(1,Math.round(performance.now()-started)),state:"live"});
      } catch {
        if (active && current === generation && !document.hidden) setHome({ms:null,state:navigator.onLine?"timeout":"offline"});
      } finally {
        clearTimeout(timeout); running = false;
        if (controller === request) controller = null;
        if (active && !document.hidden) timer = setTimeout(check, current === generation ? LATENCY_INTERVAL.home : 0);
      }
    };
    const refresh = () => {
      clearTimeout(timer);
      if (document.hidden || !navigator.onLine) { generation++; controller?.abort(); setHome({ms:null,state:navigator.onLine?"checking":"offline"}); return; }
      setHome({ms:null,state:"checking"}); void check();
    };
    document.addEventListener("visibilitychange", refresh); window.addEventListener("online", refresh); window.addEventListener("offline", refresh);
    refresh();
    return () => { active = false; generation++; clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); };
  }, [inRoom]);
  const connected = connection === "live" || connection === "limited";
  const ms = inRoom ? connected ? latencyMs : null : home.ms;
  const offline = inRoom ? connection === "offline" : home.state === "offline";
  const waiting = offline ? "离线" : inRoom && !connected ? "重连中" : !inRoom && home.state === "timeout" ? "检测超时" : "检测中";
  const title = inRoom ? connection === "limited" ? "兼容连接的同步请求往返耗时，包含服务器同步处理时间；复用现有请求，不增加检测请求。" : "与牌桌服务器的往返延迟（RTT），不包含出牌处理时间。前台每 10 秒检测；后台每 60 秒，复用现有 WebSocket，不读取数据库。" : "与服务器的往返延迟。首页每 30 秒发送一个无响应正文、无数据库操作的轻量请求；切到后台时暂停。";
  return <span className="server-latency" aria-label="服务器延迟" title={title} data-quality={offline?"offline":latencyQuality(ms)}><Activity size={12} /><span>服务器</span><strong>{ms === null ? waiting : ms}</strong>{ms !== null && <small>ms</small>}{inRoom && connection === "limited" && <em>兼容</em>}</span>;
}
