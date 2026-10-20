"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";

type Bounds = { min: number; open: number; max: number; preferred: number };
const initial: Bounds = { min: 54, open: 220, max: 420, preferred: 300 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function HandTray({ children, tools, eliminated, count, myTurn }: { children: ReactNode; tools?: ReactNode; eliminated: boolean; count: number; myTurn: boolean }) {
  const root = useRef<HTMLElement>(null), contentId = useId(), preference = useRef(""), lastExpanded = useRef<number | null>(null);
  const [bounds, setBounds] = useState(initial), [desired, setDesired] = useState<number | null>(null), [collapsed, setCollapsed] = useState(eliminated), [resizing, setResizing] = useState(false);
  const drag = useRef<{ y: number; height: number; current: number } | null>(null);
  const height = collapsed ? bounds.min : clamp(desired ?? bounds.preferred, resizing ? bounds.min : bounds.open, bounds.max);
  const heightRef = useRef(height); heightRef.current = height;
  useLayoutEffect(() => {
    const el = root.current, parent = el?.parentElement; if (!el || !parent) return;
    preference.current = `mercy-tray-height-${matchMedia("(max-width:760px)").matches ? "mobile" : "desktop"}`;
    const saved = Number(localStorage.getItem(preference.current)); if (Number.isFinite(saved) && saved >= 150 && saved <= 1000) { setDesired(saved); lastExpanded.current = saved; }
    const measure = () => {
      const fixed = [...parent.children].filter(child => child !== el && !child.classList.contains("board")).reduce((sum, child) => {
        const style = getComputedStyle(child); return sum + child.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
      }, 0);
      const available = Math.max(180, parent.clientHeight - fixed - 2);
      const min = Math.max(54, 34 + (parseFloat(getComputedStyle(el).paddingBottom) || 0));
      const reserve = Math.min(200, Math.max(110, available * .32)), max = Math.max(min + 70, Math.floor(available - reserve));
      const open = Math.min(220, max), preferred = clamp(Math.round(innerHeight * .36), open, Math.min(330, max));
      setBounds(previous => previous.min === min && previous.max === max && previous.open === open && previous.preferred === preferred ? previous : { min, max, open, preferred });
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(parent);
    for (const child of parent.children) if (child !== el && !child.classList.contains("board")) observer.observe(child);
    window.addEventListener("resize", measure); window.visualViewport?.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("resize", measure); };
  }, []);
  // Keep the 25th-card reveal visible, then make room for spectating.
  useEffect(() => { if (eliminated) { drag.current = null; setResizing(false); setCollapsed(true); } }, [eliminated]);
  const save = (value: number) => { if (preference.current) localStorage.setItem(preference.current, String(Math.round(value))); };
  const settle = (value: number) => {
    setResizing(false);
    if (value < Math.max(bounds.min + 28, bounds.open * .7)) { setCollapsed(true); setDesired(lastExpanded.current); }
    else { const next = clamp(value, bounds.open, bounds.max); lastExpanded.current = next; setCollapsed(false); setDesired(next); save(next); }
  };
  const toggle = () => { if (!collapsed) lastExpanded.current = heightRef.current; else setDesired(lastExpanded.current); setCollapsed(!collapsed); };
  const release = (e: PointerEvent<HTMLDivElement>) => {
    const current = drag.current; if (!current) return;
    drag.current = null; settle(current.current);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  return <section ref={root} className="hand-area hand-tray" data-collapsed={collapsed} data-resizing={resizing} data-compact={height < 260} data-eliminated={eliminated} style={{ "--tray-height": `${height}px` } as CSSProperties} aria-label="手牌栏">
    <div className="hand-tray-rail">
      <div className="hand-tray-grip" role="separator" aria-label="调整手牌栏高度" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((height - bounds.min) / Math.max(1, bounds.max - bounds.min) * 100)} aria-valuetext={collapsed ? eliminated ? "已淘汰，观战中，手牌栏已收起" : `手牌 ${count} 张，已收起` : `高度 ${Math.round(height)} 像素`} aria-controls={contentId} tabIndex={0} title="上下拖动调整高度；方向键调节，Home 收起，End 展开"
        onPointerDown={e => { if (e.button !== 0 || !e.isPrimary) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); const h = root.current?.getBoundingClientRect().height || height; if (!collapsed) lastExpanded.current = h; drag.current = { y: e.clientY, height: h, current: h }; setDesired(h); setResizing(true); }}
        onPointerMove={e => { const current = drag.current; if (!current) return; const next = clamp(current.height + current.y - e.clientY, bounds.min, bounds.max); current.current = next; setDesired(next); setCollapsed(next <= bounds.min + 4); }}
        onPointerUp={release} onPointerCancel={release}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
          else if (e.key === "Home") { e.preventDefault(); setCollapsed(true); }
          else if (e.key === "End") { e.preventDefault(); settle(bounds.max); }
          else if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); if (collapsed && e.key === "ArrowUp") toggle(); else if (e.key === "ArrowDown" && heightRef.current <= bounds.open) setCollapsed(true); else settle(heightRef.current + (e.key === "ArrowUp" ? 28 : -28)); }
        }}>
        <i className="hand-tray-pill" /><span>{collapsed ? eliminated ? <><Eye size={13} />已淘汰 · 观战中</> : <>{myTurn ? "轮到你 · " : ""}手牌 {count} 张 · 上拉展开</> : "上下拖动，调整高度"}</span>
      </div>
      {!collapsed && <><div className="hand-tray-tools">{!eliminated && tools}</div><h2 className="hand-tray-title">我的手牌<span>{count}</span>{eliminated && <small>已淘汰</small>}</h2></>}
      <button className="hand-tray-toggle" aria-label={collapsed ? "展开手牌栏" : "收起手牌栏"} aria-expanded={!collapsed} aria-controls={contentId} onClick={toggle}>{collapsed ? <ChevronUp size={17} /> : <ChevronDown size={17} />}<span>{collapsed ? "展开" : "收起"}</span></button>
    </div>
    <div id={contentId} className="hand-tray-content" hidden={collapsed}>
      {eliminated ? <div className="hand-tray-spectator"><Eye size={23} /><strong>你已淘汰，继续看看朋友们怎么打。</strong><span>收起手牌栏，牌桌看得更完整。</span></div> : children}
    </div>
  </section>;
}
