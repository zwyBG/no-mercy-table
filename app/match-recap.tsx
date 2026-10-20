"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Crown, Pause, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { COLOR_NAMES, cardLabel, type Card, type publicView } from "@/lib/game";
import { keyReplayFrames, type ReplayFrame } from "@/lib/match-history";

type View = ReturnType<typeof publicView>;
export function MatchRecap({ view, busy, onReset, onLeave, renderCard }: { view: View; busy: boolean; onReset: () => void; onLeave: () => void; renderCard: (card: Card) => ReactNode }) {
  const h = view.game?.recap, winner = view.players.find(p => p.id === view.game?.winner), loser = view.players.find(p => p.id === view.game?.loser), host = view.host === view.me;
  const placements = view.game?.placements || [];
  const ranking = [...placements].sort((a,b) => (a.rank || 99) - (b.rank || 99));
  const [replay, setReplay] = useState(false), [keyOnly, setKeyOnly] = useState(true), [index, setIndex] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [progress, setProgress] = useState(1);
  const progressRef = useRef(1); progressRef.current = progress;
  const all = useMemo(() => {
    const frames = [...(h?.events || []), h?.maxPenalty?.event, h?.keyExchange?.event, h?.lastPlay].filter((e): e is ReplayFrame => !!e);
    return [...new Map(frames.map(e => [e.id, e])).values()].sort((a, b) => a.id - b.id);
  }, [h]);
  const frames = useMemo(() => keyOnly ? keyReplayFrames(all) : all, [all, keyOnly]);
  const frame = frames[Math.min(index, frames.length - 1)];
  const person = (id?: string) => view.players.find(p => p.id === id)?.name || "玩家";
  const select = (at: number) => { setPlaying(false); setIndex(Math.max(0, Math.min(frames.length - 1, at))); setProgress(1); };
  const openAt = (event?: ReplayFrame) => { setReplay(true); setPlaying(false); setKeyOnly(true); setIndex(event ? Math.max(0, keyReplayFrames(all).findIndex(e => e.id === event.id)) : 0); setProgress(1); };
  useEffect(() => {
    if (!playing || !replay) return;
    const start = performance.now(), base = progressRef.current;
    const tick = setInterval(() => {
      const p = Math.min(1, base + (performance.now() - start) / (2200 / speed)); setProgress(p);
      if (p >= 1) { clearInterval(tick); if (index < frames.length - 1) { setIndex(index + 1); setProgress(0); progressRef.current = 0; } else setPlaying(false); }
    }, 40);
    return () => clearInterval(tick);
  }, [playing, replay, index, speed, frames.length]);
  const max = h?.maxPenalty, swap = h?.keyExchange?.event, last = h?.lastPlay;
  return <div className="recap-content">
    {!replay ? <>
      <div className="recap-hero"><span className="recap-kicker">ROUND {String(view.game?.round || 1).padStart(2, "0")} · THE AFTERMATH</span><span className="recap-crown"><Crown size={29} /></span><h3>{winner ? winner.id === view.me ? "你率先出完，拿下第 1 名。" : `${winner.name} 率先出完，第 1 名。` : "本局排位已落定。"}</h3><p>{h?.reason || view.game?.resolution || "最后一张效果已经结清。"}</p><div className="recap-meta"><span>{h?.plays || 0} 次出牌</span><i /><span>{h ? `${Math.max(1, Math.round(((h.endedAt || Date.now()) - h.startedAt) / 60000))} 分钟` : "本局结束"}</span><i /><span>{view.players.length} 人围桌</span></div></div>
      {loser && <div className="last-place-banner"><strong>{loser.id === view.me ? "你" : loser.name}是本局最后一名。</strong><br />{loser.id === view.me ? "这局最失败的那个，是你！下局翻盘。" : "这局最失败的那个，终于找到了！"}</div>}
      {!!ranking.length && <div className="ranking-list"><h4>本局名次与积分 · 同一牌桌累计保留</h4>{ranking.map(p => <div className={`ranking-row ${p.kind === "last" || p.player === view.game?.loser ? "last-rank" : ""}`} key={p.player}><b>{p.kind === "last" ? "最后一名" : p.rank ? `第 ${p.rank} 名` : "已淘汰"}</b><span>{person(p.player)}{p.player === view.me ? " · 你" : ""}<small>{p.kind === "finished" ? "手牌清空" : p.kind === "last" ? `剩余 ${p.count} 张` : view.players.find(q => q.id === p.player)?.withdrawn ? "退出本局" : `${p.count} 张时出局`}</small></span><div className="ranking-points" data-negative={(p.scoreDelta || 0) < 0}><strong>{p.scoreDelta === undefined ? "—" : `${p.scoreDelta > 0 ? "+" : ""}${p.scoreDelta}`}</strong><small>累计 {p.scoreTotal ?? view.players.find(q => q.id === p.player)?.score ?? 0} 分</small></div></div>)}<p className="score-rule-hint">出完手牌按先后排名；其余出局者越晚离场名次越高；最后留在场上的人为最后一名。下一局由上局第一名先出牌。</p></div>}
      <div className="recap-highlights">
        <button className="recap-highlight recap-hit" disabled={!max} onClick={() => openAt(max?.event)}><small>本局最大罚抽</small><strong>{max ? `+${max.total}` : "0"}<em> 张</em></strong><p>{max ? max.chain.map(s => `+${s.value}`).join(" → ") : "这局没有叠加罚抽"}</p><span>{max?.target ? `${person(max.target)} 实际抽了 ${max.drawn} 张${max.knockedOut ? "，达到 25 张淘汰" : ""}` : max ? "本局最强的一条加牌链" : "风平浪静，也是一种运气"}</span>{max && <b>回看这一击 ↗</b>}</button>
        <button className="recap-highlight recap-exchange" disabled={!swap} onClick={() => openAt(swap)}><small>关键换牌</small><strong>{swap?.kind === "swap" ? `${swap.amount} ↔ ${swap.drawn}` : swap ? "1 张" : "—"}</strong><p>{swap ? `${person(swap.actor)} × ${person(swap.target)}` : "这局没有发生换牌"}</p><span>{swap?.kind === "swap" ? `${person(swap.actor)} ${Number(swap.amount) > Number(swap.drawn) ? "少了" : "多了"} ${h?.keyExchange?.swing} 张手牌` : swap ? "一张未知的牌，也能改变局势" : "每个人守住了自己的手牌"}</span>{swap && <b>回看这次交换 ↗</b>}</button>
        <button className="recap-highlight recap-last" disabled={!last} onClick={() => openAt(last)}><small>最后一击</small><strong>{last?.card ? cardLabel({ ...last.card, id: "public-play" }) : "落定"}</strong><p>{last ? `由 ${person(last.actor)} 打出` : "其余对手离场，本局结束"}</p><span>{last?.penalty ? `将累计罚抽推到 ${last.penalty} 张` : "回看最后几步，看看胜负如何落定"}</span>{last && <b>回看最后一击 ↗</b>}</button>
      </div>
      {h?.partial && <p className="recap-footnote">本局在更新前已经开始，统计与回放从更新后的操作开始记录。</p>}
      <button className="outline-button full recap-replay-button" disabled={!frames.length} onClick={() => openAt()}><Play size={16} />回看关键回合<span>{keyReplayFrames(all).length} 个公开节点</span></button>
    </> : <div className="replay-content">
      <div className="replay-heading"><button className="quiet-button" onClick={() => { setReplay(false); setPlaying(false); }}><ArrowLeft size={15} />返回本局战报</button><span>公开过程回放</span></div>
      <div className="replay-filter"><button aria-pressed={keyOnly} onClick={() => { setKeyOnly(true); select(0); }}>关键回合</button><button aria-pressed={!keyOnly} onClick={() => { setKeyOnly(false); select(0); }}>已记录的全部出牌</button><span>不展示任何人的暗牌</span></div>
      {frame && <>
        <div key={frame.id} className={`replay-stage replay-${frame.kind}`} data-playing={playing}>
          <svg viewBox="0 0 100 100" aria-hidden="true"><polygon points={view.players.map((_, i) => `${50 + Math.cos(Math.PI / 2 + i * Math.PI * 2 / view.players.length) * 36},${50 + Math.sin(Math.PI / 2 + i * Math.PI * 2 / view.players.length) * 36}`).join(" ")} /></svg>
          {view.players.map((p, i) => {
            const after = frame.counts.find(s => s.id === p.id), before = frame.before?.find(s => s.id === p.id), count = Math.round((before?.count ?? after?.count ?? 0) + ((after?.count || 0) - (before?.count ?? after?.count ?? 0)) * progress);
            return <div key={p.id} className={`replay-seat ${p.id === frame.actor ? "replay-actor" : ""} ${p.id === frame.target ? "replay-target" : ""} ${after?.out && progress === 1 ? "replay-out" : ""}`} style={{ left: `${50 + Math.cos(Math.PI / 2 + i * Math.PI * 2 / view.players.length) * 36}%`, top: `${50 + Math.sin(Math.PI / 2 + i * Math.PI * 2 / view.players.length) * 36}%` } as CSSProperties}><span className={`avatar-${i}`}>{p.name.slice(0, 1)}</span><strong>{p.name}</strong><b>{after?.out && progress === 1 ? "已淘汰" : after?.finished && progress === 1 ? `第 ${after.rank} 名` : `${count} 张`}</b></div>;
          })}
          <div className="replay-center">{frame.card ? renderCard({ ...frame.card, id: "replay-public-card" }) : <span className="replay-glyph">{frame.kind === "swap" ? "⇄" : frame.kind === "trade" ? "↔" : frame.kind === "rotation" ? "↻" : frame.kind === "finish" ? <Crown size={38} /> : frame.kind === "knockout" ? "OUT" : frame.kind === "penalty" || frame.kind === "draw" ? `+${frame.drawn || frame.amount || 0}` : <Sparkles size={35} />}</span>}<span className={`replay-color match-color-${frame.color}`}><i />{COLOR_NAMES[frame.color]}色 · {frame.direction === 1 ? "↻" : "↺"}</span></div>
          {(frame.kind === "swap" || frame.kind === "trade") && <div className="replay-exchange-trail">{person(frame.actor)} <span>⇄</span> {person(frame.target)}</div>}
        </div>
        <div className="replay-narration" aria-live="polite"><small>{index + 1} / {frames.length}</small><strong>{frame.text}</strong>{!!frame.chain?.length && <p>{frame.chain.map(s => `+${s.value}`).join(" → ")} = {frame.amount || frame.penalty} 张</p>}</div>
        <input className="replay-scrubber" aria-label="回放进度" type="range" min={0} max={Math.max(0, frames.length - 1)} value={Math.max(0, index)} onChange={e => select(Number(e.target.value))} />
        <div className="replay-controls"><button className="outline-button" aria-label="上一个回合" disabled={index <= 0} onClick={() => select(index - 1)}><ArrowLeft size={16} /></button><button className="primary-button" onClick={() => { if (!playing && progress >= 1) { if (index === frames.length - 1) setIndex(0); setProgress(0); progressRef.current = 0; } setPlaying(!playing); }}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "暂停回放" : "播放回放"}</button><button className="outline-button" aria-label="下一个回合" disabled={index >= frames.length - 1} onClick={() => select(index + 1)}><ArrowRight size={16} /></button><button className="quiet-button replay-speed" aria-label="回放速度" onClick={() => setSpeed(speed === 1 ? 2 : 1)}>{speed}×</button></div>
      </>}
      {!!h?.trimmed && <p className="recap-footnote">保留最近 200 个公开节点及精选关键事件；更早的 {h.trimmed} 个节点已省略，统计仍保留。</p>}
    </div>}
    <div className="recap-actions"><button className="primary-button" disabled={!host || busy} onClick={onReset}><RotateCcw size={16} />{host ? "回到大厅，再来一局" : "等待房主开始下一局"}</button><button className="quiet-button" onClick={onLeave}><X size={15} />离开牌桌</button></div>
  </div>;
}
