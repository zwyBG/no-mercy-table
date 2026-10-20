export type Feedback = { id: string; nickname: string; message: string; release: string };
export const INSERT_FEEDBACK = "INSERT INTO player_feedback (id, nickname, message, release) SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM player_feedback WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')) < 30 ON CONFLICT(id) DO NOTHING";
export function validateFeedback(value: unknown): Feedback {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请填写反馈内容。");
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.id)) throw new Error("提交凭证无效，请关闭后重新打开反馈。");
  const nickname = typeof v.nickname === "string" ? v.nickname.trim() : "", message = typeof v.message === "string" ? v.message.trim() : "";
  if (!nickname || nickname.length > 18) throw new Error("昵称需要 1～18 个字。");
  if (!message || message.length > 2000) throw new Error("反馈内容需要 1～2000 个字。");
  const release = typeof v.release === "string" && /^[a-z0-9.\-]{1,40}$/i.test(v.release) ? v.release : "unknown";
  return { id: v.id, nickname, message, release };
}
