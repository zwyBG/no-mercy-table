import { publicView, type Action } from "./game.ts";
import type { commitRoomAction } from "./room-commit.ts";

const actions = new Set(["start","ready","config","seats","addBots","removeBot","pause","autoplay","claimHost","finishDeal","reset","kick","leave","sort","uno","catch","chooseZero","chooseSeven","skipSeven","target","pick","color","drawRoulette","play","jump","draw","social","devUnlock","devCard","devRoulette","devScore"]);
export function validRoomCommand(value: unknown): value is Action {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const a = value as Action;
  return actions.has(a.type) && typeof a.actionId === "string" && a.actionId.length > 0 && a.actionId.length <= 100 && Number.isInteger(a.version);
}

export function commandResult(result: Awaited<ReturnType<typeof commitRoomAction>>, id: string, seen: Record<string,number>) {
  if (result.conflict === "expired") return {status:401,body:{error:"座位凭证已失效，请重新加入"}};
  const view = publicView(result.row.room,id,seen,result.row.version);
  if (result.conflict) return {status:409,body:{error:result.conflict === "changed" ? "回合或手牌已更新，请按当前牌面操作" : "正在同步本次操作，请稍后重试",retryable:result.conflict === "busy",view}};
  return {status:200,body:view};
}
