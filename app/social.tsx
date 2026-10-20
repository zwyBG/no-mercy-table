"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { SOCIAL_DURATION, SOCIAL_KINDS, type SocialEvent, type SocialKind } from "@/lib/social";

type Event = SocialEvent & { ageMs: number };
type Source = { code: string; version: number; pause?: unknown; social?: { events: Event[] } } | null;
export type SocialSound = (kind: SocialKind, phase: "launch" | "hit") => void;
const PROPS: Record<SocialKind, { name: string; hint: string; bang: string; self: string; reaction: string; gift: string }> = {
  tomato: { name: "丢番茄", hint: "啪叽！送你一脸番茄酱", bang: "啪 叽！", self: "你被番茄糊脸了！", reaction: "喜提番茄面膜", gift: "番茄" },
  water: { name: "泼一桶水", hint: "哗啦！物理降温一下", bang: "哗 啦！", self: "你被浇了个透心凉！", reaction: "洗了个冷水澡", gift: "一桶水" },
  duck: { name: "小黄鸭围观", hint: "嘎？这操作鸭都看懵了", bang: "嘎？嘎！", self: "小黄鸭正在围观你的操作", reaction: "被小黄鸭围观了", gift: "小黄鸭" },
  glove: { name: "弹簧拳", hint: "啵嘤！Q 弹一下就跑", bang: "BOING!", self: "你被 Q 弹了一下！", reaction: "被弹了个猝不及防", gift: "弹簧拳" },
  party: { name: "彩虹应援", hint: "好活！给你撒点彩纸", bang: "好 活！", self: "你收到了彩虹应援！", reaction: "这波操作有点东西", gift: "礼花应援" },
};

export function PrankIcon({ kind }: { kind: SocialKind }) {
  return <svg viewBox="0 0 100 100" aria-hidden="true" className={`prank-icon icon-${kind}`}>
    {kind === "tomato" ? <>
      <path d="M50 29C21 15 6 44 13 66c6 25 34 30 39 24 15 9 38-6 39-29 2-27-22-41-41-32Z" fill="#f25f4f" stroke="#a9362c" strokeWidth="3" />
      <path d="m50 34-21 2 12-11-9-10 17 5 8-16 2 18 19-2-15 11 8 10-17-4Z" fill="#71a65c" stroke="#46773b" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 46q-7 10-3 17" stroke="#ffb3a0" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="m39 55 7 5-8 2m29-9-7 5 8 3" stroke="#62342f" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M46 73q8 8 15-2" stroke="#62342f" strokeWidth="3" fill="none" strokeLinecap="round" />
    </> : kind === "water" ? <>
      <path d="M23 37C18 1 82 1 78 37" fill="none" stroke="#5c7a94" strokeWidth="6" />
      <path d="m16 34 10 53q24 15 48 0l10-53Z" fill="#9ecbdf" stroke="#426a86" strokeWidth="3" strokeLinejoin="round" />
      <path d="m26 43 8 38" stroke="#deeff5" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="50" cy="34" rx="34" ry="12" fill="#ddf4ff" stroke="#426a86" strokeWidth="3" />
      <path d="M21 33q10-10 21-1t22 0 15 2q-30 14-58-1Z" fill="#5eb9ed" />
      <circle cx="42" cy="63" r="3" fill="#355775" /><circle cx="63" cy="63" r="3" fill="#355775" />
      <path d="M44 74q9 8 16-1" stroke="#355775" strokeWidth="3" fill="none" strokeLinecap="round" />
    </> : kind === "duck" ? <>
      <path d="M24 59c-8-14-3-36 15-40 24-8 37 12 30 31 19-6 25-1 22 16-4 26-51 31-68 15-12-12-12-22-10-26Z" fill="#ffcf4f" stroke="#b88a29" strokeWidth="3" strokeLinejoin="round" />
      <path d="M47 63c-8-8-23-4-18 8s25 11 36-1" fill="#ffe48a" stroke="#d8a741" strokeWidth="2.5" />
      <path d="m25 39-18 7 19 8 8-8Z" fill="#f69748" stroke="#b96e32" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="40" cy="37" r="5" fill="#62513b" /><circle cx="41" cy="35" r="1.6" fill="white" />
      <path d="m40 17 3-8 8 10" stroke="#b88a29" strokeWidth="3" fill="#ffcf4f" strokeLinecap="round" /><path d="M59 27q9 5 7 14" stroke="#fff0b4" strokeWidth="5" fill="none" strokeLinecap="round" />
    </> : kind === "glove" ? <>
      <path d="M20 62c-12-9-12-28 0-33 0-13 15-16 23-8 7-10 25-4 25 6 17-2 24 12 21 23-2 18-17 28-24 31H30Z" fill="#f16d77" stroke="#a34256" strokeWidth="3" strokeLinejoin="round" />
      <path d="M20 48q13-15 26 2l-3 17" stroke="#a34256" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="m27 76-2 17h43l-3-17Z" fill="#889fd4" stroke="#50658e" strokeWidth="3" strokeLinejoin="round" /><path d="M35 84h22" stroke="#d4e0fc" strokeWidth="4" strokeLinecap="round" />
      <path d="M51 29q14-7 21 7" fill="none" stroke="#ffc1c6" strokeWidth="6" strokeLinecap="round" />
    </> : <>
      <path d="m19 82 18-53 39 36Z" fill="#d89be9" stroke="#855699" strokeWidth="3" strokeLinejoin="round" />
      <path d="m29 54 22 20m-27-6 13 11m1-49 38 35" stroke="#ffe9ac" strokeWidth="8" />
      <ellipse cx="57" cy="47" rx="12" ry="26" transform="rotate(-46 57 47)" fill="#945db4" stroke="#855699" strokeWidth="3" />
      <path d="M61 30q-8-25 6-22m3 39q27-15 20-24M53 29q1-20-13-20" fill="none" stroke="#7bbcd5" strokeWidth="5" strokeLinecap="round" />
      <path d="m78 13 6-5 4 9-6 4m-51 0-6-6 6-4 6 7m37 45 8-4 3 8-8 4" fill="#efba55" /><circle cx="90" cy="54" r="4" fill="#e88498" /><circle cx="42" cy="12" r="3" fill="#92b77e" />
    </>}
  </svg>;
}

function PropImpact({ kind }: { kind: SocialKind }) {
  if (kind === "tomato" || kind === "water") return <Splash kind={kind} />;
  if (kind === "duck") return <div className="social-duck-flock"><PrankIcon kind="duck" /><i><PrankIcon kind="duck" /></i><b><PrankIcon kind="duck" /></b><em>嘎？</em></div>;
  if (kind === "glove") return <div className="social-glove-bonk"><PrankIcon kind="glove" /><i /><b /></div>;
  return <div className="social-party-pop"><i /><PrankIcon kind="party" /><b>✦</b><em>✧</em></div>;
}

function Splash({ kind }: { kind: SocialKind }) {
  return <svg viewBox="0 0 160 140" aria-hidden="true" className="prank-splash">
    <path d="M43 41C9 9 18 62 37 66 0 70 10 94 39 86 21 122 52 125 62 101 69 145 94 132 97 106c31 24 43-2 20-19 47 0 35-28 10-30 29-31 0-42-23-19C96 1 74 10 70 36 44 7 33 18 43 41Z" fill={kind === "tomato" ? "#f46a54" : "#78c9ef"} stroke={kind === "tomato" ? "#b94335" : "#3c9bce"} strokeWidth="3" />
    {kind === "water" && <path d="M47 57c0-21 14-28 12-48m23 44C76 30 93 28 91 7m15 50c2-15 11-22 14-30" stroke="#b1e7ff" strokeWidth="9" strokeLinecap="round" fill="none" />}
    <ellipse cx="64" cy="65" rx="12" ry="16" fill="#fff9e9" /><ellipse cx="96" cy="65" rx="12" ry="16" fill="#fff9e9" />
    <path d={kind === "tomato" ? "m59 61 10 9m-10 0 10-9m22 0 10 9m-10 0 10-9" : "m58 66 11-4m22 0 11 4"} stroke="#574a50" strokeWidth="3.5" strokeLinecap="round" />
    <path d={kind === "tomato" ? "M68 91q13-12 23 0" : "m66 89 6 5 6-5 6 5 6-5 6 5"} stroke="#574a50" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M50 91v19m61-22v28" stroke={kind === "tomato" ? "#ee765f" : "#84d6f6"} strokeWidth="9" strokeLinecap="round" />
  </svg>;
}

export function useSocialEffects(source: Source, sound: SocialSound) {
  const [active, setActive] = useState<Event | null>(null);
  const cursor = useRef({ code: "", seen: new Set<string>(), paused: false }), audio = useRef(sound), sounded = useRef(new Set<string>());
  audio.current = sound;
  useEffect(() => {
    const events = source?.social?.events || [], code = source?.code || "";
    if (cursor.current.code !== code) { cursor.current = { code, seen: new Set(events.map(e => e.id)), paused: !!source?.pause }; setActive(null); sounded.current.clear(); return; }
    const fresh = events.filter(e => !cursor.current.seen.has(e.id));
    cursor.current.seen = new Set(events.map(e => e.id));
    if (document.hidden) { setActive(null); return; }
    const latest = fresh.filter(e => e.ageMs < SOCIAL_DURATION).at(-1);
    if (latest) setActive(latest);
    else if (cursor.current.paused !== !!source?.pause) setActive(old => events.find(e => e.id === old?.id && e.ageMs < SOCIAL_DURATION) || null);
    else setActive(old=>events.some(e=>e.id===old?.id)?old:null);
    cursor.current.paused = !!source?.pause;
  }, [source?.code, source?.version]);
  useEffect(() => {
    if (!active || source?.pause) return;
    const once = (phase: "launch" | "hit") => { const key = `${active.id}:${phase}`; if (!sounded.current.has(key)) { sounded.current.add(key); audio.current(active.kind, phase); } };
    if (active.ageMs < 400) once("launch");
    const hit = active.ageMs < 950 ? setTimeout(() => once("hit"), Math.max(0, 650 - active.ageMs)) : null;
    const end = setTimeout(() => setActive(null), Math.max(1, SOCIAL_DURATION - active.ageMs));
    if (sounded.current.size > 30) sounded.current = new Set([...sounded.current].slice(-12));
    return () => { if (hit) clearTimeout(hit); clearTimeout(end); };
  }, [active, !!source?.pause]);
  useEffect(() => { const hide = () => { if (document.hidden) setActive(null); }; document.addEventListener("visibilitychange", hide); return () => document.removeEventListener("visibilitychange", hide); }, []);
  return active;
}

export function SocialPicker({ name, busy, waiting, cooldownMs, receivedAt, send }: { name: string; busy: boolean; waiting: boolean; cooldownMs: number; receivedAt: number; send: (kind: SocialKind) => void }) {
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, cooldownMs - (now - receivedAt));
  useEffect(() => { setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 150); return () => clearInterval(timer); }, [cooldownMs, receivedAt]);
  const disabled = busy || waiting || remaining > 0;
  return <div className="social-picker"><p>给 <strong>{name}</strong> 一点小小的震撼。</p><div className="social-props">
    {SOCIAL_KINDS.map(kind => <button key={kind} className={`social-prop prop-${kind}`} disabled={disabled} onClick={() => send(kind)}><PrankIcon kind={kind} /><strong>{PROPS[kind].name}</strong><small>{PROPS[kind].hint}</small></button>)}
  </div><div className="social-picker-note" role="status">{busy ? "准备发射…" : waiting ? "等当前换牌选择或抽牌完成" : remaining > 0 ? `补充弹药中 · ${Math.ceil(remaining / 1000)} 秒` : "点一个，整点活。"}</div></div>;
}

export function SocialAnimation({ event, me, paused }: { event: Event; me?: string; paused: boolean }) {
  const [path, setPath] = useState<CSSProperties>({}), [phase, setPhase] = useState(event.ageMs >= 1000 ? "reaction" : event.ageMs >= 650 ? "hit" : "flight");
  useLayoutEffect(() => {
    const measure = () => {
      const point = (id: string) => { const rect = document.querySelector(`[data-player-id="${CSS.escape(id)}"] .seat-avatar`)?.getBoundingClientRect(); return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 }; };
      const from = point(event.from), target = point(event.to), end = event.kind === "water" ? { x: target.x + 22, y: Math.max(42, target.y - 68) } : target;
      setPath({ "--fx": `${from.x}px`, "--fy": `${from.y}px`, "--mx": `${(from.x + end.x) / 2}px`, "--my": `${Math.max(45, Math.min(from.y, end.y) - Math.min(130, Math.abs(from.x - end.x) * .16 + 60))}px`, "--tx": `${end.x}px`, "--ty": `${end.y}px`, "--hit-x": `${target.x}px`, "--hit-y": `${target.y}px`, "--spring-length": `${Math.hypot(target.x - from.x, target.y - from.y)}px`, "--spring-angle": `${Math.atan2(target.y - from.y, target.x - from.x)}rad`, "--caption-x": `${Math.max(88, Math.min(innerWidth - 88, target.x))}px`, "--caption-y": `${target.y > innerHeight * .58 ? target.y - 104 : target.y + 66}px`, "--social-offset": `${-event.ageMs}ms` } as CSSProperties);
    };
    measure(); const observer = new ResizeObserver(measure), board = document.querySelector(".board"); if (board) observer.observe(board); window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [event.id]);
  useEffect(() => { if (paused) return; const hit = setTimeout(() => setPhase("hit"), Math.max(0, 650 - event.ageMs)), reaction = setTimeout(() => setPhase("reaction"), Math.max(0, 1000 - event.ageMs)); return () => { clearTimeout(hit); clearTimeout(reaction); }; }, [event.id, paused]);
  const self = event.to === me;
  return <div className={`social-stage social-${event.kind}`} style={path} data-paused={paused} data-phase={phase} aria-hidden="true">
    <div className="social-projectile"><PrankIcon kind={event.kind} /></div>
    {event.kind === "glove" && <div className="social-spring"><svg viewBox="0 0 160 24" preserveAspectRatio="none"><path d="m0 12 8-9 8 18 8-18 8 18 8-18 8 18 8-18 8 18 8-18 8 18 8-18 8 18 8-18 8 18 8-18 8 18 8-18 8 18 8-18 8 9" /></svg></div>}
    {event.kind === "water" && <div className="social-water-stream"><i /><i /><i /></div>}
    <div className="social-impact"><PropImpact kind={event.kind} /><div className="social-stars">✦<i>✦</i><b>✧</b></div>{Array.from({ length: event.kind === "party" ? 18 : 9 }, (_, i) => <i className="social-droplet" key={i} style={{ "--drop-x": `${Math.cos(i * Math.PI / (event.kind === "party" ? 9 : 4.5)) * (60 + i % 3 * 15) * (event.kind === "party" ? 1.6 : 1)}px`, "--drop-y": `${Math.sin(i * Math.PI / (event.kind === "party" ? 9 : 4.5)) * (event.kind === "party" ? 95 : 55) + 20}px`, "--drop-rotate": `${i * 41}deg` } as CSSProperties} />)}</div>
    <div className="social-caption"><strong>{PROPS[event.kind].bang}</strong><span>{self ? PROPS[event.kind].self : `${event.toName} ${PROPS[event.kind].reaction}`}</span><small>来自 {event.from === me ? "你" : event.fromName} 的{PROPS[event.kind].gift}</small></div>
  </div>;
}
