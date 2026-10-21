"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, LockKeyhole, X } from "lucide-react";
import { COLORS, COLOR_NAMES, LABELS, cardLabel, type Card, type publicView } from "@/lib/game";
import { cardFaceKey, COLORED_KINDS, WILD_KINDS } from "@/lib/developer-tools";

type View = ReturnType<typeof publicView>;
type Send = (action:Record<string,unknown>)=>Promise<boolean>;

function ScoreEditor({ player, busy, save }: {player:View["players"][number];busy:boolean;save:(score:number)=>Promise<boolean>}) {
  const [score,setScore] = useState(String(player.score));
  useEffect(()=>setScore(String(player.score)),[player.score]);
  const number = Number(score), valid = score.trim() !== "" && Number.isSafeInteger(number) && Math.abs(number) <= 1000000;
  return <form className="developer-score-row" onSubmit={async e=>{e.preventDefault();if(valid)await save(number);}}><label htmlFor={`score-${player.id}`}><strong>{player.name}</strong><small>当前 {player.score} 分</small></label><input id={`score-${player.id}`} aria-label={`${player.name} 的积分`} type="number" step={1} min={-1000000} max={1000000} value={score} onChange={e=>setScore(e.target.value)} disabled={busy}/><button className="outline-button" type="submit" disabled={busy || !valid || number === player.score}>保存</button></form>;
}

export function DeveloperPanel({ view, busy, error, send, close, renderCard }: {view:View;busy:boolean;error:string;send:Send;close:()=>void;renderCard:(card:Card)=>ReactNode}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password,setPassword] = useState(""), [unlocked,setUnlocked] = useState(false), [tab,setTab] = useState<"cards"|"roulette"|"scores">("cards"), [saved,setSaved] = useState("");
  const [selectedId,setSelectedId] = useState<string|null>(null), [face,setFace] = useState<Omit<Card,"id">>({color:"yellow",kind:"number",number:0}), [hitAt,setHitAt] = useState("1");
  const selected = view.hand.find(c=>c.id === selectedId), pending = view.game?.pending;
  const roulette = pending?.kind === "roulette" && pending.color ? pending : null;
  const target = view.players.find(p=>p.id === roulette?.actor), drawn = roulette?.drawn || 0;
  const maxHit = target ? drawn+25-target.count : drawn+1;
  useEffect(()=>{dialog.current?.showModal();return ()=>dialog.current?.close();},[]);
  useEffect(()=>{if(!selectedId && view.hand[0])setSelectedId(view.hand[0].id);else if(selectedId && !view.hand.some(c=>c.id === selectedId))setSelectedId(view.hand[0]?.id || null);},[view.hand,selectedId]);
  useEffect(()=>{if(selected)setFace({color:selected.color,kind:selected.kind,...(selected.kind === "number" ? {number:selected.number} : {})});},[selected?.id,selected?.color,selected?.kind,selected?.number]);
  useEffect(()=>{setHitAt(String(drawn+1));},[roulette?.actor,roulette?.color,drawn,view.game?.top.id]);
  const run = async (action:Record<string,unknown>,message:string) => {setSaved("");if(await send({...action,password})){setSaved(message);return true;}return false;};
  const kinds = face.color === "wild" ? WILD_KINDS : COLORED_KINDS;
  const cardEditing = view.status === "playing" && !view.spectating && !view.game?.drawing && !view.game?.knockout;
  const rouletteAction = {type:"devRoulette",actor:roulette?.actor,color:roulette?.color,drawn,top:view.game?.top.id};
  return <dialog ref={dialog} className="modal modal-wide developer-panel" aria-label={unlocked ? "牌桌管理" : "验证密码"} onCancel={e=>{e.preventDefault();if(!busy)close();}}>
    <div className="modal-head"><h2>{unlocked ? "牌桌管理" : "验证密码"}</h2><button className="icon-button" disabled={busy} onClick={close} aria-label="关闭管理面板"><X size={20}/></button></div>
    {!unlocked ? <form onSubmit={async e=>{e.preventDefault();setSaved("");if(await send({type:"devUnlock",password}))setUnlocked(true);}}><label className="field-label" htmlFor="developer-password">密码</label><input id="developer-password" className="text-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={128} required disabled={busy}/><button className="primary-button full developer-enter" disabled={busy || !password.trim()} type="submit"><LockKeyhole size={16}/>{busy ? "正在验证" : "进入"}</button></form> : <>
      <nav className="developer-tabs" aria-label="管理项目">{([['cards','我的手牌'],['roulette','颜色轮盘'],['scores','玩家积分']] as const).map(([id,label])=><button key={id} aria-pressed={tab === id} onClick={()=>{setTab(id);setSaved("");}}>{label}</button>)}</nav>
      {tab === "cards" && <section className="developer-section"><p className="developer-copy">选择自己的一张牌，修改颜色和牌型后保存。手牌数量和排列位置保持不变。</p>{view.hand.length > 0 ? <><div className="developer-hand" aria-label="选择要修改的手牌">{view.hand.map((c,i)=><button key={c.id} className="developer-card" disabled={busy} aria-label={`第 ${i+1} 张：${cardLabel(c)}`} aria-pressed={selectedId === c.id} onClick={()=>{setSelectedId(c.id);setSaved("");}}>{renderCard(c)}</button>)}</div>{selected && <form className="developer-face-form" onSubmit={e=>{e.preventDefault();void run({type:"devCard",card:selected.id,previous:cardFaceKey(selected),face},"手牌已修改");}}><label>颜色<select aria-label="修改手牌颜色" value={face.color} disabled={busy || !cardEditing} onChange={e=>{const color=e.target.value as Card["color"],available=color === "wild" ? WILD_KINDS : COLORED_KINDS;setFace({color,kind:available.includes(face.kind)?face.kind:available[0],number:face.number ?? 0});}}>{[...COLORS,"wild"].map(color=><option key={color} value={color}>{COLOR_NAMES[color]}{color !== "wild" ? "色" : "牌"}</option>)}</select></label><label>牌型<select aria-label="修改手牌牌型" value={face.kind} disabled={busy || !cardEditing} onChange={e=>setFace({...face,kind:e.target.value,number:face.number ?? 0})}>{kinds.map(kind=><option key={kind} value={kind}>{kind === "number" ? "数字牌" : LABELS[kind]}</option>)}</select></label>{face.kind === "number" && <label>数字<select aria-label="修改手牌数字" value={face.number ?? 0} disabled={busy || !cardEditing} onChange={e=>setFace({...face,number:Number(e.target.value)})}>{Array.from({length:10},(_,i)=><option key={i} value={i}>{i}</option>)}</select></label>}<button className="primary-button" disabled={busy || !cardEditing || cardFaceKey(face) === cardFaceKey(selected)} type="submit">保存替换</button></form>}</> : <p className="developer-empty">现在没有可修改的手牌。</p>}{view.hand.length > 0 && !cardEditing && <p className="developer-copy">正在抽牌、结算淘汰或已进入观战时，不能修改手牌。</p>}</section>}
      {tab === "roulette" && <section className="developer-section">{roulette ? <><p className="developer-copy"><strong>{target?.name}</strong> 正在抽{COLOR_NAMES[roulette.color!]}色，已抽 <strong>{drawn}</strong> 张。这里的张数从本次轮盘第一张开始计算。</p><form className="developer-roulette-form" onSubmit={e=>{e.preventDefault();void run({...rouletteAction,hitAt:Number(hitAt)},`已设为第 ${hitAt} 张抽中所选颜色`);}}><label htmlFor="roulette-hit-at">第几张抽中<input id="roulette-hit-at" aria-label="轮盘抽中张数" type="number" step={1} min={drawn+1} max={maxHit} value={hitAt} onChange={e=>setHitAt(e.target.value)} disabled={busy}/></label><button className="primary-button" disabled={busy || !Number.isInteger(Number(hitAt)) || Number(hitAt) < drawn+1 || Number(hitAt) > maxHit}>应用设置</button><button className="outline-button" type="button" disabled={busy} onClick={()=>void run({...rouletteAction,hitAt:null},"已恢复随机抽牌")}>恢复随机</button></form><p className="developer-copy">设置前的抽牌保留；接下来仍由玩家逐张点击抽牌。</p></> : <p className="developer-empty">当前没有已选择颜色、正在抽牌的轮盘。</p>}</section>}
      {tab === "scores" && <section className="developer-section"><p className="developer-copy">修改本牌桌的累计积分，支持负数。本局尚未结算时，结束后会在此基础上正常加减分。</p><div className="developer-scores">{view.players.map(p=><ScoreEditor key={p.id} player={p} busy={busy} save={score=>run({type:"devScore",target:p.id,score,previousScore:p.score},`${p.name} 的积分已设为 ${score}`)}/>)}</div></section>}
    </>}
    {error ? <p className="developer-error" role="alert">{error}</p> : saved ? <p className="developer-saved" role="status"><Check size={14}/>{saved}</p> : null}
  </dialog>;
}
