import { env } from "cloudflare:workers";
import { INSERT_FEEDBACK, validateFeedback } from "@/lib/feedback";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) return reply({ error: "请求来源无效。" }, 403);
    if (!request.headers.get("Content-Type")?.includes("application/json")) return reply({ error: "提交格式无效。" }, 415);
    const reader = request.body?.getReader(); if (!reader) return reply({ error: "请填写反馈内容。" }, 400);
    const chunks: Uint8Array[] = []; let length = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 12000) { await reader.cancel(); return reply({ error: "反馈内容过长。" }, 413); } chunks.push(value); } } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = new TextDecoder().decode(bytes);
    let feedback;
    try { feedback = validateFeedback(JSON.parse(body)); } catch (error) { return reply({ error: error instanceof SyntaxError ? "提交格式无效。" : error instanceof Error ? error.message : "请检查反馈内容。" }, 400); }
    if (!env.DB) return reply({ error: "反馈服务暂时不可用，请稍后再试。" }, 503);
    const saved = await env.DB.prepare(INSERT_FEEDBACK).bind(feedback.id, feedback.nickname, feedback.message, feedback.release).run();
    if (!saved.meta.changes && !await env.DB.prepare("SELECT id FROM player_feedback WHERE id = ?").bind(feedback.id).first()) return reply({ error: "反馈提交较多，请一分钟后再试。" }, 429);
    return reply({ ok: true });
  } catch { return reply({ error: "反馈暂时未能保存，请稍后重试。" }, 503); }
}
