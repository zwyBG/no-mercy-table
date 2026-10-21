"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cardLabel, type Card } from "@/lib/game";

type Gesture = { id: string; x: number; y: number; touch: boolean; sorting: boolean; moved: boolean; scrollLeft: number; timer?: ReturnType<typeof setTimeout> };
export function OwnHand({ cards, layout, selected, selectedIds = [], playable, jumpable = [], disabled, renderCard, onSelect, onReorder, onCommit, onMove, motion = "", animationOffset = 0, outgoingId, incomingIds = [] }: {
  cards: Card[]; layout: "flat" | "overlap"; selected: string | null; selectedIds?: string[]; playable: string[]; jumpable?: string[]; disabled: boolean; renderCard: (card: Card) => ReactNode;
  onSelect: (id: string) => void; onReorder: (id: string, target: string) => void; onCommit: () => void; onMove: (id: string, delta: number) => void; motion?: string; animationOffset?: number; outgoingId?: string; incomingIds?: string[];
}) {
  const root = useRef<HTMLDivElement>(null), gesture = useRef<Gesture | null>(null);
  const [width, setWidth] = useState(320), [cardWidth, setCardWidth] = useState(72), [hover, setHover] = useState<string | null>(null), [dragging, setDragging] = useState<string | null>(null);
  const step = cards.length > 1 ? Math.max(0, Math.min(cardWidth / 2, (width - cardWidth - 24) / (cards.length - 1))) : 0;
  const inset = (width - cardWidth - Math.max(0, cards.length - 1) * step) / 2, active = hover || selected;
  const isSelected = (id: string) => selected === id || selectedIds.includes(id);
  useEffect(() => { const el = root.current; if (!el) return; const resize = () => {
    if (el.closest(".hand-tray") && el.clientHeight > 0) {
      const height = Math.max(42, Math.min(132, el.clientHeight - 30)); el.style.setProperty("--own-card-height", `${height}px`); el.style.setProperty("--own-card-width", `${Math.round(height * .69)}px`);
    }
    setWidth(el.clientWidth); setCardWidth(parseFloat(getComputedStyle(el).getPropertyValue("--own-card-width")) || 72);
  }; resize(); const observer = new ResizeObserver(resize); observer.observe(el); return () => observer.disconnect(); }, []);
  useEffect(() => () => { if (gesture.current?.timer) clearTimeout(gesture.current.timer); }, []);
  useEffect(() => { if (hover && !cards.some(c => c.id === hover)) setHover(null); }, [cards, hover]);
  useLayoutEffect(() => {
    const el = root.current; if (!el || !motion) return;
    const centerX = el.scrollLeft + el.clientWidth / 2, centerY = el.closest(".hand-tray") ? el.clientHeight / 2 : (layout === "overlap" ? 48 : 8) + (parseFloat(getComputedStyle(el).getPropertyValue("--own-card-height")) || 105) / 2;
    for (const card of el.querySelectorAll<HTMLElement>(".hand-card")) { card.style.setProperty("--gather-x", `${centerX - card.offsetLeft - card.offsetWidth / 2}px`); card.style.setProperty("--gather-y", `${centerY - card.offsetTop - card.offsetHeight / 2}px`); }
  }, [motion, cards.map(c => c.id).join(","), layout, width]);
  const under = (x: number, y: number) => {
    if (layout === "overlap") { const i = step ? Math.floor((x - (root.current?.getBoundingClientRect().left || 0) - inset) / step) : 0; return cards[Math.max(0, Math.min(cards.length - 1, i))]?.id; }
    return document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
  };
  return <div ref={root} className={`hand-cards own-hand-${layout} ${motion}`} style={{ "--exchange-offset": `${-animationOffset}ms` } as CSSProperties} aria-label="你的手牌，可拖动排序"
    onPointerDown={e => {
      if (disabled || e.button !== 0) return; const id = under(e.clientX, e.clientY); if (!id) return;
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      const g: Gesture = { id, x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse", sorting: false, moved: false, scrollLeft: e.currentTarget.scrollLeft }; gesture.current = g; setHover(id);
      if (g.touch) g.timer = setTimeout(() => { if (gesture.current === g && !g.moved) { g.sorting = true; setDragging(id); } }, 360);
    }}
    onPointerMove={e => {
      if (disabled) return; const g = gesture.current, target = under(e.clientX, e.clientY);
      if (!g) { if (layout === "overlap" && e.pointerType === "mouse") setHover(target || null); return; }
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 7) { g.moved = true; if (g.timer) clearTimeout(g.timer); if (!g.touch) { g.sorting = true; setDragging(g.id); } }
      if (g.sorting) { setHover(g.id); if (target && target !== g.id) onReorder(g.id, target); }
      else if (g.touch && layout === "flat" && g.moved) { e.currentTarget.scrollLeft = g.scrollLeft - (e.clientX - g.x); setHover(null); }
      else setHover(target || g.id);
    }}
    onPointerUp={e => {
      const g = gesture.current; if (!g) return; if (g.timer) clearTimeout(g.timer); gesture.current = null;
      if (g.sorting && g.moved) onCommit(); else if (!g.sorting && !(g.touch && layout === "flat" && g.moved)) { const id = under(e.clientX, e.clientY); if (id) onSelect(id); }
      setDragging(null); setHover(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    }}
    onPointerCancel={() => { const g = gesture.current; if (g?.timer) clearTimeout(g.timer); if (g?.sorting && g.moved) onCommit(); gesture.current = null; setDragging(null); setHover(null); }}
    onPointerLeave={() => { if (!gesture.current) setHover(null); }}>
    {cards.map((c, i) => <button key={c.id} data-card-id={c.id} data-magnified={layout === "overlap" && active === c.id} className={`hand-card ${isSelected(c.id) ? "selected-card" : ""} ${playable.includes(c.id) ? "playable" : ""} ${jumpable.includes(c.id) ? "jumpable" : ""} ${dragging === c.id ? "dragging" : ""} ${layout === "overlap" && active === c.id ? "hand-hovered" : ""} ${outgoingId === c.id ? "hand-card-leaving" : ""} ${incomingIds.includes(c.id) ? "hand-card-arriving" : ""}`} disabled={disabled} aria-label={`${cardLabel(c)}${jumpable.includes(c.id) ? "，可以抢出" : ""}${isSelected(c.id) ? "，已选中" : ""}`} aria-pressed={isSelected(c.id)}
      style={{ left: layout === "overlap" ? `${inset + i * step}px` : undefined, zIndex: dragging === c.id ? 200 : active === c.id ? 100 : i, "--fan-tilt": `${cards.length > 1 ? (i / (cards.length - 1) - .5) * 6 : 0}deg` } as CSSProperties}
      onClick={e => { if (e.detail === 0) onSelect(c.id); }} onFocus={() => { if (layout === "overlap") setHover(c.id); }} onBlur={() => setHover(null)}
      onKeyDown={e => { if (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); onMove(c.id, e.key === "ArrowRight" ? 1 : -1); } }}>{renderCard(c)}</button>)}
  </div>;
}
