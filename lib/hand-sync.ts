// Card movement is local immediately. Persist only the latest arrangement and
// never use a hand-order request as the table's foreground operation lock.
export class HandSync {
  private latest:string[]|null=null;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private sending=false;
  private held=false;
  private epoch=0;
  private send:(order:string[])=>Promise<void>;
  private delay:number;
  constructor(send:(order:string[])=>Promise<void>,delay=120) {this.send=send;this.delay=delay;}
  update(order:string[]) {this.latest=[...order];this.schedule();}
  hold(value:boolean) {this.held=value;if(value)clearTimeout(this.timer);else this.schedule();}
  private schedule() {
    clearTimeout(this.timer);
    if(!this.latest||this.held||this.sending)return;
    this.timer=setTimeout(()=>{void this.flush();},this.delay);
  }
  async flush() {
    if(!this.latest||this.held||this.sending)return;
    clearTimeout(this.timer);const order=this.latest,epoch=this.epoch;this.latest=null;this.sending=true;
    try{await this.send(order);}catch{/* The caller handles transport recovery. */}
    finally{if(epoch===this.epoch){this.sending=false;this.schedule();}}
  }
  reset() {clearTimeout(this.timer);this.latest=null;this.sending=false;this.held=false;this.epoch++;}
}
