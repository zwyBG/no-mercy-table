"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, Copy, Crown, Eye, FastForward, Layers, LayoutGrid, Link2, LoaderCircle, LogOut, Plus, Radio, RotateCcw, Settings2, Shuffle, Sparkles, Users, Wifi, X } from "lucide-react";
import { DEFAULT_CONFIG, COLORS, COLOR_NAMES, LABELS, cardLabel, publicView, arrangeHand, type Card, type Config, type Color } from "@/lib/game";

import { ActionEffect, SoundSwitch, useTableEffects } from "./effects";
import { isConnectionError, readApiResponse, requestErrorMessage } from "@/lib/api-response";
import { postRoomAction } from "@/lib/room-request";
import { HiddenHand } from "./hidden-hand";
import { OwnHand } from "./own-hand";
import { HandTray } from "./hand-tray";
import { SpectatorHands } from "./spectator-hands";
import { TransferEffect, CardDeliveries } from "./transfers";
import { MatchRecap } from "./match-recap";
import { ADVANCING_ACTIONS } from "@/lib/presentation";
import { FeedbackButton } from "./feedback-button";
import { useLiveRoom } from "./use-live-room";
import { SocialAnimation, SocialPicker, useSocialEffects } from "./social";
import { MatchStatus } from "./match-status";
import { reconcileHandOrder } from "@/lib/hand-order";
import { scoreForPlace } from "@/lib/room-scores";
import { HandSync } from "@/lib/hand-sync";
import { JumpInPrompt } from "./jump-in-prompt";
import { canAcceptRoomView } from "@/lib/room-view";

type View = ReturnType<typeof publicView>;
type ApiData = View & { view: View; token?: string; error?: string; retryable?: boolean };
type Session = { code: string; token: string };
const RELEASE = "2026.10.21.2";
const SHAPES = ["三角形", "正方形", "正五边形", "正六边形"];
function Modal({ children, close, label, wide = false }: { children: ReactNode; close?: () => void; label: string; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; el?.showModal(); el?.querySelector<HTMLElement>("h2")?.focus({preventScroll:true}); if(el) el.scrollTop=0; return () => el?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} aria-label={label} onCancel={e => { e.preventDefault(); close?.(); }}><div className="modal-head"><h2 tabIndex={-1}>{label}</h2>{close && <button className="icon-button" onClick={close} aria-label="关闭"><X size={20} /></button>}</div>{children}</dialog>;
}
function PlayingCard({ card, back = false, small = false }: { card?: Card; back?: boolean; small?: boolean }) {
  const value = card?.kind === "number" ? String(card.number) : card?.kind === "reverse4" ? "+4" : card?.kind === "roulette" ? "?" : card?.kind === "reverse" ? "⇄" : card?.kind === "skip" ? "⊘" : card?.kind === "skipall" ? "↻" : card?.kind === "discard" ? "≋" : LABELS[card?.kind || ""];
  return <span className={`playing-card ${back ? "card-back" : `card-${card?.color}`} ${small ? "card-small" : ""}`} aria-hidden="true">{back ? <><span className="back-line" /><strong>NO<br />MERCY</strong><span className="back-corner">●</span></> : <><span className="card-corner">{value}</span><span className="card-oval"><strong>{value}</strong></span><span className="card-bottom">{value}</span>{card?.kind !== "number" && <span className="card-caption">{LABELS[card?.kind || ""]}</span>}</>}</span>;
}
export default function Table() {
  const [hydrated, setHydrated] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG), [view, setView] = useState<View | null>(null), [session, setSession] = useState<Session | null>(null);
  const effects = useTableEffects(view);
  const social = useSocialEffects(view, effects.playSocial);
  const [socialTarget, setSocialTarget] = useState<string | null>(null);
  useEffect(() => setSocialTarget(null), [view?.code, view?.status]);
  useEffect(() => {
    const kind = effects.visual?.kind;
    if (!kind || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !["draw2", "draw4", "reverse4", "draw6", "draw10", "out", "win"].includes(kind)) return;
    const strength = (kind === "draw10" ? 18 : kind === "draw6" || kind === "out" ? 12 : 8) * effects.shake * (effects.visual?.cue && effects.visual.cue.total >= 16 ? 1.2 : 1);
    if (!strength) return;
    const frames = [[0,0],[1,-.5],[-.9,.7],[.8,-.8],[-.65,.45],[.5,-.35],[-.3,.25],[.15,-.1],[0,0]].map(([x,y]) => ({ transform: `translate(${x * strength}px, ${y * strength}px)` }));
    const animations = [...document.querySelectorAll<HTMLElement>("main, .topbar")].map(el => el.animate(frames, { duration: kind === "draw10" ? 560 : 420, easing: "ease-out" }));
    return () => animations.forEach(a => a.cancel());
  }, [effects.visual?.id, effects.shake]);
  const [name, setName] = useState(""), [joinCode, setJoinCode] = useState(""), [joinOpen, setJoinOpen] = useState(false), [rulesOpen, setRulesOpen] = useState(false), [settingsOpen, setSettingsOpen] = useState(false), [effectsOpen, setEffectsOpen] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [selected, setSelected] = useState<string | null>(null), [wild, setWild] = useState<(Card & { intent: { type: "play" | "jump"; top?: string } }) | null>(null), [uno, setUno] = useState(false), [leaveOpen, setLeaveOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [handOrder, setHandOrder] = useState<string[]>([]), [handLayout, setHandLayout] = useState<"flat" | "overlap">("flat");
  const [transferSnapshot, setTransferSnapshot] = useState<{ id: string; cards: Card[]; offset: number; known: boolean } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null), viewReceivedAt = useRef(Date.now());
  const viewRef = useRef(view), sessionRef = useRef(session), busyRef = useRef(false), orderRef = useRef<string[]>([]);
  const sortSender=useRef<(order:string[])=>Promise<void>>(async()=>{}),sortSync=useRef<HandSync|null>(null);
  if(!sortSync.current)sortSync.current=new HandSync(order=>sortSender.current(order));
  useEffect(()=>{sortSync.current?.reset();},[view?.code,view?.game?.round,view?.me]);
  useEffect(()=>()=>sortSync.current?.reset(),[]);
  viewRef.current = view; sessionRef.current = session;
  const accept = (next: View, sourceToken?: string) => { if (canAcceptRoomView(viewRef.current,next,sessionRef.current,sourceToken)) { const transfer = next.game?.transfer; if (transfer && transfer.id !== viewRef.current?.game?.transfer?.id && (transfer.from === next.me || transfer.to === next.me)) setTransferSnapshot({ id: transfer.id, cards: viewRef.current?.code === next.code ? [...viewRef.current.hand] : [], offset: transfer.duration - transfer.remainingMs, known: viewRef.current?.code === next.code }); viewReceivedAt.current = Date.now(); viewRef.current = next; setView(next); setConfig(next.config); } };
  useEffect(() => {
    setHydrated(true);
    setHandLayout(localStorage.getItem("mercy-hand-layout") === "overlap" ? "overlap" : "flat");
    const requested = new URLSearchParams(window.location.search).get("room")?.toUpperCase();
    setName(localStorage.getItem("mercy-name") || "");
    const code = requested || localStorage.getItem("mercy-last-room");
    if (code) { const token = localStorage.getItem(`mercy-seat-${code}`); if (token) setSession({ code, token }); else if (requested) { setJoinCode(code); setJoinOpen(true); } }
    try { const saved = localStorage.getItem("mercy-config"); if (saved) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) }); } catch { /* use defaults */ }
  }, []);
  const live = useLiveRoom(session, accept, (message, sourceToken) => {
    if (sourceToken !== sessionRef.current?.token) return;
    if (session) { localStorage.removeItem(`mercy-seat-${session.code}`); localStorage.removeItem("mercy-last-room"); }
    sessionRef.current = null; viewRef.current = null; setSession(null); setView(null); setError(message);
  });
  const online = !session || live.connection === "live" || live.connection === "limited";
  useEffect(() => {
    if (!view?.code || !view.me) return;
    localStorage.setItem("mercy-last-room", view.code);
    const seatedName = view.players.find(p => p.id === view.me)?.name;
    if (seatedName) { localStorage.setItem("mercy-name", seatedName); setName(seatedName); }
  }, [view?.code, view?.me]);
  useEffect(() => {
    if (!view) return;
    const ids = reconcileHandOrder(orderRef.current, view.hand.map(c => c.id)); setHandOrder(ids); orderRef.current = ids;
    if (selected && !ids.includes(selected)) setSelected(null);
    if (wild && !ids.includes(wild.id)) setWild(null);
  }, [view?.version, view?.me]);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(t); } }, [notice]);
  useEffect(() => { if (error) { const t = setTimeout(() => setError(""), 6500); return () => clearTimeout(t); } }, [error]);
  const animationPlaying = deliveryBusy || effects.pendingCount > 0;
  const submit = async (action: Record<string, unknown>, background=false) => {
    if(!background){if(busyRef.current)return false;busyRef.current=true;setBusy(true);sortSync.current?.hold(true);setError("");}
    if (ADVANCING_ACTIONS.has(String(action.type)) || action.type === "social") effects.skip();
    try {
      const s = sessionRef.current, v = viewRef.current;
      const payload = { code: s?.code, version: v?.version, actionKey: v?.actionKey, actionId: crypto.randomUUID(), ...action };
      let data: ApiData = {} as ApiData;
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await postRoomAction<ApiData>(payload, s?.token, () => { if(!background)setNotice("连接较慢，正在确认操作结果并重新同步…"); live.reconnect(); },fetch,live.sendAction<ApiData>);
        if(s && (sessionRef.current?.code!==s.code || sessionRef.current?.token!==s.token))return false;
        const res = result.response; data = result.data;
        if (res.status === 409 && data.retryable !== false && attempt < 2 && s) {
          const latest = data.view || await readApiResponse<View>(await fetch(`/api/room?code=${s.code}`, { headers: { Authorization: `Bearer ${s.token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) }));
          if (latest.code) { accept(latest); payload.version = latest.version; continue; }
        }
        if (!res.ok) { if (data.view) accept(data.view); throw new Error(data.error || "操作失败"); }
        break;
      }
      if (data.token) {
        const next = { code: data.view.code, token: data.token }; localStorage.setItem(`mercy-seat-${next.code}`, next.token); localStorage.setItem("mercy-last-room", next.code); localStorage.setItem("mercy-name", data.view.players.find(p => p.id === data.view.me)?.name || name.trim()); sessionRef.current = next; setSession(next); accept(data.view); setJoinOpen(false); window.history.replaceState(null, "", `?room=${next.code}`);
      } else accept(data);
      return true;
    } catch (e) { if (isConnectionError(e) && sessionRef.current) live.reconnect(); if(!background)setError(requestErrorMessage(e, !!sessionRef.current)); return false; }
    finally {
      if(!background){busyRef.current=false;setBusy(false);sortSync.current?.hold(false);}
    }
  };
  sortSender.current=async order=>{
    const scope=viewRef.current;
    for(let attempt=0;attempt<2;attempt++){
      const latest=viewRef.current;
      if(!latest||latest.code!==scope?.code||latest.game?.round!==scope.game?.round||latest.spectating||!["playing","dealing"].includes(latest.status))return;
      if(await submit({type:"sort",order:reconcileHandOrder(attempt?orderRef.current:order,latest.hand.map(c=>c.id))},true))return;
    }
    setNotice("手牌顺序暂未同步，再次理牌时会重试");
  };
  const act = async (action:Record<string,unknown>)=>{
    if(action.type==="sort"&&Array.isArray(action.order)){sortSync.current?.update(action.order.map(String));return true;}
    return submit(action);
  };
  const updateConfig = async (patch: Partial<Config>) => {
    const next = { ...config, ...patch }; if (next.firstSeat >= next.seats) next.firstSeat = -1;
    if (!view) { setConfig(next); localStorage.setItem("mercy-config", JSON.stringify(next)); } else await act({ type: "config", config: next });
  };
  const create = (fillBots = false) => { const nick = name.trim() || (fillBots ? "测试玩家" : ""); if (!nick) { setError("先给自己取个昵称"); document.getElementById("nickname")?.focus(); return; } if (!name.trim()) setName(nick); act({ type: "create", name: nick, config, fillBots }); };
  const share = async (link = true) => { try { await navigator.clipboard.writeText(link ? `${location.origin}/?room=${view!.code}` : view!.code); setNotice(link ? "邀请链接已复制，发给朋友就能加入" : "房间码已复制"); } catch { setNotice(`房间码：${view?.code}`); } };
  const hand = handOrder.map(id => view?.hand.find(c => c.id === id)).filter((c): c is Card => !!c);
  const me = view?.players.find(p => p.id === view.me), game = view?.game, host = !view || view.host === view.me, lobby = !view || view.status === "lobby", playing = view?.status === "playing", dealing = view?.status === "dealing", mine = online && !view?.pause && !me?.autoplay && playing && game?.turn === view?.me && !game?.pending && !game?.drawing && !game?.knockout && !view?.spectating;
  const jumpIds = online ? game?.jump?.cards || [] : [];
  const jumpCard = hand.find(c => c.id === selected && jumpIds.includes(c.id)) || hand.find(c => jumpIds.includes(c.id));
  const selectedJump = !!selected && jumpIds.includes(selected);
  const watching = !!view?.spectating && game?.knockout?.player !== view?.me;
  const watchLabel = watching ? me?.finished ? `第 ${me.rank} 名 · 观战中` : me?.withdrawn ? "已退出本局 · 观战中" : me?.out ? "已淘汰 · 观战中" : "本局已结束" : undefined;
  const transfer = game?.transfer;
  const involved = !!transfer && (transfer.from === view?.me || transfer.to === view?.me);
  const shownHand = hand;
  const handMotion = involved && transferSnapshot?.known ? "exchange-spread" : "";
  const incomingCards = involved && transferSnapshot?.id === transfer?.id ? hand.filter(c => !transferSnapshot.cards.some(old => old.id === c.id)).map(c => c.id) : [];
  const shownCount = (p: NonNullable<typeof view>["players"][number]) => p.count;
  const current = view?.players.find(p => p.id === game?.turn), pending = game?.pending;
  const sevenRuleLabel = config.seven === "choice" ? "出 7 时自选" : config.seven === "swap" ? "整手交换" : "互抽一张";
  const activeSeven = pending?.sevenMode || (config.seven === "swap" ? "swap" : "trade");
  const pendingMine = pending && online && !view?.pause && !me?.autoplay && !view?.spectating && (pending.kind === "return" ? pending.target === view?.me : pending.actor === view?.me);
  const rouletteMine = online && !view?.pause && !me?.autoplay && !view?.spectating && playing && pending?.kind === "roulette" && pending.actor === view?.me && !!pending.color && !game?.knockout;
  const dealSpot = spotsForDeal();
  function spotsForDeal() { const index = view?.players.findIndex(p => p.id === game?.deal?.lastPlayer) ?? -1; const offset = view ? Math.max(0, view.players.findIndex(p => p.id === view.me)) : 0; const i = (index - offset + config.seats) % config.seats; const angle = (config.seats === 4 ? Math.PI / 4 : Math.PI / 2) + i * Math.PI * 2 / config.seats; return { x: 50 + Math.cos(angle) * 40, y: 50 + Math.sin(angle) * 40 }; }
  const pickerSource = pending?.kind === "take" ? pending.target : pending?.actor;
  const pickCount = view?.players.find(p => p.id === pickerSource)?.count || 0;
  const previousWinner = view?.players.find(p => p.id === view.nextStarter && !p.removed);
  const starterName = previousWinner?.name || (config.firstSeat < 0 ? "随机决定" : view?.players[config.firstSeat]?.name || (config.firstSeat === 0 ? name || "你" : `玩家 ${config.firstSeat + 1}`));
  const ready = view?.players.length === config.seats && view.players.every(p => p.ready);
  const spots = Array.from({ length: config.seats }, (_, i) => {
    const offset = view && !lobby ? Math.max(0, view.players.findIndex(p => p.id === view.me)) : 0;
    const index = (i + offset) % config.seats; const p = view?.players[index];
    const angle = (config.seats === 4 ? Math.PI / 4 : Math.PI / 2) + i * Math.PI * 2 / config.seats;
    return { x: 50 + Math.cos(angle) * 40, y: 50 + Math.sin(angle) * 40, p, index };
  });
  const play = async (color?: Color, type: "play" | "jump" = "play", cardId = selected, top = game?.jump?.top) => {
    const card = view?.hand.find(c => c.id === cardId); if (!card) return;
    if (type === "jump" && (!jumpIds.includes(card.id) || top !== game?.jump?.top)) { setWild(null); setNotice("抢出机会已变化，请看当前牌面"); return; }
    if (card.color === "wild" && card.kind !== "roulette" && !color) { setWild({ ...card, intent: {type, top} }); return; }
    if (await act({ type, card: card.id, color, uno, ...(type === "jump" ? {top} : {}) })) { setSelected(null); setWild(null); setUno(false); }
  };
  const jumpPrompt = jumpCard && game?.jump ? <JumpInPrompt key={game.jump.top} card={jumpCard} own={game.jump.actor === view?.me} penalty={game.penalty} busy={busy} onJump={() => play(undefined,"jump",jumpCard.id,game.jump?.top)} /> : null;
  useEffect(() => {
    if (wild && (wild.intent.type === "jump" ? wild.intent.top !== game?.jump?.top : !mine)) setWild(null);
  },[game?.jump?.top,game?.turn,game?.pending,mine]);
  const reorder = (id: string, target: string) => { const ids = [...orderRef.current], from = ids.indexOf(id), to = ids.indexOf(target); if (from < 0 || to < 0 || from === to) return; ids.splice(from, 1); ids.splice(to, 0, id); orderRef.current = ids; setHandOrder(ids); };
  const moveSelected = async (delta: number) => { if (!selected) return; const at = orderRef.current.indexOf(selected), target = orderRef.current[at + delta]; if (target) { reorder(selected, target); await act({ type: "sort", order: orderRef.current }); } };
  const leave = async (watch = false) => {
    const code = view!.code;
    if (await act({type:"leave"})) {
      setSelected(null); setLeaveOpen(false);
      if (watch && viewRef.current?.spectating) { setNotice("已进入观战，展开下方手牌栏可查看剩余玩家的手牌"); return; }
      localStorage.removeItem("mercy-last-room"); if (!viewRef.current?.spectating) localStorage.removeItem(`mercy-seat-${code}`); sessionRef.current = null; viewRef.current = null; setSession(null); setView(null); window.history.replaceState(null,"","/");
    }
  };
  const setupFields = <>
<label className="setup-row"><span>{previousWinner ? "上局第一名先手" : "谁先出牌"}</span><select aria-label="先手玩家" value={previousWinner ? view!.players.findIndex(p => p.id === previousWinner.id) : config.firstSeat} disabled={!!previousWinner || !host || busy} onChange={e => updateConfig({ firstSeat: Number(e.target.value) })}><option value={-1}>随机决定</option>{Array.from({ length: config.seats }, (_, i) => <option value={i} key={i}>{view?.players[i]?.name || (i === 0 ? name || "你" : `玩家 ${i + 1}`)}</option>)}</select></label>
              <label className="setup-row"><span>初始手牌</span><span className="number-stepper"><button aria-label="减少初始手牌" disabled={!host || busy || config.initialCards <= 1} onClick={e => { e.preventDefault(); updateConfig({ initialCards: config.initialCards - 1 }); }}>−</button><input aria-label="初始手牌数量" type="number" min={1} max={24} value={config.initialCards} disabled={!host || busy} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n <= 24) updateConfig({ initialCards: n }); }} /><span>张</span><button aria-label="增加初始手牌" disabled={!host || busy || config.initialCards >= 24} onClick={e => { e.preventDefault(); updateConfig({ initialCards: config.initialCards + 1 }); }}>+</button></span></label>
              <label className="setup-row"><span>7 的规则</span><select aria-label="7 的规则" value={config.seven} disabled={!host || busy} onChange={e => updateConfig({ seven: e.target.value as Config["seven"] })}><option value="trade">互抽一张</option><option value="swap">整手交换</option><option value="choice">出 7 时自选</option></select></label>
              <label className="setup-row"><span>出 7 可不交换</span><select aria-label="出 7 可不交换" value={config.sevenMaySkip === false ? "no" : "yes"} disabled={!host || busy} onChange={e => updateConfig({ sevenMaySkip: e.target.value === "yes" })}><option value="yes">允许不交换</option><option value="no">必须交换</option></select></label>
              <label className="setup-row"><span>摸牌模式</span><select aria-label="摸牌模式" value={config.drawMode || "until"} disabled={!host || busy} onChange={e => updateConfig({ drawMode: e.target.value as Config["drawMode"] })}><option value="until">摸到能出为止</option><option value="single">摸一张就过</option></select></label>
              <label className="setup-row"><span>发牌间隔</span><select aria-label="单张发牌间隔" value={config.dealDelayMs ?? 300} disabled={!host || busy} onChange={e => updateConfig({ dealDelayMs: Number(e.target.value) })}>{[0, 150, 300, 500, 800, 1000, 1500].map(ms => <option key={ms} value={ms}>{ms === 0 ? "快速发完" : `${ms} 毫秒 / 张`}</option>)}</select></label>
              <label className="setup-row"><span>出牌方向</span><select aria-label="出牌方向" value={config.direction} disabled={!host || busy} onChange={e => updateConfig({ direction: Number(e.target.value) as 1 | -1 })}><option value={1}>顺时针 ↻</option><option value={-1}>逆时针 ↺</option></select></label>
  </>;
  useEffect(() => { if (!lobby) setSettingsOpen(false); }, [lobby]);
  const turnText = dealing ? "正在逐张发牌" : game?.knockout ? `${view?.players.find(p => p.id === game.knockout?.player)?.name} 已有 ${game.knockout.count} 张 · 淘汰` : game?.drawing ? `${view?.players.find(p => p.id === game.drawing?.player)?.name} 正在抽牌` : view?.status === "resolving" ? "最后一名已确定，正在结算名次" : !playing ? "" : pending ? pendingMine ? pending.kind === "zero" ? "选择是否按顺序换牌" : pending.kind === "target" ? "选择一位玩家" : pending.kind === "roulette" ? pending.color ? "点击牌堆，逐张抽牌" : "选择轮盘颜色" : "轮到你抽一张" : `等待 ${view?.players.find(p => p.id === (pending.kind === "return" ? pending.target : pending.actor))?.name || "对方"} 操作` : mine ? "轮到你出牌" : `轮到 ${current?.name || "玩家"}`;
  return <div className="app-shell" data-release={RELEASE} data-animating={animationPlaying} data-phase={view?.status || "home"} data-paused={!!view?.pause} aria-busy={!hydrated} inert={!hydrated}>
    <header className="topbar"><a href="/" className="brand" aria-label="朋友牌桌首页"><span className="brand-mark"><i /><i /><i /></span><span><strong>NO MERCY<span className="brand-dot">.</span></strong><small>毫不留情 · 朋友牌桌</small></span></a><div className="top-actions"><SoundSwitch on={effects.sound} toggle={effects.toggle} /><button className="quiet-button effect-settings-button" aria-label="特效设置" onClick={() => setEffectsOpen(true)}><Sparkles size={16} /><span>特效</span></button>{lobby && <button className="quiet-button effect-preview" onClick={effects.preview}>试试 +10</button>}{view && !lobby && <button className="quiet-button game-leave" onClick={() => setLeaveOpen(true)} aria-label="离开牌桌"><LogOut size={16} /></button>}<span className={`connection ${!online ? "offline" : ""}`}><span />{session ? online ? live.connection === "live" ? "实时连接牌桌" : "兼容连接" : "正在重新连接" : "3—6 人 · 跨设备联机"}</span><button className="quiet-button" onClick={() => setRulesOpen(true)}><BookOpen size={16} />规则速览</button><FeedbackButton nickname={name} release={RELEASE} /></div></header>
    <main>
      {lobby && <div className="page-intro"><div><div className="eyebrow"><span />{lobby ? "THE NIGHT IS YOURS" : `ROUND ${String(game?.round || 1).padStart(2, "0")}`}</div><h1>{lobby ? <>人到齐，<em>就开牌。</em></> : view?.status === "finished" ? <>这局，<em>胜负已定。</em></> : <>别眨眼，<em>轮到你了。</em></>}</h1><p>{lobby ? "叫上朋友，围成一桌。今晚的规矩，你们说了算。" : "留好你的最后一张牌，也别忘了喊 UNO。"}</p></div>{view && <div className="room-badge"><span>房间码</span><button onClick={() => share(false)}>{view.code}<Copy size={15} /></button></div>}</div>}
      <div className={`workspace ${!lobby ? "game-workspace" : ""}`}>
        {lobby && <aside className="sidebar">
          <section className="side-panel"><div className="section-label"><Users size={16} /><h2>{view ? "这桌的朋友" : "先坐下，再开局"}</h2>{view && <span>{view.players.length}/{config.seats}</span>}</div>
            {!view ? <><label className="field-label" htmlFor="nickname">你的昵称</label><input id="nickname" className="text-input" placeholder="大家怎么称呼你？" value={name} maxLength={18} onChange={e => setName(e.target.value)} autoComplete="nickname" /><div className="join-divider"><span>朋友已经开桌？</span></div><button className="outline-button full" onClick={() => setJoinOpen(true)}><Link2 size={16} />输入房间码加入<ArrowUpRight size={15} /></button><button className="bot-test-button" disabled={busy} onClick={() => create(true)}><Users size={14} />一个人试玩 · 人机补满</button></> : <><div className="player-list">{view.players.map((p, i) => <div className="player-row" key={p.id}><span className={`list-avatar avatar-${i}`}>{p.name.slice(0, 1)}</span><div><strong>{p.name}{p.id === view.me && <small> 你</small>}<em className="player-score" data-negative={p.score < 0}>{p.score > 0 ? "+" : ""}{p.score} 分</em></strong><span>{p.out ? "已淘汰" : !p.online ? "暂时离线" : lobby ? p.ready ? "已准备" : "未准备" : `${p.count} 张手牌`}</span></div>{p.id === view.host ? <Crown size={14} className="host-crown" /> : p.ready && lobby ? <Check size={15} className="ready-check" /> : null}{host && lobby && p.id !== view.me && <button className="remove-bot" aria-label={`移除 ${p.name}`} disabled={busy} onClick={() => setKickTarget(p.id)}><X size={12} /></button>}{host && lobby && view.players.length > 1 && <div className="seat-arrows"><button disabled={busy || i === 0} aria-label={`把 ${p.name} 前移一个座位`} onClick={() => { const ids = view.players.map(q => q.id); [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; act({ type: "seats", order: ids }); }}><ArrowUp size={12} /></button><button disabled={busy || i === view.players.length - 1} aria-label={`把 ${p.name} 后移一个座位`} onClick={() => { const ids = view.players.map(q => q.id); [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; act({ type: "seats", order: ids }); }}><ArrowDown size={12} /></button></div>}</div>)}</div><button className="outline-button full" onClick={() => share()}><Link2 size={15} />复制邀请链接</button>{lobby && host && <div className="bot-controls"><button disabled={busy || view.players.length >= config.seats} onClick={() => act({ type: "addBots" })}><Plus size={12} />添加人机</button><button disabled={busy || view.players.length >= config.seats} onClick={() => act({ type: "addBots", all: true })}>人机补满<Users size={12} /></button></div>}{lobby && host && <p className="micro-copy">箭头调整座位；× 移出玩家。累计分数在本牌桌保留。</p>}{!host && view.players.some(p => p.id === view.host && !p.online && Date.now() - p.lastSeen > 45000) && <button className="quiet-button full" onClick={() => act({ type: "claimHost" })}>房主离线，接管房间</button>}</>}
          </section>
          {view && <button className="quiet-button leave-button" onClick={() => setLeaveOpen(true)}><LogOut size={15} />离开牌桌</button>}
        </aside>}
        <section className="table-area" aria-label="牌桌">
          <div className="table-toolbar">{lobby ? <div className="seat-selector" aria-label="玩家人数">{[3, 4, 5, 6].map(n => <button key={n} aria-pressed={config.seats === n} disabled={!lobby || !host || busy || !!view && n < view.players.filter(p => !p.bot).length} onClick={() => updateConfig({ seats: n })}>{n}<span> 人</span></button>)}</div> : <span className="game-round">第 {game?.round} 局 · {config.seats} 人</span>}<div className="table-toolbar-actions">{dealing && <><span className="deal-progress" role="status">已发 {game?.deal?.dealt} / {game?.deal?.total}<progress value={game?.deal?.dealt || 0} max={game?.deal?.total || 1} /></span><button className="outline-button deal-fast-forward" disabled={busy || !online || !!view?.pause} onClick={() => act({ type: "finishDeal" })}><FastForward size={15} />立即发完</button></>}<span className="shape-label">{SHAPES[config.seats - 3]}牌桌<span> · </span>{(game?.direction || config.direction) === 1 ? "顺时针" : "逆时针"}<RotateCcw size={13} style={{ transform: (game?.direction || config.direction) === 1 ? "scaleX(-1)" : undefined }} /></span></div></div>
          {view && !lobby && <MatchStatus view={view} connection={live.connection} latencyMs={live.latencyMs} busy={busy} turnText={turnText} onAction={act} onReconnect={live.reconnect} onKick={setKickTarget} />}
          {jumpPrompt}
          <div ref={boardRef} className={`board board-${config.seats} ${lobby ? "board-lobby" : "board-game"}`}>
            <div className="board-glow" /><svg className="table-path" viewBox="0 0 100 100" aria-label={`${SHAPES[config.seats - 3]}座位布局`}><polygon points={spots.map(s => `${s.x},${s.y}`).join(" ")} />{spots.map((s, i) => { const t = spots[(i + (game?.direction || config.direction) + spots.length) % spots.length]; const dx = t.x - s.x, dy = t.y - s.y, x = s.x + dx * .55, y = s.y + dy * .55; return <path key={i} d="M -1.4 -1.6 L 0.3 0 L -1.4 1.6" transform={`translate(${x} ${y}) rotate(${Math.atan2(dy, dx) * 180 / Math.PI})`} />; })}</svg>
            {spots.map(({ x, y, p, index }) => <div key={p?.id || `empty-${index}`} data-player-id={p?.id} data-social={social && p?.id === social.to ? social.kind : undefined} data-self={!!p && p.id === view?.me} data-pole={Math.abs(x - 50) < 1 && y < 20 ? "top" : undefined} data-exchanging={transfer?.kind === "swap" && (p?.id === transfer.from || p?.id === transfer.to)} className={`table-seat ${p ? "occupied" : !view && index === 0 ? "self-preview" : "empty-seat"} ${(p?.id === game?.turn && playing || dealing && p?.id === game?.deal?.lastPlayer) ? "active-seat" : ""} ${p?.out ? "out-seat" : p?.finished ? "finished-seat" : ""}`} style={{ left: `${x}%`, top: `${y}%`, "--seat-y": `${y}%`, "--social-offset": `${-(social?.ageMs || 0)}ms`, "--swap-offset": `${-(transfer ? transfer.duration - transfer.remainingMs : 0)}ms` } as CSSProperties}><div className={`seat-avatar avatar-${index}`}>
              {p ? p.name.slice(0, 1) : !view && index === 0 ? (name || "你").slice(0, 1) : <Plus size={20} />}{p && p.id === view?.host && <span className="seat-crown"><Crown size={10} /></span>}
              {playing && p && p.id !== view?.me && <button className="seat-interact" aria-label={`和 ${p.name} 互动`} title="点头像，送一个搞笑道具" aria-haspopup="dialog" aria-expanded={socialTarget === p.id} disabled={busy || !online} onClick={() => setSocialTarget(p.id)}><span className="seat-interact-badge" aria-hidden="true">☺</span></button>}
            </div><strong>{p?.name || (!view && index === 0 ? name || "你" : `玩家 ${index + 1}`)}{p && p.id === view?.me && <small> · 你</small>}</strong><span className="seat-status" key={p ? `${p.id}-${shownCount(p)}` : "empty"} data-receiving={!!p && game?.delivery?.player === p.id}>
              {!p ? !view && index === 0 ? "你的座位" : "等待加入" : lobby ? !p.online ? "等待重连" : p.ready ? "✓ 已准备" : "等待准备" : p.removed ? <small>已移出</small> : p.finished ? <span className="seat-finish-rank">第 {p.rank} 名 · 观战</span> : <>{p.id !== view?.me && <span className="seat-count" data-level={p.out ? "out" : shownCount(p) >= 20 ? "danger" : shownCount(p) >= 15 ? "warning" : shownCount(p) === 1 ? "uno" : "normal"} aria-label={`剩余 ${shownCount(p)} 张牌`}>{shownCount(p)}</span>}{(p.out || !p.online || p.uno) && <small>{p.withdrawn ? "已退出 · 观战" : p.out ? "已淘汰" : !p.online ? "等待重连" : "UNO"}</small>}</>}
            {p && <span className="seat-score" data-negative={p.score < 0} aria-label={`累计 ${p.score} 分`}>{p.score > 0 ? "+" : ""}{p.score}<small>分</small></span>}</span>{playing && p && !p.out && !p.finished && <span className="mini-hand"><i /><i /><i /></span>}</div>)}
            {lobby ? <div className="setup-center"><div className="setup-title"><Settings2 size={15} /><span>开局设置</span><span className="host-tag">{host ? "你来定" : "房主设置"}</span></div>
              {setupFields}
              <div className="compact-settings"><span>先手<b>{starterName}</b></span><span>手牌<b>{config.initialCards} 张</b></span><span>规则 7<b>{config.seven === "trade" ? "互抽一张" : config.seven === "swap" ? "整手交换" : "出 7 时自选"}</b></span><span>出 7<b>{config.sevenMaySkip === false ? "必须交换" : "可不交换"}</b></span><span>方向<b>{config.direction === 1 ? "顺时针" : "逆时针"}</b></span><span className="compact-draw">摸牌<b>{config.drawMode === "single" ? "摸一张就过" : "摸到能出为止"}</b></span></div><button className="edit-settings" onClick={() => setSettingsOpen(true)}><Settings2 size={12} />{host ? "调整开局设置" : "查看开局设置"}</button>
              <button className="primary-button start-button" disabled={busy || !!view && host && !ready} onClick={() => !view ? create() : host ? act({ type: "start" }) : act({ type: "ready", ready: !me?.ready })}>{busy ? <LoaderCircle size={17} className="spin" /> : !view ? <><span>创建房间</span><ArrowUpRight size={17} /></> : host ? <><span>开始这一局</span><ArrowRight size={17} /></> : me?.ready ? <><Check size={16} />已准备，等开局</> : "我准备好了"}</button>
              <p className="setup-footnote">{!view ? "创建后，把邀请链接发给朋友" : host ? ready ? "朋友都到齐了，随时开牌" : `已加入 ${view.players.length}/${config.seats} 人 · 已准备 ${view.players.filter(p => p.ready).length} 人` : "规则变更后，需要重新准备"}</p>
            </div> : dealing ? <div className="dealing-center" role="status"><PlayingCard back /><strong>正在逐张发牌</strong></div> : <div className="game-center"><div className={`turn-label ${mine ? "your-turn" : ""}`}><span />{turnText || "本局结束"}</div><div className="center-piles"><button className="draw-pile" disabled={!(mine || rouletteMine) || busy} onClick={() => act({ type: rouletteMine ? "drawRoulette" : "draw", uno })} aria-label={rouletteMine ? "轮盘抽下一张" : game?.penalty ? `接受罚抽 ${game.penalty} 张` : (config.drawMode === "single" ? "摸一张牌并结束回合" : "摸到能出的牌为止")}><PlayingCard back /><span>{rouletteMine ? "点击抽下一张" : game?.drawing ? `已抽 ${game.drawing.drawn}${game.drawing.total ? ` / ${game.drawing.total}` : ""} 张` : game?.penalty ? `罚抽 ${game.penalty} 张` : config.drawMode === "single" ? "摸一张就过" : "摸到能出"}</span></button><div className="discard-pile"><PlayingCard card={game?.top} /><span>当前出牌</span></div></div><div className="current-color"><i className={`color-dot dot-${game?.color}`} />当前{COLOR_NAMES[game?.color || "red"]}色<span>{(game?.direction || 1) === 1 ? "↻" : "↺"}</span></div>{!!game?.penalty && <p className="penalty-hint">{game.top.color === "wild" ? `只能黑色加牌 · 需 ≥ +${game.lastDraw}` : `同值 +${game.lastDraw} 可跨色 · 更大须${COLOR_NAMES[game.color]}色或黑牌`}</p>}{game?.resolution && <p className="resolution-hint" role="status">{game.resolution}</p>}{!!game?.finishers.length && playing && <p className="resolution-hint">有人出完手牌，最后一张效果仍在进行</p>}{game?.knockout && <p className="knockout-hint" role="status">达到 {game.knockout.count} 张手牌，正在结算淘汰</p>}{pending && <p className="pending-hint">{pending.kind === "zero" ? "0 · 是否按顺序传牌" : pending.kind === "roulette" ? pending.color ? `目标：${COLOR_NAMES[pending.color]}色 · 已抽 ${pending.drawn || 0} 张，逐张点击继续` : "由下一位玩家自己选择颜色" : config.seven === "choice" && pending.kind === "target" && !pending.sevenMode ? "7 · 选择换牌方式" : activeSeven === "swap" ? "7 · 交换全部手牌" : pending.kind === "return" ? "7 · 对方反抽一张" : "7 · 互抽一张"}</p>}</div>}
            {dealing && game?.deal?.lastPlayer && <div key={game.deal.dealt} className="flying-deal" aria-hidden="true" style={{ "--deal-x": `${dealSpot.x}%`, "--deal-y": `${dealSpot.y}%`, "--deal-time": `${Math.max(100, config.dealDelayMs)}ms` } as CSSProperties}><PlayingCard back small /></div>}
          </div>
          {lobby && <div className="mobile-start"><button className="primary-button full" disabled={busy || !!view && host && !ready} onClick={() => !view ? create() : host ? act({ type: "start" }) : act({ type: "ready", ready: !me?.ready })}>{busy ? <LoaderCircle size={16} className="spin" /> : !view ? "创建房间" : host ? "开始这一局" : me?.ready ? "已准备，等开局" : "我准备好了"}<ArrowRight size={16} /></button></div>}{lobby && <div className="table-bottom"><span><span className="status-dot" />{view ? `等待 ${view.players.find(p => p.id === view.host)?.name || "房主"} 开启本局` : "规则就绪，差几个朋友"}</span><span>25 张即淘汰 · 罚抽可叠加</span></div>}
          {view && !lobby && <HandTray key={`${view.code}-${game?.round}-${view.me}`} eliminated={!!me?.out && game?.knockout?.player !== view.me} watching={watchLabel} count={watching ? view.spectatorHands.length : shownHand.length} myTurn={!!mine} tools={
            <div className="hand-view-tools"><div className="pick-layout hand-layout" aria-label="自己的手牌显示方式"><button aria-label="逐张平铺" title="逐张平铺" aria-pressed={handLayout === "flat"} onClick={() => { setHandLayout("flat"); localStorage.setItem("mercy-hand-layout", "flat"); }}><LayoutGrid size={16} /></button><button aria-label="折叠手牌" title="折叠手牌" aria-pressed={handLayout === "overlap"} onClick={() => { setHandLayout("overlap"); localStorage.setItem("mercy-hand-layout", "overlap"); }}><Layers size={16} /></button></div><button className="outline-button auto-arrange" aria-label="自动理牌" disabled={busy || !!me?.out || !(playing || dealing) || !!game?.drawing || !!game?.knockout || hand.length < 2} title="自动理牌：同色数字从小到大，+牌在本色中随机放" onClick={() => { const ids = arrangeHand(hand).map(c => c.id); orderRef.current = ids; setHandOrder(ids); act({ type: "sort", order: ids }); }}><Shuffle size={16} /></button></div>
          }>
            {watching ? <SpectatorHands view={view} renderCard={c => <PlayingCard card={c} />} /> : <><OwnHand cards={shownHand} motion={handMotion} animationOffset={0} incomingIds={incomingCards} layout={handLayout} selected={selected} playable={mine ? game?.playable || [] : []} jumpable={jumpIds} disabled={busy || !online || !!me?.out || !!me?.autoplay || !(playing || dealing)} renderCard={c => <PlayingCard card={c} />} onSelect={id => setSelected(selected === id ? null : id)} onReorder={reorder} onCommit={() => { act({ type: "sort", order: orderRef.current }); }} onMove={(id, delta) => { const at = orderRef.current.indexOf(id), target = orderRef.current[at + delta]; if (target) { reorder(id, target); act({ type: "sort", order: orderRef.current }); } }} />
            {selected && view.hand.some(c => c.id === selected) && <div className="selected-tools"><span>已选：{cardLabel(hand.find(c => c.id === selected) || view.hand[0])}</span><button className="quiet-button" disabled={busy || handOrder.indexOf(selected) < 1} onClick={() => moveSelected(-1)}><ArrowLeft size={13} />前移</button><button className="quiet-button" disabled={busy || handOrder.indexOf(selected) === hand.length - 1} onClick={() => moveSelected(1)}>后移<ArrowRight size={13} /></button></div>}
            {playing && !game?.drawing && !game?.knockout && game?.risk.filter(id => id !== view.me).map(id => <button className="catch-button" disabled={busy || !online || !!view?.pause || !!me?.autoplay} key={id} onClick={() => act({ type: "catch", target: id })}>抓 {view.players.find(p => p.id === id)?.name} 漏喊 UNO · 罚抽 2 张</button>)}
            <div className={`card-feedback ${selected && view.blockedReasons?.[selected] ? "card-blocked" : selected && (mine || selectedJump) ? "card-ready" : ""}`} role="status">{selectedJump ? mine ? "同牌可抢出替换效果；普通出牌仍按叠加规则处理" : "这张可以抢出 · 无需等待你的回合" : selected ? view.blockedReasons?.[selected] || "这张可以出 · 点击「确认出牌」" : "滑动浏览 · 长按拖动理牌 · 选中后确认出牌"}</div>
            {mine && !!game?.playable.length && <p className="hand-hint">可以出牌，也可以选择摸牌。{config.drawMode === "single" ? "本桌摸一张就过，摸完不能出牌。" : "本桌连续摸到能出的牌，然后自行出牌。"}</p>}{mine && !game?.playable.length && <p className="hand-hint">{game?.penalty ? "没有可以叠加的牌，点击牌堆接受罚抽。" : "没有可以出的牌，点击牌堆按本桌摸牌模式摸牌。"}</p>}
            <div className="hand-actions"><button className={`uno-button ${uno || me?.uno ? "uno-active" : ""}`} disabled={busy || !online || !!view?.pause || !!me?.autoplay || !playing || me?.out || hand.length === 0 || hand.length === 1 && me?.uno} onClick={() => hand.length === 1 ? act({ type: "uno" }) : setUno(!uno)}>{uno || me?.uno ? "✓ UNO！" : "UNO！"}</button><button className="outline-button mobile-draw-action" disabled={!(mine || rouletteMine) || busy} onClick={() => act({ type: rouletteMine ? "drawRoulette" : "draw", uno })}>{rouletteMine ? "抽下一张" : game?.penalty ? `接受 +${game.penalty}` : "摸牌"}</button><button className={`primary-button play-button ${selectedJump && !mine ? "jump-confirm" : ""}`} disabled={busy || !selected || !(mine && game?.playable.includes(selected) || selectedJump)} onClick={() => play(undefined, selectedJump && !mine ? "jump" : "play")}>{selectedJump && !mine ? "抢出这张" : "确认出牌"}<ArrowUpRight size={16} /></button></div></>}
          </HandTray>}
        </section>
      </div>
    </main><footer><span>朋友局，自定规矩。</span><span>NO MERCY · 非官方朋友牌桌 <span className="release-version" aria-label="游戏版本">v{RELEASE}</span></span></footer>
    {social && <SocialAnimation key={`${social.id}-${!!view?.pause}`} event={social} me={view?.me} paused={!!view?.pause} />}
    <ActionEffect visual={effects.visual} paused={effects.paused} me={view?.me} />
    <CardDeliveries view={view} onBusy={setDeliveryBusy} renderFace={c => <PlayingCard card={c} small />}><PlayingCard back small /></CardDeliveries>
    {transfer && view && <TransferEffect key={transfer.id} transfer={transfer} paused={!!view.pause} me={view.me} board={boardRef} names={Object.fromEntries(view.players.map(p => [p.id, p.name]))}><PlayingCard back small /></TransferEffect>}
    {(notice || error) && <div className={`toast ${error ? "error-toast" : ""}`} role={error ? "alert" : "status"}>{error || notice}<button aria-label="关闭提示" onClick={() => { setError(""); setNotice(""); }}><X size={15} /></button></div>}
    {joinOpen && <Modal label="加入朋友的牌桌" close={() => setJoinOpen(false)}><p className="modal-copy">输入昵称和朋友发来的 6 位房间码。</p><form onSubmit={e => { e.preventDefault(); act({ type: "join", name, code: joinCode.trim().toUpperCase() }); }}><label className="field-label" htmlFor="join-name">你的昵称</label><input id="join-name" required maxLength={18} className="text-input" value={name} onChange={e => setName(e.target.value)} placeholder="大家怎么称呼你？" autoComplete="nickname" /><label className="field-label" htmlFor="join-code">房间码</label><input id="join-code" required pattern="[A-Za-z2-9]{6}" maxLength={6} className="text-input code-input" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="例如 AB3D5F" autoComplete="off" /><button className="primary-button full modal-submit" disabled={busy}>加入牌桌<ArrowRight size={16} /></button></form></Modal>}
    {socialTarget && view && playing && <Modal label="朋友间，整点活" close={() => setSocialTarget(null)}><SocialPicker name={view.players.find(p => p.id === socialTarget)?.name || "对方"} busy={busy} waiting={!!view.pause || !!pending || !!game?.drawing || !!game?.knockout} cooldownMs={Math.max(view.social.cooldownMs, view.social.roomCooldownMs)} receivedAt={viewReceivedAt.current} send={async kind => { if (await act({ type: "social", target: socialTarget, kind })) setSocialTarget(null); }} /></Modal>}
    {effectsOpen && <Modal label="特效设置" close={() => setEffectsOpen(false)}><p className="modal-copy">设置只影响这台设备。系统开启减少动态效果时，会自动关闭震屏。</p><label className="field-label" htmlFor="shake-strength">震屏强度</label><select id="shake-strength" className="text-input shake-select" value={effects.shake} onChange={e => effects.changeShake(Number(e.target.value))}><option value={0}>关闭</option><option value={.45}>轻微</option><option value={1}>标准</option><option value={1.5}>狂暴</option></select><p className="modal-copy effects-copy">加牌会飞向目标玩家；罚牌逐张飞入手牌；新动作会打断上一段特效与播报，操作无需等待特效结束。</p>{lobby && <button className="primary-button full" onClick={() => { setEffectsOpen(false); effects.preview(); }}>预览 +10 冲击</button>}</Modal>}
    {settingsOpen && <Modal label="开局设置" close={() => setSettingsOpen(false)}><div className="settings-modal-fields">{setupFields}</div><button className="primary-button full modal-submit" onClick={() => setSettingsOpen(false)}>完成</button></Modal>}
    {pendingMine && pending?.kind === "zero" && <Modal label="0 · 要按顺序换牌吗？">{jumpPrompt}<p className="modal-copy">你来决定：让仍在局的玩家按当前{game?.direction === 1 ? "顺时针" : "逆时针"}方向，把整手牌交给下一位；或者保持大家的手牌。</p><div className="seven-mode-choices"><button disabled={busy} onClick={() => act({type:"chooseZero",rotate:true})}><RotateCcw size={23} /><strong>按顺序传牌</strong><small>{game?.direction === 1 ? "顺时针" : "逆时针"} · 每人传给下一位</small></button><button disabled={busy} onClick={() => act({type:"chooseZero",rotate:false})}><Layers size={23} /><strong>不换牌</strong><small>保持手牌，结束本回合</small></button></div></Modal>}
    {rulesOpen && <Modal label="这桌怎么玩" close={() => setRulesOpen(false)}><div className="rules-list"><p><b>牌桌积分</b> {config.seats} 人局从第一名起：{Array.from({length:config.seats},(_,i) => {const points = scoreForPlace(config.seats,i+1); return `${points > 0 ? "+" : ""}${points}`;}).join("、")} 分。允许负分，同一牌桌累计保留。出完牌者优先按先后排名；其余出局者越晚离场名次越高；最后留在场上的人最后一名。第二局起，由上一局第一名先出牌。</p><p><b>出牌与抽牌</b> 同色、同数字或同符号可以出牌；有牌也可以选择摸牌。{config.drawMode === "single" ? "本桌只摸一张，摸完立刻结束回合，不能再出牌。" : "本桌连续摸到能出的牌，随后保留回合，由你选择出牌。"}万能牌需选颜色。</p><p><b>抢出牌</b> 别人或自己刚出牌后，手里有同颜色、同数字／符号的牌，就会出现抢出提示。抢出从上一位出牌者到抢出者走较近的在局座次；同距或自己连抢保留原方向，再执行新牌的功能。抢出功能牌只保留新牌效果，原罚抽链和未执行的换牌选择取消；被跳过的人不能抢禁牌。下一步开始抽牌、确认 0、交换手牌或结束 7 选择后，旧抢出机会关闭；已经抽到、交换或同色全弃的牌不撤回。多人同时抢出，以服务器先收到的有效操作为准。</p><p><b>罚抽叠加</b> +2、+4、+6、+10 叠加时，数值必须不小于上一张。上一张为单色牌时，同数值可跨颜色叠加；数值更大时须同色或黑色万能牌。上一张为黑色万能加牌时，只能继续接黑色万能加牌。接不上则抽累计张数并跳过回合。</p><p><b>7 的玩法</b> {config.seven === "choice" ? "本桌由出 7 的玩家在当次回合选择互抽一张或交换整手，再指定对手。" : config.seven === "trade" ? "本桌互抽一张：出牌者选对手并抽一张，对方再反抽一张。双方看牌背选位置。" : "本桌整手交换：指定一位对手交换全部手牌。"} {config.sevenMaySkip === false ? "本桌出 7 必须交换。" : "选择对手前可以选择不交换；开始互抽后必须完成双方抽牌。"}</p><p><b>0 与功能牌</b> 0：出牌者选择按当前方向传整手牌，或选择不换牌；已出完或淘汰的人不参与。0 为最后一张时，直接记名次；跳过所有人：再行动一次；同色全弃：丢掉手中同色牌；颜色轮盘：下一位选颜色，抽到该颜色为止，万能牌不算，全部加入手牌后跳过。</p><p><b>排位与观战</b> 出完手牌按先后记下名次，剩下的人继续打。任意时刻达到 25 张即淘汰；只剩最后一人时全局结束，他就是最后一名。出完牌、淘汰或退出本局后均可观战，可展开下方观战手牌栏，查看剩余玩家的全部手牌和出牌。最后一张为加牌或轮盘时，先完成叠加与抽牌再记名次。罚抽逐张加入手牌，达到 25 张先展示淘汰过程。</p><p><b>记得 UNO</b> 可以先点 UNO 再出牌；剩一张时也能补喊。下一位开始出牌或抽牌前，被抓漏喊罚抽 2 张。</p><p><b>只剩两人时</b> 普通反转会跳过对手；万能反转 +4 会罚自己，可继续叠加转回对手。</p><a href="https://service.mattel.com/instruction_sheets/HVW18-Eng.pdf" target="_blank" rel="noreferrer">查看美泰原版说明书 <ArrowUpRight size={13} /></a></div></Modal>}
    {!view?.pause && !me?.autoplay && (wild || pendingMine && pending?.kind === "roulette" && !pending.color) && <Modal label={wild ? wild.intent.type === "jump" ? "抢出万能牌 · 选择颜色" : "选择接下来的颜色" : "颜色轮盘 · 选一个颜色"} close={wild ? () => setWild(null) : undefined}>{!wild && jumpPrompt}<p className="modal-copy">{wild ? cardLabel(wild) : "由你选择颜色，接着每次点击牌堆抽一张，直到抽中该颜色。万能牌不会结束轮盘。"}</p><div className="color-choices">{COLORS.map(c => <button key={c} disabled={busy} className={`color-choice choose-${c}`} onClick={() => wild ? play(c,wild.intent.type,wild.id,wild.intent.top) : act({ type: "color", color: c })}>{COLOR_NAMES[c]}色<ChevronRight size={17} /></button>)}</div></Modal>}
    {pendingMine && pending?.kind === "target" && <Modal label={config.seven === "choice" ? "7 · 自己选择换牌方式" : activeSeven === "trade" ? "7 · 选一位对手互抽" : "7 · 选一位对手换手牌"}>{jumpPrompt}<div className="seven-rule-summary" aria-label="本局 7 的设置"><span>本局 7：{sevenRuleLabel}</span><span>{config.sevenMaySkip === false ? "必须交换" : "可不交换"}</span></div><p className="modal-copy">{config.seven === "choice" ? "先决定换一张还是换整手，再选择一位对手。" : config.sevenMaySkip === false ? "本桌必须交换，请选择一位对手。" : "可以选一位对手，也可以不交换，直接结束本回合。"}</p>{config.seven !== "choice" && <p className="seven-mode-note">想每次选择「换一张 / 换整手」？请在下一局开局设置中，将「7 的规则」选为「出 7 时自选」。</p>}{config.seven === "choice" && <div className="seven-mode-choices"><button aria-pressed={pending.sevenMode === "trade"} disabled={busy} onClick={() => act({ type: "chooseSeven", mode: "trade" })}><Copy size={21} /><strong>换一张</strong><small>各抽对方一张牌</small></button><button aria-pressed={pending.sevenMode === "swap"} disabled={busy} onClick={() => act({ type: "chooseSeven", mode: "swap" })}><Layers size={21} /><strong>换整手</strong><small>交换双方全部手牌</small></button></div>}{(config.seven !== "choice" || pending.sevenMode) && <div className="target-list">{view!.players.filter(p => p.id !== view!.me && !p.out && !p.finished).map(p => <button className="outline-button" disabled={busy} key={p.id} onClick={() => act({ type: "target", target: p.id })}><span>{p.name}</span><span>{p.count} 张<ChevronRight size={16} /></span></button>)}</div>}{config.sevenMaySkip !== false && <button className="outline-button full skip-seven" disabled={busy} onClick={() => act({ type: "skipSeven" })}>不交换，结束回合<ArrowRight size={15} /></button>}</Modal>}
    {pendingMine && (pending?.kind === "take" || pending?.kind === "return") && <Modal label={pending.kind === "take" ? "选一张，抽走它。" : "现在，轮到你反抽。"}>{jumpPrompt}<p className="modal-copy">{view!.players.find(p => p.id === pickerSource)?.name} 的手牌 · 只能看到牌背</p><HiddenHand key={`${pending.kind}-${pending.actor}-${pending.target}`} count={pickCount} busy={busy} onConfirm={index => act({ type: "pick", index })}><PlayingCard back /></HiddenHand></Modal>}
    {view?.status === "finished" && <Modal label="本局战报" wide><MatchRecap view={view} busy={busy} onReset={() => act({ type: "reset" })} onLeave={() => leave()} renderCard={c => <PlayingCard card={c} />} />{!host && view.players.some(p => p.id === view.host && !p.bot && !p.online && Date.now() - p.lastSeen > 45000) && <button className="outline-button full" disabled={busy} onClick={() => act({ type: "claimHost" })}>房主已离线，接管房间</button>}</Modal>}
    {leaveOpen && <Modal label={playing && !view?.spectating ? "退出本局？" : "离开这张牌桌？"} close={() => setLeaveOpen(false)}><p className="modal-copy">{playing && !view?.spectating ? "退出后停止参与本局，可留下观战，查看所有剩余手牌；也可以返回首页。" : view?.spectating ? "你已在观战，返回首页后可使用同一邀请链接重新进入。" : "你可以在下一局开始前重新加入。"}</p>{playing && !view?.spectating && <button className="primary-button full" disabled={busy} onClick={() => leave(true)}><Eye size={16} />退出本局并观战</button>}<button className="outline-button full" disabled={busy} onClick={() => leave()}><LogOut size={16} />离开牌桌，返回首页</button></Modal>}
    {kickTarget && view && <Modal label="移出这位玩家？" close={() => setKickTarget(null)}><p className="modal-copy">将 {view.players.find(p => p.id === kickTarget)?.name} 移出牌桌，对方会断开连接，不能再使用原座位凭证进入。{lobby ? "空座位可以邀请朋友加入。" : "本局其余玩家继续，下一局前可补充座位。"}</p><button className="primary-button full" disabled={busy} onClick={async () => { if(await act({type:"kick",target:kickTarget})) setKickTarget(null); }}>确认移出</button></Modal>}
  </div>;
}
