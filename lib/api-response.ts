export async function readApiResponse<T>(response: Response): Promise<T> {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    if (response.status === 429) throw new Error("操作有点快，请稍等再试。");
    if (response.status >= 500) throw new Error("牌桌服务正在恢复，请稍后重试。");
    throw new Error("牌桌连接暂时异常，请刷新页面后重试。");
  }
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid response");
    return value as T;
  } catch { throw new Error("牌桌数据暂时未完整送达，请稍后重试。"); }
}
