"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, MessageSquare, X } from "lucide-react";
import { readApiResponse } from "@/lib/api-response";

export function FeedbackButton({ nickname, release }: { nickname: string; release: string }) {
  const dialog = useRef<HTMLDialogElement>(null), submission = useRef(""), sending = useRef(false);
  const [open, setOpen] = useState(false), [nick, setNick] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (open) dialog.current?.showModal(); return () => dialog.current?.close(); }, [open]);
  const start = () => { if (!nick) setNick(nickname); setError(""); setOpen(true); };
  const close = () => { if (!sending.current) { setOpen(false); if (sent) { setSent(false); setMessage(""); submission.current = ""; } } };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    submission.current ||= crypto.randomUUID();
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ id: submission.current, nickname: nick.trim(), message: message.trim(), release }), signal: AbortSignal.timeout(15000) });
      const data = await readApiResponse<{ ok?: boolean; error?: string }>(response);
      if (!response.ok || !data.ok) throw new Error(data.error || "反馈暂时未能保存，请重试。");
      setSent(true);
    } catch (err) { setError(err instanceof Error && ["TimeoutError", "AbortError", "TypeError"].includes(err.name) ? "暂时未收到确认，请再试一次。重试不会重复记录同一条反馈。" : err instanceof Error ? err.message : "网络暂时不可用，请重试。"); }
    finally { sending.current = false; setBusy(false); }
  };
  return <><button className="quiet-button feedback-button" onClick={start} aria-label="意见反馈"><MessageSquare size={16} /><span>意见反馈</span></button>{open && <dialog ref={dialog} className="modal feedback-modal" aria-label="意见反馈" onCancel={e => { e.preventDefault(); close(); }}><div className="modal-head"><h2>意见反馈</h2><button className="icon-button" onClick={close} disabled={busy} aria-label="关闭意见反馈"><X size={20} /></button></div>{sent ? <div className="feedback-success" role="status"><span><Check size={24} /></span><h3>反馈已收到</h3><p>谢谢，你的建议会帮助这张牌桌变得更好。</p><button className="primary-button full" onClick={close}>返回牌桌</button></div> : <form onSubmit={submit}><label className="field-label" htmlFor="feedback-nickname">昵称 / Nickname</label><input className="text-input" id="feedback-nickname" value={nick} maxLength={18} required disabled={busy} onChange={e => { setNick(e.target.value); submission.current = ""; }} autoComplete="nickname" placeholder="怎么称呼你？" /><label className="field-label feedback-message-label" htmlFor="feedback-message">反馈内容</label><textarea className="text-input feedback-textarea" id="feedback-message" value={message} maxLength={2000} required disabled={busy} onChange={e => { setMessage(e.target.value); submission.current = ""; }} placeholder="遇到了什么问题？或有什么想法？" /><div className="feedback-meta"><span>会保存昵称、反馈内容和提交时间。</span><span>{message.length}/2000</span></div>{error && <p className="feedback-error" role="alert">{error}</p>}<button className="primary-button full feedback-submit" type="submit" disabled={busy || !nick.trim() || !message.trim()}>{busy ? <><LoaderCircle size={17} className="spin" />正在提交</> : "提交反馈"}</button></form>}</dialog>}</>;
}
