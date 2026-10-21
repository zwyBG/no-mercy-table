"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { EffectQueue, effectDuration, type AttackCue, type JumpCue } from "@/lib/presentation";
import type { SocialKind } from "@/lib/social";

const EFFECTS: Record<string, { title: string; symbol: string; voice: string; tone: string; notes: number[] }> = {
  batch: { title: "SAME CARD COMBO!", symbol: "×", voice: "", tone: "gold", notes: [330, 440, 659] },
  jump: { title: "JUMP IN!", symbol: "ϟ", voice: "", tone: "gold", notes: [330, 494, 659] },
  finish: { title: "手牌清空！其他人继续", symbol: "SAFE!", voice: "", tone: "gold", notes: [392, 523, 659] },
  end: { title: "本局排位结束！", symbol: "GG!", voice: "", tone: "purple", notes: [392, 330, 262] },
  begin: { title: "LET’S GO!", symbol: "GO!", voice: "", tone: "orange", notes: [131, 262, 392] },
  draw2: { title: "ADD TWO!", symbol: "+2", voice: "Add two!", tone: "blue", notes: [220, 330, 440] },
  draw4: { title: "ADD FOUR!", symbol: "+4", voice: "Add four!", tone: "orange", notes: [131, 196, 262, 392] },
  reverse4: { title: "REVERSE · ADD FOUR!", symbol: "+4", voice: "Reverse! Add four!", tone: "purple", notes: [392, 262, 196, 131] },
  draw6: { title: "ADD SIX!", symbol: "+6", voice: "Add six!", tone: "purple", notes: [110, 165, 220, 330, 440] },
  draw10: { title: "ADD TEN!", symbol: "+10", voice: "Add ten!", tone: "red", notes: [82, 123, 165, 247, 330, 494] },
  skip: { title: "SKIPPED!", symbol: "⊘", voice: "Skip!", tone: "orange", notes: [440, 220] },
  reverse: { title: "REVERSE!", symbol: "⇄", voice: "Reverse!", tone: "blue", notes: [262, 392, 330, 220] },
  skipall: { title: "MY TURN, AGAIN!", symbol: "↻", voice: "My turn again!", tone: "purple", notes: [330, 440, 659] },
  discard: { title: "CLEAR THE DECK!", symbol: "≋", voice: "Clear!", tone: "blue", notes: [659, 523, 392, 262] },
  roulette: { title: "COLOR ROULETTE!", symbol: "?", voice: "Color roulette!", tone: "rainbow", notes: [262, 330, 392, 523, 659] },
  seven: { title: "SEVEN · YOUR CHOICE!", symbol: "7", voice: "Seven!", tone: "purple", notes: [523, 659, 784] },
  zero: { title: "PASS IT ON!", symbol: "0", voice: "Pass it on!", tone: "blue", notes: [523, 440, 330, 262] },
  uno: { title: "ONE CARD LEFT!", symbol: "UNO!", voice: "Uno!", tone: "red", notes: [392, 523, 784] },
  win: { title: "YOU GOT IT!", symbol: "WIN!", voice: "Winner!", tone: "gold", notes: [262, 330, 392, 523, 659, 784] },
  out: { title: "25 · NO MERCY!", symbol: "OUT!", voice: "No mercy!", tone: "red", notes: [262, 196, 131] },
  penalty: { title: "TAKE THE HIT!", symbol: "+", voice: "", tone: "orange", notes: [180, 120] },
};
const VOICES: Record<string, string> = { draw2: "announcer-add-two", draw4: "announcer-add-four", reverse4: "announcer-reverse-four", draw6: "announcer-add-six", draw10: "announcer-add-ten", skip: "announcer-skip", reverse: "announcer-reverse", skipall: "announcer-skip-all", discard: "announcer-discard", roulette: "announcer-roulette", seven: "announcer-seven", zero: "announcer-zero", uno: "announcer-uno", win: "announcer-win", out: "announcer-out", penalty: "announcer-penalty", begin: "announcer-begin" };
type Source = { code: string; version: number; logs: import("@/lib/presentation").EffectEvent[]; pause?: unknown; social?:{events:{id:string}[]}; game?: { round?: number; transfer?: unknown; deal?: { dealt: number } | null; drawing?: { drawn: number } | null } | null } | null;
export type Visual = { id: number; kind: string; text: string; cue?: AttackCue; jump?: JumpCue; copies?: number; duration: number } | null;

export function useTableEffects(source: Source) {
  const [sound, setSound] = useState(true), [shake, setShake] = useState(1), [visual, setVisual] = useState<Visual>(null);
  const [pendingCount, setPendingCount] = useState(0), [completed, setCompleted] = useState(0);
  const context = useRef<AudioContext | null>(null), enabled = useRef(true), queue = useRef(new EffectQueue());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), clock = useRef({ started: 0, remaining: 0 });
  const buffers = useRef(new Map<string, AudioBuffer>()), loading = useRef(false), activeVoices = useRef<AudioBufferSourceNode[]>([]);
  const progress = useRef({ code: "", dealt: 0, drawn: 0 }), generation = useRef(0), blocked = useRef(false), paused = useRef(false);
  const pumpRef = useRef<() => void>(() => {});
  const priorPlayback = useRef({social:"",paused:false});
  enabled.current = sound; blocked.current = false; paused.current = !!source?.pause;
  const stopVoices = () => { for (const voice of activeVoices.current) { try { voice.stop(); } catch {} } activeVoices.current = []; };
  const loadVoices = () => {
    const audio = context.current; if (!audio || loading.current || Object.values(VOICES).every(name => buffers.current.has(name))) return;
    loading.current = true;
    void Promise.allSettled([...new Set(Object.values(VOICES))].filter(name => !buffers.current.has(name)).map(async name => {
      const response = await fetch(`/audio/${name}.wav`); if (!response.ok) return;
      buffers.current.set(name, await audio.decodeAudioData(await response.arrayBuffer()));
    })).finally(() => { loading.current = false; });
  };
  const unlock = () => {
    if (!enabled.current || paused.current) return;
    try {
      const Constructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Constructor) { if (!context.current || context.current.state === "closed") context.current = new Constructor(); if (context.current.state === "suspended") void context.current.resume().catch(() => {}); }
      loadVoices();
    } catch { /* Visuals remain available without Web Audio. */ }
  };
  useEffect(() => {
    setSound(localStorage.getItem("mercy-sound") !== "off");
    const saved = Number(localStorage.getItem("mercy-shake") ?? "1"); setShake([0, .45, 1, 1.5].includes(saved) ? saved : 1);
    const onGesture = () => unlock(); document.addEventListener("pointerdown", onGesture); document.addEventListener("keydown", onGesture);
    return () => { document.removeEventListener("pointerdown", onGesture); document.removeEventListener("keydown", onGesture); if (timer.current) clearTimeout(timer.current); stopVoices(); void context.current?.close().catch(() => {}); };
  }, []);
  const play = (kind: string) => {
    if (!enabled.current) return 0;
    const effect = EFFECTS[kind]; const audio = context.current;
    if (audio && audio.state === "running") {
      const notes = effect?.notes || (kind === "take" ? [440, 660] : [700]);
      for (const [index, frequency] of notes.entries()) {
        const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + index * .065;
        oscillator.type = kind.startsWith("draw") || kind === "penalty" ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(frequency, start); oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.12, start + .11);
        gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(kind === "play" ? .018 : .055, start + .008); gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
        oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .17);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      }
      if (kind.startsWith("draw") || kind === "reverse4" || kind === "out" || kind === "win") {
        const bass = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime;
        bass.type = "sine"; bass.frequency.setValueAtTime(kind === "draw10" ? 92 : 140, start); bass.frequency.exponentialRampToValueAtTime(30, start + .4);
        gain.gain.setValueAtTime(.24, start); gain.gain.exponentialRampToValueAtTime(.0001, start + .5); bass.connect(gain); gain.connect(audio.destination); bass.start(start); bass.stop(start + .51); bass.onended = () => { bass.disconnect(); gain.disconnect(); };
      }
      const buffer = buffers.current.get(VOICES[kind]);
      if (buffer) {
        const voice = audio.createBufferSource(), gain = audio.createGain(), compressor = audio.createDynamicsCompressor();
        voice.buffer = buffer; voice.playbackRate.value = .92;
        gain.gain.value = .9; compressor.threshold.value = -18; compressor.ratio.value = 5;
        voice.connect(compressor); compressor.connect(gain); gain.connect(audio.destination);
        const echo = audio.createDelay(.5), echoGain = audio.createGain(); echo.delayTime.value = .105; echoGain.gain.value = .11; compressor.connect(echo); echo.connect(echoGain); echoGain.connect(gain);
        activeVoices.current.push(voice); voice.start(audio.currentTime + .035); voice.onended = () => { voice.disconnect(); gain.disconnect(); compressor.disconnect(); echo.disconnect(); echoGain.disconnect(); activeVoices.current = activeVoices.current.filter(v => v !== voice); };
      }
      return buffer ? buffer.duration / .92 * 1000 + 150 : 0;
    }
    return 0;
  };
  const playSocial = (kind: SocialKind, phase: "launch" | "hit") => {
    const audio = context.current; if (!enabled.current || paused.current || !audio || audio.state !== "running" || document.hidden) return;
    const start = audio.currentTime, duration = phase === "launch" ? .22 : kind === "water" ? .56 : kind === "duck" ? .12 : .18;
    const noise = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate), samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
    noise.buffer = buffer; filter.type = "lowpass"; filter.frequency.setValueAtTime(phase === "launch" ? 1900 : kind === "water" ? 2600 : 650, start); filter.frequency.exponentialRampToValueAtTime(phase === "launch" ? 400 : 180, start + duration);
    gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(phase === "launch" ? .09 : .2, start + .02); gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    noise.connect(filter); filter.connect(gain); gain.connect(audio.destination); noise.start(start); noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
    if (phase === "hit") for (let i = 0; i < (["water", "party"].includes(kind) ? 4 : kind === "duck" ? 3 : 2); i++) {
      const oscillator = audio.createOscillator(), volume = audio.createGain(), at = start + i * .085;
      oscillator.type = kind === "duck" ? "sawtooth" : kind === "party" || kind === "glove" ? "triangle" : "sine";
      const frequency = kind === "party" ? [523, 659, 784, 1047][i] : kind === "duck" ? [330, 420, 290][i] : kind === "glove" ? [170, 530][i] : kind === "water" ? 820 - i * 110 : i ? 490 : 130;
      oscillator.frequency.setValueAtTime(frequency, at); if (kind === "glove") oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.8, at + .05); oscillator.frequency.exponentialRampToValueAtTime(kind === "party" ? frequency : kind === "duck" ? 180 : kind === "water" ? 210 : i ? 145 : 48, at + .19);
      volume.gain.setValueAtTime(.001, at); volume.gain.exponentialRampToValueAtTime(kind === "duck" ? .045 : .12, at + .01); volume.gain.exponentialRampToValueAtTime(.0001, at + .24);
      oscillator.connect(volume); volume.connect(audio.destination); oscillator.start(at); oscillator.stop(at + .25); oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    }
  };
  const finish = () => {
    const event = queue.current.complete(); timer.current = null; clock.current.remaining = 0;
    if (event && event.id > 0) setCompleted(n => Math.max(n, event.id));
    setVisual(null); setPendingCount(queue.current.pending.length); pumpRef.current();
  };
  const arm = (duration: number) => { clock.current = { started: Date.now(), remaining: duration }; timer.current = setTimeout(finish, duration); };
  pumpRef.current = () => {
    if (paused.current || blocked.current || queue.current.active) return;
    const event = queue.current.next(); if (!event) { setPendingCount(0); return; }
    const kind = event.effect || "play", voiceDuration = play(kind);
    const duration = Math.max(effectDuration(kind), voiceDuration);
    setVisual(EFFECTS[kind] ? { id: event.id, kind, text: event.text, cue: event.cue, jump: event.jump, copies: event.copies, duration } : null);
    setPendingCount(queue.current.pending.length + 1); arm(duration);
  };
  useEffect(() => {
    if (!source) { queue.current = new EffectQueue(); if (timer.current) clearTimeout(timer.current); timer.current = null; stopVoices(); setVisual(null); setPendingCount(0); return; }
    const previous=queue.current.active, priorLog=queue.current.last;
    const reset = queue.current.sync(source.code, source.logs), social=source.social?.events.at(-1)?.id||"";
    const newSocial=!!social&&social!==priorPlayback.current.social&&!reset, pauseChanged=priorPlayback.current.paused!==!!source.pause;
    priorPlayback.current={social,paused:!!source.pause};
    if(newSocial) queue.current.clear();
    if(previous&&!pauseChanged&&queue.current.last>priorLog&&queue.current.active===previous) queue.current.active=null;
    if (document.hidden) { if (timer.current) clearTimeout(timer.current); timer.current = null; queue.current.clear(); stopVoices(); setVisual(null); setPendingCount(0); setCompleted(queue.current.last); return; }
    if (reset || newSocial || previous && previous !== queue.current.active) { if (timer.current) clearTimeout(timer.current); timer.current = null; stopVoices(); setVisual(null); setCompleted(previous?.id || queue.current.last); }
    const dealt = source.game?.deal?.dealt || 0, drawn = source.game?.drawing?.drawn || 0;
    if (!paused.current && !queue.current.active && progress.current.code === source.code && (dealt > progress.current.dealt || drawn > progress.current.drawn)) play("take");
    progress.current = { code: source.code, dealt, drawn };
    setPendingCount(queue.current.pending.length + (queue.current.active ? 1 : 0)); pumpRef.current();
  }, [source?.code, source?.version]);
  useEffect(() => {
    if (paused.current) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; clock.current.remaining = Math.max(1, clock.current.remaining - (Date.now() - clock.current.started)); }
      if (context.current?.state === "running") void context.current.suspend().catch(() => {});
    } else {
      if (context.current?.state === "suspended" && enabled.current) void context.current.resume().catch(() => {});
      if (queue.current.active && !timer.current) arm(clock.current.remaining || 1); else pumpRef.current();
    }
  }, [!!source?.pause]);
  const toggle = () => {
    const next = !enabled.current; enabled.current = next; setSound(next); localStorage.setItem("mercy-sound", next ? "on" : "off");
    if (next) { unlock(); play("take"); } else { generation.current++; stopVoices(); }
  };
  const preview = async () => {
    unlock(); const gen = generation.current;
    if (context.current && !buffers.current.has("announcer-add-ten") && enabled.current) { try { const res = await fetch("/audio/announcer-add-ten.wav"); if (res.ok) buffers.current.set("announcer-add-ten", await context.current.decodeAudioData(await res.arrayBuffer())); } catch {} }
    if (gen !== generation.current) return;
    skip(); queue.current.pending.push({ id: -Date.now(), text: "特效预览 · 累计罚抽 16 张", effect: "draw10", cue: source?.logs.findLast(e => e.effect === "draw10" && e.cue)?.cue || { from: "preview-a", to: "preview-b", fromName: "你", toName: "下一家", amount: 10, total: 16, chain: [2, 4, 10] } }); setPendingCount(1); pumpRef.current();
  };
  const skip = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; queue.current.clear(); stopVoices(); setVisual(null); setPendingCount(0); setCompleted(queue.current.last); };
  useEffect(() => { const hide = () => { if (document.hidden) skip(); }; document.addEventListener("visibilitychange", hide); return () => document.removeEventListener("visibilitychange", hide); }, []);
  const changeShake = (value: number) => { setShake(value); localStorage.setItem("mercy-shake", String(value)); };
  const latestEffect = source?.logs.findLast(e => e.effect)?.id || 0;
  return { visual, sound, toggle, preview, shake, changeShake, pendingCount, skip, playSocial, caughtUp: completed >= latestEffect, paused: !!source?.pause };
}

export function SoundSwitch({ on, toggle }: { on: boolean; toggle: () => void }) {
  return <button className="quiet-button sound-switch" onClick={toggle} aria-pressed={on} aria-label={on ? "关闭音效" : "开启音效"}>{on ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>{on ? "音效开" : "音效关"}</span></button>;
}
function AttackFlight({ cue }: { cue: AttackCue }) {
  const [path, setPath] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const point = (id: string, fallback: number) => {
      const r = document.querySelector<HTMLElement>(`[data-player-id="${id}"] .seat-avatar`)?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth * fallback, y: innerHeight * .35 };
    };
    const from = point(cue.from, .25), to = point(cue.to, .75);
    setPath({ "--attack-x": `${from.x}px`, "--attack-y": `${from.y}px`, "--hit-x": `${to.x}px`, "--hit-y": `${to.y}px`, "--arc-x": `${(from.x + to.x) / 2}px`, "--arc-y": `${Math.min(from.y, to.y) - 80}px` } as CSSProperties);
  }, [cue]);
  return <div className={`attack-flight-layer ${cue.total >= 16 ? "attack-overload" : ""}`} style={path}><div className="attack-projectile"><i /><strong>+{cue.amount}</strong></div><div className="attack-impact"><i /><i /><b>+{cue.total}</b></div></div>;
}
export function ActionEffect({ visual, paused = false, me }: { visual: Visual; paused?: boolean; me?: string }) {
  if (!visual) return null;
  const effect = EFFECTS[visual.kind]; if (!effect) return null;
  return <div key={visual.id} data-effect-id={visual.id} data-paused={paused} className={`fx-stage fx-${effect.tone} fx-kind-${visual.kind} ${visual.cue ? "fx-attack" : ""}`} style={{ "--fx-duration": `${visual.duration}ms` } as CSSProperties} aria-hidden="true">
    <div className="fx-flash" /><div className="fx-speed-lines" /><div className="fx-shockwave" /><div className="fx-screen-word">{effect.title}</div>
    {visual.cue && <AttackFlight cue={visual.cue} />}
    {visual.jump && <div className="fx-jump-caption"><b>ϟ 抢出！</b><span>{visual.jump.toName}</span><span>{visual.jump.from === visual.jump.to ? "连续抢出" : `抢在 ${visual.jump.fromName} 之后`}</span></div>}
    <div className="action-fx"><div className="fx-ring" /><div className="fx-ring second-ring" /><div className="fx-burst">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ "--angle": `${i * 360 / 24}deg`, "--distance": `${150 + i % 4 * 38}px`, "--delay": `${i % 4 * 13}ms` } as CSSProperties} />)}</div><div className="fx-stamp"><strong>{visual.kind === "batch" ? `×${visual.copies || 2}` : effect.symbol}</strong><span>{effect.title}</span>{(visual.copies || 0) > 1 && <small className="batch-fx-count">同牌 ×{visual.copies} · 功能只生效一次</small>}</div></div>
    {visual.cue ? <div className="attack-story"><div><span>{visual.cue.fromName}</span><b>➜</b><span>{visual.cue.toName}</span></div><strong>{visual.cue.from === visual.cue.to ? visual.cue.to === me ? "反转回自己！" : "反转回出牌者！" : visual.cue.to === me ? "这波冲你来的！" : "加牌已送达！"}</strong><p>{visual.cue.chain.map((n, i) => <span key={i}>{i > 0 && <i> → </i>}+{n}</span>)}<b> = {visual.cue.total} 张</b></p></div> : <div className="effect-caption">{visual.text}</div>}
  </div>;
}
