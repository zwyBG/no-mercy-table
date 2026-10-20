"use client";
import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { cardLabel, type Card, type publicView } from "@/lib/game";

type View = ReturnType<typeof publicView>;
export function SpectatorHands({ view, renderCard }: { view: View; renderCard: (card: Card) => ReactNode }) {
  if (!view.spectating) return null;
  return <div className="spectator-hands" aria-label="观战：剩余玩家的手牌"><p className="spectator-note"><Eye size={13} />观战中 · 剩余玩家的手牌实时更新</p>{view.spectatorHands.map(p => <section key={p.id} className={`watch-hand ${view.game?.turn === p.id ? "watch-current" : ""}`}>
    <div className="watch-player"><strong>{p.name}</strong><span>{p.cards.length}</span>{view.game?.turn === p.id && <small>正在行动</small>}</div>
    <div className="watch-cards" tabIndex={0} role="region" aria-label={`${p.name} 的 ${p.cards.length} 张手牌`}>{p.cards.map(c => <span key={c.id} className="watch-card" aria-label={cardLabel(c)} title={cardLabel(c)}>{renderCard(c)}</span>)}</div>
  </section>)}{view.spectatorHands.length === 0 && <p className="spectator-note">本局手牌已全部结算，稍后查看最终名次。</p>}</div>;
}
