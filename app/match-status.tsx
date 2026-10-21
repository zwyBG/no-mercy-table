"use client";

import { Bot, ChevronRight, Eye, MoreHorizontal, Pause, Play, RefreshCw, UserRoundX, Wifi } from "lucide-react";
import { COLOR_NAMES, type publicView } from "@/lib/game";
import type { Connection } from "./use-live-room";

type View = ReturnType<typeof publicView>;
export function MatchStatus({ view, connection, latencyMs, busy, turnText, onAction, onReconnect, onKick }: { view: View; connection: Connection; latencyMs?:number|null; busy: boolean; turnText: string; onAction: (action: Record<string, unknown>) => unknown; onReconnect: () => void; onKick: (id:string) => void }) {
  const g = view.game, me = view.players.find(p => p.id === view.me), host = view.host === view.me;
  const connected = connection === "live" || connection === "limited";
  const current = view.players.find(p => p.id === g?.turn), ownTurn = !view.spectating && view.status === "playing" && g?.turn === view.me && !g.pending && !g.drawing && !g.knockout && !view.pause && !me?.autoplay;
  const offline = view.players.filter(p => !p.bot && !p.out && !p.finished && !p.removed && !p.online && p.id !== view.me);
  const lastPlay = [...view.logs].reverse().find(e => e.text.includes(" 出了"));
  return <div className="match-status-wrap">
    {!connected && <div className="reconnect-banner" role="status"><Wifi size={16} /><span><strong>{connection === "offline" ? "网络已断开" : "正在重连牌桌"}</strong> · 你的座位和手牌已保留</span><button onClick={onReconnect} aria-label="立即重连"><RefreshCw size={14} />重试</button></div>}
    <div className={`match-status ${ownTurn ? "match-your-turn" : ""} ${view.pause ? "match-paused" : ""}`}>
      <div className="match-turn" role="status" aria-live="polite"><span className="turn-indicator" /><div><small>{view.pause ? "TABLE PAUSED" : view.spectating ? "SPECTATING" : ownTurn ? "YOUR TURN" : "ON THE TABLE"}</small><strong>{view.pause ? "牌局已暂停" : turnText || "本局结算中"}</strong></div></div>
      <div className="match-controls">
        {host && view.status !== "finished" && <button className="match-control" disabled={busy || !connected} onClick={() => onAction({ type: "pause", paused: !view.pause })} aria-label={view.pause ? "恢复牌局" : "暂停牌局"}>{view.pause ? <Play size={15} /> : <Pause size={15} />}<span>{view.pause ? "继续" : "暂停"}</span></button>}
        <details className="match-menu"><summary aria-label="牌局管理"><MoreHorizontal size={19} /></summary><div className="match-menu-panel">
          {!view.spectating && view.status !== "finished" && <button disabled={busy || !connected} onClick={() => onAction({ type: "autoplay", enabled: !me?.autoplay })}><Bot size={16} />{me?.autoplay ? "接管自己的手牌" : "暂时离开，开启托管"}</button>}
          {!host && view.players.some(p => p.id === view.host && !p.online && Date.now() - p.lastSeen > 45000) && <button disabled={busy} onClick={() => onAction({ type: "claimHost" })}>接管离线房主</button>}
          <p>断线保留座位，可在此管理牌局。</p>
          {offline.map(p => <div className="offline-seat" key={p.id}><span>{p.name} · 等待重连</span>{host && !p.autoplay && Date.now() - p.lastSeen > 45000 && <button disabled={busy} onClick={() => onAction({ type: "autoplay", target: p.id, enabled: true })}>启用托管</button>}</div>)}
          {host && <div className="host-kick-list"><small>房主 · 管理玩家</small>{view.players.filter(p => p.id !== view.me && !p.removed).map(p => <div key={p.id}><span>{p.name}</span><button disabled={busy || !connected} aria-label={`移出 ${p.name}`} onClick={() => onKick(p.id)}><UserRoundX size={13} />移出</button></div>)}</div>}
        </div></details>
      </div>
      <div className="match-context"><span className={`match-color match-color-${g?.color}`}><i />{COLOR_NAMES[g?.color || "red"]}色</span><span>{g?.direction === -1 ? "↺ 逆时针" : "↻ 顺时针"}</span>{view.spectating && <span className="spectating-context"><Eye size={12} />观战 · 可查看剩余手牌</span>}<span className={`live-status live-${connection}`}><i />{connection === "live" ? "实时连接" : connection === "limited" ? "兼容连接" : "重连中"}{connection === "live" && latencyMs != null && <small className="connection-latency" data-slow={latencyMs > 350} title="实时连接往返延迟，不包含出牌处理时间">{latencyMs} ms</small>}</span></div>
    </div>
    {!!g?.penalty && <div className="pressure-track" aria-label="罚抽叠加过程"><div className="pressure-chain">{g.penaltyChain.map((step, index) => <span className="pressure-step" key={index}>{index > 0 && <ChevronRight size={12} />}<span title={`${view.players.find(p => p.id === step.player)?.name} 出的 +${step.value}`} className={`chain-card chain-${step.color}`}>+{step.value}</span></span>)}</div><div className="pressure-total"><small>累计罚抽</small><strong>+{g.penalty}</strong></div><span className="pressure-target">{g.drawing ? "正在逐张抽取" : `${current?.id === view.me ? "由你" : current?.name || "下一位"}接牌`}</span></div>}
    <div className="last-action">{view.pause ? "房主恢复后，发牌与动画从暂停处继续" : lastPlay?.text || "每一张牌，都可能改变局势。"}{offline.length > 0 && <span>{offline.length} 人等待重连 · 座位保留</span>}</div>
  </div>;
}
