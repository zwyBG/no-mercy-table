"use client";

import { Zap } from "lucide-react";
import { cardLabel, drawValue, type Card } from "@/lib/game";

export function JumpInPrompt({ card, own, penalty, busy, copies = 1, onJump }: { card: Card; own: boolean; penalty: number; busy: boolean; copies?: number; onJump: () => void }) {
  return <div className="jump-in-prompt" role="status" aria-live="polite">
    <span className="jump-in-icon"><Zap size={18} /></span>
    <div><strong>{own ? "还能连抢！" : "可以抢出！"}<span>{cardLabel(card)}</span></strong><small>{penalty ? `取消原 +${penalty}，只保留这张 +${drawValue(card)}` : "同色同牌 · 按最近座次抢入"}</small></div>
    <button className="jump-in-button" disabled={busy} onClick={onJump}><Zap size={15} />{copies > 1 ? `抢出 ${copies} 张` : "抢出这张"}</button>
  </div>;
}
