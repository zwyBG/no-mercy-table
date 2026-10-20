"use client";

import { useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { publicView } from "@/lib/game";

export type TransferView = NonNullable<NonNullable<ReturnType<typeof publicView>["game"]>["transfer"]>;
type Point = { x: number; y: number };
export function TransferEffect({ transfer, me, board, names, children }: { transfer: TransferView; me: string; board: RefObject<HTMLDivElement | null>; names: Record<string, string>; children: ReactNode }) {
  const [positions, setPositions] = useState<{ from: Point; to: Point } | null>(null);
  const [initialAge] = useState(() => transfer.duration - transfer.remainingMs);
  useLayoutEffect(() => {
    const measure = () => {
      const point = (id: string): Point => {
        const el = id === me ? board.current?.parentElement?.querySelector<HTMLElement>(".hand-cards") : board.current?.querySelector<HTMLElement>(`[data-player-id="${id}"] .seat-avatar`);
        const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + (id === me && el ? (el.classList.contains("own-hand-overlap") ? 48 : 8) + (parseFloat(getComputedStyle(el).getPropertyValue("--own-card-height")) || 105) / 2 : r.height / 2) } : { x: innerWidth / 2, y: innerHeight / 2 };
      }; setPositions({ from: point(transfer.from), to: point(transfer.to) });
    }; measure(); window.addEventListener("resize", measure); window.addEventListener("scroll", measure, { passive: true });
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure); };
  }, [transfer.id, me, board]);
  if (!positions) return null;
  const swap = transfer.kind === "swap", flights = [{ from: positions.from, to: positions.to, name: names[transfer.to], count: swap ? transfer.fromCount : 1, delay: swap ? 330 : 90, duration: swap ? 660 : 720 }];
  if (swap) flights.push({ from: positions.to, to: positions.from, name: names[transfer.from], count: transfer.toCount, delay: 1020, duration: 660 });
  return <div className={`transfer-layer ${swap ? "transfer-swap" : "transfer-single"}`} aria-hidden="true">{flights.map((flight, index) => <div key={index} className="transfer-flight" style={{ "--from-x": `${flight.from.x}px`, "--from-y": `${flight.from.y}px`, "--to-x": `${flight.to.x}px`, "--to-y": `${flight.to.y}px`, "--mid-x": `${(flight.from.x + flight.to.x) / 2}px`, "--mid-y": `${Math.min(flight.from.y, flight.to.y) - 65}px`, animationDelay: `${flight.delay - initialAge}ms`, animationDuration: `${flight.duration}ms` } as CSSProperties}>
    <span className="transfer-tail" />{swap && <><span className="transfer-back back-one">{children}</span><span className="transfer-back back-two">{children}</span></>}<span className="transfer-front">{children}</span><span className="transfer-caption">{flight.count} 张 → {flight.name}</span>
  </div>)}</div>;
}
