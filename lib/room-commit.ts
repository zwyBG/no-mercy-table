import { applyAction, type Action, type Room } from "./game.ts";
import { canRebaseAction } from "./action-intent.ts";

export type RoomRow = {room:Room;version:number};
type Context = Parameters<typeof applyAction>[3];
type Storage = {read:()=>Promise<RoomRow|null>; save:(row:RoomRow)=>Promise<boolean>};
type Result = {row:RoomRow; committed:boolean; conflict?:"changed"|"busy"|"expired"};

// Re-read after a competing D1 write, validate the original intent, and commit
// the same action id exactly once. Failed attempts never mutate stored state.
export async function commitRoomAction(initial:RoomRow,id:string,action:Action,context:(room:Room)=>Context,storage:Storage):Promise<Result> {
  let row=initial;
  for(let attempt=0;attempt<4;attempt++) {
    const {room,version}=row;
    if(!room.players.some(p=>p.id===id&&!p.removed)) return {row,committed:false,conflict:"expired"};
    if(room.actions.includes(String(action.actionId))) return {row,committed:false};
    if(action.version!==version && !canRebaseAction(room,id,action)) return {row,committed:false,conflict:"changed"};
    applyAction(room,id,action,context(room));
    if(!["sort","uno","claimHost","social","devUnlock","devCard","devRoulette","devScore"].includes(action.type)) room.botAt=Date.now();
    room.actions.push(String(action.actionId));room.actions=room.actions.slice(-100);
    if(await storage.save(row)) return {row:{room,version:version+1},committed:true};
    const latest=await storage.read();if(!latest) return {row,committed:false,conflict:"expired"};
    row=latest;
  }
  return {row,committed:false,conflict:"busy"};
}
