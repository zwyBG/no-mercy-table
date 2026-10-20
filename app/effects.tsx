"use client";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const EFFECTS: Record<string, { title: string; symbol: string; voice: string; tone: string; notes: number[] }> = {
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
type Event = { id: number; text: string; effect?: string };
type Source = { code: string; version: number; logs: Event[]; game?: { deal?: { dealt: number } | null; drawing?: { drawn: number } | null } | null } | null;
type Visual = { id: number; kind: string } | null;

export function useTableEffects(source: Source) {
  const [sound, setSound] = useState(true), [visual, setVisual] = useState<Visual>(null);
  const context = useRef<AudioContext | null>(null), enabled = useRef(true), baseline = useRef<{ code: string; last: number } | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buffers = useRef(new Map<string, AudioBuffer>()), loading = useRef(false), activeVoices = useRef<AudioBufferSourceNode[]>([]), progress = useRef({ code: "", dealt: 0, drawn: 0 }), generation = useRef(0);
  enabled.current = sound;
  const loadVoices = () => {
    const audio = context.current; if (!audio || loading.current || Object.values(VOICES).every(name => buffers.current.has(name))) return;
    loading.current = true;
    void Promise.allSettled([...new Set(Object.values(VOICES))].filter(name => !buffers.current.has(name)).map(async name => {
      const response = await fetch(`/audio/${name}.wav`); if (!response.ok) return;
      const buffer = await audio.decodeAudioData(await response.arrayBuffer()); buffers.current.set(name, buffer);
    })).finally(() => { loading.current = false; });
  };
  const unlock = () => {
    if (!enabled.current) return;
    try {
      const Constructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Constructor) { if (!context.current || context.current.state === "closed") context.current = new Constructor(); if (context.current.state === "suspended") void context.current.resume().catch(() => {}); }
      loadVoices();
    } catch { /* Visual effects remain available when audio is unavailable. */ }
  };
  useEffect(() => {
    setSound(localStorage.getItem("mercy-sound") !== "off");
    const onGesture = () => unlock(); document.addEventListener("pointerdown", onGesture); document.addEventListener("keydown", onGesture);
    return () => { document.removeEventListener("pointerdown", onGesture); document.removeEventListener("keydown", onGesture); if (timer.current) clearTimeout(timer.current); void context.current?.close().catch(() => {}); };
  }, []);
  const play = (kind: string) => {
    if (!enabled.current) return;
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
        for (const old of activeVoices.current) { try { old.stop(); } catch {} } activeVoices.current = [];
        const voice = audio.createBufferSource(), gain = audio.createGain(), compressor = audio.createDynamicsCompressor();
        voice.buffer = buffer; voice.playbackRate.value = .92;
        gain.gain.value = .9; compressor.threshold.value = -18; compressor.ratio.value = 5;
        voice.connect(compressor); compressor.connect(gain); gain.connect(audio.destination);
        const echo = audio.createDelay(.5), echoGain = audio.createGain(); echo.delayTime.value = .105; echoGain.gain.value = .11; compressor.connect(echo); echo.connect(echoGain); echoGain.connect(gain);
        activeVoices.current.push(voice); voice.start(audio.currentTime + .035); voice.onended = () => { voice.disconnect(); gain.disconnect(); compressor.disconnect(); echo.disconnect(); echoGain.disconnect(); activeVoices.current = activeVoices.current.filter(v => v !== voice); };
      }
    }
  };
  useEffect(() => {
    if (!source) { baseline.current = null; return; }
    const dealt = source.game?.deal?.dealt || 0, drawn = source.game?.drawing?.drawn || 0;
    if (progress.current.code === source.code && (dealt > progress.current.dealt || drawn > progress.current.drawn)) play("take");
    progress.current = { code: source.code, dealt, drawn };
    const last = source.logs.at(-1)?.id || 0;
    if (!baseline.current || baseline.current.code !== source.code) { baseline.current = { code: source.code, last }; return; }
    const recent = source.logs.filter(event => event.id > baseline.current!.last && event.effect);
    baseline.current.last = last;
    const event = recent.find(e => e.effect === "win") || [...recent].reverse().find(e => EFFECTS[e.effect!]) || recent.at(-1);
    if (!event) return;
    play(event.effect!);
    if (EFFECTS[event.effect!]) {
      if (timer.current) clearTimeout(timer.current); setVisual({ id: event.id, kind: event.effect! });
      timer.current = setTimeout(() => setVisual(null), event.effect === "draw10" || event.effect === "win" ? 1550 : 1200);
    }
  }, [source?.code, source?.version]);
  const toggle = () => {
    const next = !enabled.current; enabled.current = next; setSound(next); localStorage.setItem("mercy-sound", next ? "on" : "off");
    if (next) { unlock(); play("take"); } else { generation.current++; for (const voice of activeVoices.current) { try { voice.stop(); } catch {} } activeVoices.current = []; }
  };
  const preview = async () => { unlock(); const gen = generation.current;
    if (context.current && !buffers.current.has("announcer-add-ten") && enabled.current) { try { const res = await fetch("/audio/announcer-add-ten.wav"); if (res.ok) buffers.current.set("announcer-add-ten", await context.current.decodeAudioData(await res.arrayBuffer())); } catch {} }
    if (gen !== generation.current) return; play("draw10"); setVisual({ id: Date.now(), kind: "draw10" }); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setVisual(null), 1550); };
  return { visual, sound, toggle, preview };
}

export function SoundSwitch({ on, toggle }: { on: boolean; toggle: () => void }) {
  return <button className="quiet-button sound-switch" onClick={toggle} aria-pressed={on} aria-label={on ? "关闭音效" : "开启音效"}>{on ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>{on ? "音效开" : "音效关"}</span></button>;
}
export function ActionEffect({ visual }: { visual: Visual }) {
  if (!visual) return null;
  const effect = EFFECTS[visual.kind]; if (!effect) return null;
  return <div key={visual.id} className={`fx-stage fx-${effect.tone} fx-kind-${visual.kind}`} aria-hidden="true"><div className="fx-flash" /><div className="fx-speed-lines" /><div className="fx-shockwave" /><div className="fx-screen-word">{effect.title}</div><div className="action-fx"><div className="fx-ring" /><div className="fx-ring second-ring" /><div className="fx-burst">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ "--angle": `${i * 360 / 24}deg`, "--distance": `${150 + i % 4 * 38}px`, "--delay": `${i % 4 * 13}ms` } as React.CSSProperties} />)}</div><div className="fx-stamp"><strong>{effect.symbol}</strong><span>{effect.title}</span></div></div></div>;
}
