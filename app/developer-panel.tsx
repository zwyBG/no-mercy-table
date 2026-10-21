"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, LockKeyhole, X } from "lucide-react";
import { COLORS, COLOR_NAMES, LABELS, cardLabel, type Card, type publicView } from "@/lib/game";
import { cardFaceKey, COLORED_KINDS, WILD_KINDS, type DeveloperSettings } from "@/lib/developer-tools";

type View = ReturnType<typeof publicView>;
type Send = (action:Record<string,unknown>)=>Promise<boolean>;

function ScoreEditor({ player, busy, save }: {player:View["players"][number];busy:boolean;save:(score:number)=>Promise<boolean>}) {
  const [score,setScore] = useState(String(player.score));
  useEffect(()=>setScore(String(player.score)),[player.score]);
  const number = Number(score), valid = score.trim() !== "" && Number.isSafeInteger(number) && Math.abs(number) <= 1000000;
  return <form className="developer-score-row" onSubmit={async e=>{e.preventDefault();if(valid)await save(number);}}><label htmlFor={`score-${player.id}`}><strong>{player.name}</strong><small>当前 {player.score} 分</small></label><input id={`score-${player.id}`} aria-label={`${player.name} 的积分`} type="number" step={1} min={-1000000} max={1000000} value={score} onChange={e=>setScore(e.target.value)} disabled={busy}/><button className="outline-button" type="submit" disabled={busy || !valid || number === player.score}>保存</button></form>;
}

function RouletteEditor({view,busy,settings,run}:{view:View;busy:boolean;settings:DeveloperSettings|null;run:(action:Record<string,unknown>,message:string)=>Promise<boolean>}) {
  const pending = view.game?.pending, roulette = pending?.kind === "roulette" && pending.color ? pending : null;
  const [scope,setScope] = useState<"current"|"next">(roulette ? "current" : "next");
  const [currentHit,setCurrentHit] = useState("1"), [nextHit,setNextHit] = useState(String(settings?.nextRouletteHitAt ?? 3));
  const target = view.players.find(p=>p.id === roulette?.actor), drawn = roulette?.drawn || 0;
  useEffect(()=>setCurrentHit(String(drawn+1)),[roulette?.actor,roulette?.color,drawn,view.game?.top.id]);
  useEffect(()=>{if(!roulette)setScope("next");},[!!roulette]);
  useEffect(()=>setNextHit(String(settings?.nextRouletteHitAt ?? 3)),[settings?.nextRouletteHitAt]);
  const next = scope === "next", value = next ? nextHit : currentHit, min = next ? 1 : drawn+1;
  const max = next ? 25 : target ? drawn+25-target.count : drawn+1;
  const action = next ? {type:"devRoulette",scope:"next"} : {type:"devRoulette",scope:"current",actor:roulette?.actor,color:roulette?.color,drawn,top:view.game?.top.id};
  return <section className="developer-section">
    <div className="developer-roulette-scope" aria-label="轮盘设置范围"><button aria-pressed={!next} disabled={!roulette || busy} onClick={()=>setScope("current")}>当前这次</button><button aria-pressed={next} disabled={busy} onClick={()=>setScope("next")}>下一次轮盘</button></div>
    {next ? <><p className="developer-copy">提前设置本牌桌下一次颜色轮盘：玩家自己选颜色后，按设定张数逐张抽中。当前这次轮盘不受影响。</p><p className="developer-preset-state" role="status">{settings?.nextRouletteHitAt ? `待生效：下一次第 ${settings.nextRouletteHitAt} 张抽中所选颜色` : "下一次尚未预设，保持随机"}</p></> : <p className="developer-copy"><strong>{target?.name}</strong> 正在抽{COLOR_NAMES[roulette?.color || "red"]}色，已抽 <strong>{drawn}</strong> 张。张数从本次轮盘第一张开始计算。</p>}
    <form className="developer-roulette-form" onSubmit={e=>{e.preventDefault();void run({...action,hitAt:Number(value)},next ? `已预设下一次第 ${value} 张抽中所选颜色` : `已设为第 ${value} 张抽中所选颜色`);}}><label htmlFor="roulette-hit-at">第几张抽中<input id="roulette-hit-at" aria-label={next ? "下一次轮盘抽中张数" : "轮盘抽中张数"} type="number" step={1} min={min} max={max} value={value} onChange={e=>next ? setNextHit(e.target.value) : setCurrentHit(e.target.value)} disabled={busy}/></label><button className="primary-button" disabled={busy || !value.trim() || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max || !next && !roulette}>{next ? "保存下一次" : "应用设置"}</button><button className="outline-button" type="button" disabled={busy || next && !settings?.nextRouletteHitAt} onClick={()=>void run({...action,hitAt:null},next ? "已取消下一次预设，恢复随机" : "已恢复随机抽牌")}>{next ? "取消预设" : "恢复随机"}</button></form>
    <p className="developer-copy">{next ? "仅生效一次，用后恢复随机；跨牌局保留，直到下一次轮盘实际开始抽牌。若玩家先达到 25 张手牌，仍会按规则提前淘汰。" : "设置前的抽牌保留；接下来仍由玩家逐张点击抽牌。"}</p>
  </section>;
}

export function DeveloperPanel({ view, busy, error, settings, send, close, renderCard }: {view:View;busy:boolean;error:string;settings:DeveloperSettings|null;send:Send;close:()=>void;renderCard:(card:Card)=>ReactNode}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password,setPassword] = useState(""), [unlocked,setUnlocked] = useState(false), [tab,setTab] = useState<"cards"|"roulette"|"scores">("cards"), [saved,setSaved] = useState("");
  const [selectedId,setSelectedId] = useState<string|null>(null), [face,setFace] = useState<Omit<Card,"id">>({color:"yellow",kind:"number",number:0});
  const selected = view.hand.find(c=>c.id === selectedId), pending = view.game?.pending;
  const roulette = pending?.kind === "roulette" && pending.color ? pending : null;
  useEffect(()=>{dialog.current?.showModal();return ()=>dialog.current?.close();},[]);
  useEffect(()=>{if(!selectedId && view.hand[0])setSelectedId(view.hand[0].id);else if(selectedId && !view.hand.some(c=>c.id === selectedId))setSelectedId(view.hand[0]?.id || null);},[view.hand,selectedId]);
  useEffect(()=>{if(selected)setFace({color:selected.color,kind:selected.kind,...(selected.kind === "number" ? {number:selected.number} : {})});},[selected?.id,selected?.color,selected?.kind,selected?.number]);
  const refresh = useRef(send); refresh.current = send;
  useEffect(()=>{if(unlocked && tab === "roulette")void refresh.current({type:"devUnlock",password});},[unlocked,tab,password,roulette?.actor,roulette?.color,Boolean(roulette?.drawn),view.game?.round]);
  const run = async (action:Record<string,unknown>,message:string) => {setSaved("");if(await send({...action,password})){setSaved(message);return true;}return false;};
  const kinds = face.color === "wild" ? WILD_KINDS : COLORED_KINDS;
  const cardEditing = view.status === "playing" && !view.spectating && !view.game?.drawing && !view.game?.knockout;
  return <dialog ref={dialog} className="modal modal-wide developer-panel" aria-label={unlocked ? "牌桌管理" : "验证密码"} onCancel={e=>{e.preventDefault();if(!busy)close();}}>
    <div className="modal-head"><h2>{unlocked ? "牌桌管理" : "验证密码"}</h2><button className="icon-button" disabled={busy} onClick={close} aria-label="关闭管理面板"><X size={20}/></button></div>
    {!unlocked ? <form onSubmit={async e=>{e.preventDefault();setSaved("");if(await send({type:"devUnlock",password}))setUnlocked(true);}}><label className="field-label" htmlFor="developer-password">密码</label><input id="developer-password" className="text-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={128} required disabled={busy}/><button className="primary-button full developer-enter" disabled={busy || !password.trim()} type="submit"><LockKeyhole size={16}/>{busy ? "正在验证" : "进入"}</button></form> : <>
      <nav className="developer-tabs" aria-label="管理项目">{([['cards','我的手牌'],['roulette','颜色轮盘'],['scores','玩家积分']] as const).map(([id,label])=><button key={id} aria-pressed={tab === id} onClick={()=>{setTab(id);setSaved("");}}>{label}</button>)}</nav>
      {tab === "cards" && <section className="developer-section"><p className="developer-copy">选择自己的一张牌，修改颜色和牌型后保存。手牌数量和排列位置保持不变。</p>{view.hand.length > 0 ? <><div className="developer-hand" aria-label="选择要修改的手牌">{view.hand.map((c,i)=><button key={c.id} className="developer-card" disabled={busy} aria-label={`第 ${i+1} 张：${cardLabel(c)}`} aria-pressed={selectedId === c.id} onClick={()=>{setSelectedId(c.id);setSaved("");}}>{renderCard(c)}</button>)}</div>{selected && <form className="developer-face-form" onSubmit={e=>{e.preventDefault();void run({type:"devCard",card:selected.id,previous:cardFaceKey(selected),face},"手牌已修改");}}><label>颜色<select aria-label="修改手牌颜色" value={face.color} disabled={busy || !cardEditing} onChange={e=>{const color=e.target.value as Card["color"],available=color === "wild" ? WILD_KINDS : COLORED_KINDS;setFace({color,kind:available.includes(face.kind)?face.kind:available[0],number:face.number ?? 0});}}>{[...COLORS,"wild"].map(color=><option key={color} value={color}>{COLOR_NAMES[color]}{color !== "wild" ? "色" : "牌"}</option>)}</select></label><label>牌型<select aria-label="修改手牌牌型" value={face.kind} disabled={busy || !cardEditing} onChange={e=>setFace({...face,kind:e.target.value,number:face.number ?? 0})}>{kinds.map(kind=><option key={kind} value={kind}>{kind === "number" ? "数字牌" : LABELS[kind]}</option>)}</select></label>{face.kind === "number" && <label>数字<select aria-label="修改手牌数字" value={face.number ?? 0} disabled={busy || !cardEditing} onChange={e=>setFace({...face,number:Number(e.target.value)})}>{Array.from({length:10},(_,i)=><option key={i} value={i}>{i}</option>)}</select></label>}<button className="primary-button" disabled={busy || !cardEditing || cardFaceKey(face) === cardFaceKey(selected)} type="submit">保存替换</button></form>}</> : <p className="developer-empty">现在没有可修改的手牌。</p>}{view.hand.length > 0 && !cardEditing && <p className="developer-copy">正在抽牌、结算淘汰或已进入观战时，不能修改手牌。</p>}</section>}
      {tab === "roulette" && <RouletteEditor view={view} busy={busy} settings={settings} run={run}/>}
      {tab === "scores" && <section className="developer-section"><p className="developer-copy">修改本牌桌的累计积分，支持负数。本局尚未结算时，结束后会在此基础上正常加减分。</p><div className="developer-scores">{view.players.map(p=><ScoreEditor key={p.id} player={p} busy={busy} save={score=>run({type:"devScore",target:p.id,score,previousScore:p.score},`${p.name} 的积分已设为 ${score}`)}/>)}</div></section>}
    </>}
    {error ? <p className="developer-error" role="alert">{error}</p> : saved ? <p className="developer-saved" role="status"><Check size={14}/>{saved}</p> : null}
  </dialog>;
}
