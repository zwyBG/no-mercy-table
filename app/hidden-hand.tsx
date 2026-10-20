"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Hand, Layers, LayoutGrid } from "lucide-react";

export function HiddenHand({ count, busy, children, onConfirm }: { count: number; busy: boolean; children: ReactNode; onConfirm: (index: number) => void }) {
  const row = useRef<HTMLDivElement>(null), down = useRef(false);
  const [width, setWidth] = useState(320), [selected, setSelected] = useState<number | null>(null), [hover, setHover] = useState<number | null>(null);
  const [layout, setLayout] = useState<"overlap" | "grid">("overlap");
  const cardWidth = 70, step = count > 1 ? Math.max(0, Math.min(35, (width - cardWidth) / (count - 1))) : 0;
  const inset = (width - cardWidth - step * (count - 1)) / 2;
  const active = hover ?? selected;
  useEffect(() => {
    setLayout(localStorage.getItem("mercy-pick-layout") === "grid" ? "grid" : "overlap");
    const el = row.current; if (!el) return;
    const resize = () => setWidth(el.clientWidth); resize();
    const observer = new ResizeObserver(resize); observer.observe(el); return () => observer.disconnect();
  }, []);
  useEffect(() => { setSelected(null); setHover(null); }, [count]);
  const at = (clientX: number) => {
    const x = clientX - (row.current?.getBoundingClientRect().left || 0) - inset;
    return Math.max(0, Math.min(count - 1, step ? Math.floor(x / step) : 0));
  };
  const changeLayout = (next: "overlap" | "grid") => { setLayout(next); setHover(null); localStorage.setItem("mercy-pick-layout", next); };
  return <div className="hidden-hand-picker">
    <div className="pick-layout" aria-label="抽牌显示方式"><button aria-pressed={layout === "overlap"} onClick={() => changeLayout("overlap")}><Layers size={14} />重叠手牌</button><button aria-pressed={layout === "grid"} onClick={() => changeLayout("grid")}><LayoutGrid size={14} />逐张平铺</button></div>
    <div className={`dock-hand ${layout === "grid" ? "dock-grid" : ""}`} ref={row} role="listbox" aria-label="对方的手牌，只显示牌背" aria-orientation={layout === "overlap" ? "horizontal" : undefined}
      onPointerDown={e => { if (layout === "grid" || busy || !count || e.button !== 0) return; e.preventDefault(); down.current = true; e.currentTarget.setPointerCapture(e.pointerId); setHover(at(e.clientX)); }}
      onPointerMove={e => { if (layout === "overlap" && !busy && count && (e.pointerType === "mouse" || down.current)) setHover(at(e.clientX)); }}
      onPointerLeave={e => { if (e.pointerType === "mouse" && !down.current) setHover(null); }}
      onPointerUp={e => { if (!down.current) return; down.current = false; setSelected(at(e.clientX)); setHover(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { down.current = false; setHover(null); }}
      onKeyDown={e => {
        if (busy || !count || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault(); const next = e.key === "Home" ? 0 : e.key === "End" ? count - 1 : Math.max(0, Math.min(count - 1, (selected ?? 0) + (e.key === "ArrowRight" ? 1 : -1)));
        setSelected(next); setHover(null); row.current?.querySelector<HTMLButtonElement>(`[data-pick-index="${next}"]`)?.focus();
      }}>
      {Array.from({ length: count }, (_, i) => <button key={i} type="button" role="option" data-pick-index={i} data-magnified={active === i} aria-label={`选择第 ${i + 1} 张牌`} aria-selected={selected === i} tabIndex={i === (selected ?? 0) ? 0 : -1} disabled={busy}
        className={`dock-card ${active === i ? "dock-magnified" : ""} ${selected === i ? "dock-selected" : ""}`}
        style={{ left: layout === "overlap" ? `${inset + i * step}px` : undefined, zIndex: active === i ? 100 : i, "--dock-tilt": `${count > 1 ? (i / (count - 1) - .5) * 5 : 0}deg` } as CSSProperties}
        onPointerEnter={() => { if (layout === "grid") setHover(i); }} onPointerLeave={() => { if (layout === "grid") setHover(null); }}
        onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={e => { if (layout === "grid" || e.detail === 0) { setSelected(i); setHover(null); } }}>
        {children}<span className="dock-index">{i + 1}</span>{selected === i && <span className="dock-check"><Check size={12} /></span>}
      </button>)}
    </div>
    <p className="dock-selection" role="status">{selected === null ? <><Hand size={15} />划过放大，点击或抬手选中</> : <>已选第 <strong>{selected + 1}</strong> 张 · 确认后才会抽走</>}</p>
    <button className="primary-button full dock-confirm" disabled={busy || selected === null} onClick={() => { if (selected !== null) onConfirm(selected); }}>确认抽取{selected !== null ? ` · 第 ${selected + 1} 张` : ""}<Check size={16} /></button>
  </div>;
}
