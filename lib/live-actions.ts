export type ActionReply<T> = {response:{ok:boolean;status:number};data:T};
type Ack = {type:string;actionId:string;status:number;view?:unknown;error?:string;retryable?:boolean};
type Pending = {promise:Promise<ActionReply<unknown>|null>;resolve:(value:ActionReply<unknown>|null)=>void;timer:ReturnType<typeof setTimeout>};

// Reuse the authenticated room socket. An interrupted or unanswered send falls
// back to HTTP with the identical action id, so an accepted move is not repeated.
export class LiveActions {
  private sender: ((frame:string)=>void) | null = null;
  private pending = new Map<string,Pending>();
  private timeoutMs:number;
  constructor(timeoutMs=3000) {this.timeoutMs=timeoutMs;}
  bind(sender:((frame:string)=>void)|null) {
    if(this.sender===sender)return;
    for(const p of this.pending.values()){clearTimeout(p.timer);p.resolve(null);}
    this.pending.clear();this.sender=sender;
  }
  send<T>(action:Record<string,unknown>):Promise<ActionReply<T>|null> {
    const id=action.actionId;
    if(!this.sender||typeof id!=="string")return Promise.resolve(null);
    const existing=this.pending.get(id);if(existing)return existing.promise as Promise<ActionReply<T>|null>;
    let resolve!:(value:ActionReply<unknown>|null)=>void;
    const promise=new Promise<ActionReply<unknown>|null>(done=>{resolve=done;});
    const timer=setTimeout(()=>{this.pending.delete(id);resolve(null);},this.timeoutMs);
    this.pending.set(id,{promise,resolve,timer});
    try{this.sender(JSON.stringify({type:"action",action}));}catch{clearTimeout(timer);this.pending.delete(id);resolve(null);}
    return promise as Promise<ActionReply<T>|null>;
  }
  receive(value:unknown) {
    if(!value||typeof value!=="object")return false;
    const ack=value as Ack;
    if(ack.type!=="ack"||typeof ack.actionId!=="string"||!Number.isInteger(ack.status)||ack.status<200||ack.status>599||ack.status===200&&!ack.view)return false;
    const p=this.pending.get(ack.actionId);if(!p)return false;
    this.pending.delete(ack.actionId);clearTimeout(p.timer);
    p.resolve({response:{ok:ack.status>=200&&ack.status<300,status:ack.status},data:ack.status===200?ack.view:{error:ack.error,retryable:ack.retryable,...(ack.view?{view:ack.view}:{})}});
    return true;
  }
}
