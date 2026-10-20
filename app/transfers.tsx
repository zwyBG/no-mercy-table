"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { Card, publicView } from "@/lib/game";
import { TRANSFER_TIMING } from "@/lib/presentation";

export type TransferView = NonNullable<NonNullable<ReturnType<typeof publicView>["game"]>["transfer"]>;
type Point = { x: number; y: number };
export function TransferEffect({ transfer, me, board, names, children, paused = false }: { transfer: TransferView; me: string; board: RefObject<HTMLDivElement | null>; names: Record<string, string>; children: ReactNode; paused?: boolean }) {
  const [positions, setPositions] = useState<{ from: Point; to: Point } | null>(null);
  const [initialAge] = useState(() => transfer.duration - transfer.remainingMs);
  useLayoutEffect(() => {
    const measure = () => {
      const point = (id: string): Point => {
        const el = id === me ? board.current?.parentElement?.querySelector<HTMLElement>(".hand-cards") : board.current?.querySelector<HTMLElement>(`[data-player-id="${id}"] .seat-avatar`);
        const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + (id === me && el && !el.closest(".hand-tray") ? (el.classList.contains("own-hand-overlap") ? 48 : 8) + (parseFloat(getComputedStyle(el).getPropertyValue("--own-card-height")) || 105) / 2 : r.height / 2) } : { x: innerWidth / 2, y: innerHeight / 2 };
      }; setPositions({ from: point(transfer.from), to: point(transfer.to) });
    }; measure(); window.addEventListener("resize", measure); window.addEventListener("scroll", measure, { passive: true });
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure); };
  }, [transfer.id, me, board]);
  if (!positions) return null;
  const swap = transfer.kind === "swap", timing = swap ? TRANSFER_TIMING.swap : TRANSFER_TIMING.single;
  const flights: { from: Point; to: Point; name: string; count: number; delay: number; duration: number }[] = [{ from: positions.from, to: positions.to, name: names[transfer.to], count: swap ? transfer.fromCount : 1, delay: timing.first, duration: timing.flight }];
  if (swap) flights.push({ from: positions.to, to: positions.from, name: names[transfer.from], count: transfer.toCount, delay: TRANSFER_TIMING.swap.second, duration: timing.flight });
  return <div className={`transfer-layer ${swap ? "transfer-swap" : "transfer-single"}`} data-paused={paused} aria-hidden="true"><div className="transfer-story"><span>7 · {swap ? "整手交换" : transfer.kind === "return" ? "反抽一张" : "抽取一张"}</span><strong>{names[transfer.from]} <b>{swap ? "⇄" : "→"}</b> {names[transfer.to]}</strong><div className="transfer-steps" style={{ "--transfer-age": `${-initialAge}ms`, "--transfer-duration": `${transfer.duration}ms` } as CSSProperties}>{(swap ? ["收拢", "传出", "接收", "展开"] : ["选中", "传递", "落入手牌"]).map((step, i) => <span key={step} style={{ "--step": i } as CSSProperties}>{step}</span>)}</div></div>{flights.map((flight, index) => <div key={index} className="transfer-flight" style={{ "--from-x": `${flight.from.x}px`, "--from-y": `${flight.from.y}px`, "--to-x": `${flight.to.x}px`, "--to-y": `${flight.to.y}px`, "--mid-x": `${(flight.from.x + flight.to.x) / 2}px`, "--mid-y": `${Math.min(flight.from.y, flight.to.y) - 65}px`, animationDelay: `${flight.delay - initialAge}ms`, animationDuration: `${flight.duration}ms` } as CSSProperties}>
    <span className="transfer-tail" />{swap && <><span className="transfer-back back-one">{children}</span><span className="transfer-back back-two">{children}</span></>}<span className="transfer-front">{children}</span><span className="transfer-caption">{flight.count} 张 → {flight.name}</span>
  </div>)}</div>;
}

type View = ReturnType<typeof publicView>;
type Delivery = NonNullable<NonNullable<View["game"]>["delivery"]>;
function FlyingDraw({ delivery, me, children }: { delivery: Delivery; me: string; children: ReactNode }) {
  const [path, setPath] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const from = document.querySelector(".draw-pile")?.getBoundingClientRect();
    const own = document.querySelector(".hand-cards")?.getBoundingClientRect();
    const seat = document.querySelector(`[data-player-id="${delivery.player}"] .seat-avatar`)?.getBoundingClientRect();
    const to = delivery.player === me ? own : seat;
    setPath({ "--deal-x": `${from ? from.left + from.width / 2 : innerWidth / 2}px`, "--deal-y": `${from ? from.top + from.height / 2 : innerHeight / 2}px`, "--receive-x": `${to ? to.left + to.width / 2 : innerWidth / 2}px`, "--receive-y": `${to ? Math.min(innerHeight - 65, to.top + to.height / 2) : innerHeight * .7}px` } as CSSProperties);
  }, [delivery.id, me]);
  return <div className={`draw-delivery ${delivery.player === me ? "draw-delivery-own" : ""} delivery-${delivery.mode}`} style={path} aria-hidden="true"><div className="draw-delivery-card">{children}</div><div className="draw-delivery-ring" /><span className="draw-delivery-count">+1{delivery.total > 0 && <small>{delivery.ordinal} / {delivery.total}</small>}</span></div>;
}
export function CardDeliveries({ view, children, renderFace }: { view: View | null; children: ReactNode; renderFace: (card: Card) => ReactNode }) {
  const [flights, setFlights] = useState<(Delivery & { face?: Card })[]>([]), last = useRef({ scope: "", id: "", hand: [] as string[] });
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const delivery = view?.game?.delivery, scope = `${view?.code}:${view?.game?.round}`;
  useEffect(() => {
    const oldHand = last.current.hand; last.current.hand = view?.hand.map(c => c.id) || [];
    if (last.current.scope !== scope) { last.current = { scope, id: delivery?.id || "", hand: last.current.hand }; setFlights([]); return; }
    if (!delivery || delivery.id === last.current.id) return;
    const face = delivery.player === view?.me ? view.hand.findLast(c => !oldHand.includes(c.id)) : undefined;
    last.current.id = delivery.id; setFlights(list => [...list.slice(-5), { ...delivery, face }]);
    const timer = setTimeout(() => { setFlights(list => list.filter(d => d.id !== delivery.id)); timers.current.delete(timer); }, 1100); timers.current.add(timer);
  }, [scope, delivery?.id, view?.version]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  return <div className="draw-deliveries" data-paused={!!view?.pause}>{flights.map(d => <FlyingDraw key={d.id} delivery={d} me={view?.me || ""}>{d.face ? renderFace(d.face) : children}</FlyingDraw>)}</div>;
}
