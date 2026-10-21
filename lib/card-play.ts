import type { Action, Card } from "./game.ts";
import { sameCardFace } from "./jump-in.ts";

export function matchingCards(hand: Card[], primary: string): Card[] {
  const card = hand.find(c => c.id === primary);
  return card ? [card, ...hand.filter(c => c.id !== primary && sameCardFace(c,card))] : [];
}

export function cardsForAction(hand: Card[], action: Action): Card[] {
  const ids = action.cards === undefined ? [action.card] : action.cards;
  if (!Array.isArray(ids) || !ids.length || ids.length > hand.length || new Set(ids).size !== ids.length || ids[0] !== action.card || ids.some(id => typeof id !== "string")) throw new Error("请选择有效的出牌张数");
  const cards = ids.map(id => hand.find(c => c.id === id));
  if (cards.some(c => !c)) throw new Error("所选手牌已变化，请重新选择");
  const selected = cards as Card[];
  if (!selected.every(c => sameCardFace(c,selected[0]))) throw new Error("只有同颜色、同数字或同符号的牌才能一起出");
  return selected;
}
