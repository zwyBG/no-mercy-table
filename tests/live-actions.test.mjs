import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveActions} from '../lib/live-actions.ts';
import {postRoomAction} from '../lib/room-request.ts';
import {RoomQueue} from '../lib/room-queue.ts';
import {HandSync} from '../lib/hand-sync.ts';
import {validRoomCommand} from '../lib/room-command.ts';

const action={type:'draw',code:'ABC234',actionId:'draw-once',version:3,actionKey:'same-intent'};

test('live commands use the authenticated socket and resolve from only their matching acknowledgement',async()=>{
  const sent=[],live=new LiveActions();live.bind(frame=>sent.push(JSON.parse(frame)));
  const pending=live.send(action);
  assert.deepEqual(sent,[{type:'action',action}]);assert.equal(JSON.stringify(sent).includes('token'),false);
  assert.equal(live.receive({type:'ack',actionId:'other',status:200,view:{version:4}}),false);
  assert.equal(live.receive({type:'ack',actionId:action.actionId,status:200}),false);
  assert.equal(live.receive({type:'ack',actionId:action.actionId,status:200,view:{version:4}}),true);
  assert.deepEqual(await pending,{response:{ok:true,status:200},data:{version:4}});
  assert.equal(live.receive({type:'ack',actionId:action.actionId,status:200,view:{version:4}}),false);
});

test('a live rejection preserves status and the current view without replaying the move over HTTP',async()=>{
  const live=new LiveActions();live.bind(()=>{});let requests=0;
  const reply=postRoomAction(action,'private-token',undefined,async()=>{requests++;throw new Error('must not replay a rejection');},p=>live.send(p));
  live.receive({type:'ack',actionId:action.actionId,status:409,retryable:false,error:'changed',view:{version:5}});
  const result=await reply;assert.equal(requests,0);assert.equal(result.response.status,409);
  assert.deepEqual(result.data,{error:'changed',retryable:false,view:{version:5}});
});

test('lost live acknowledgement falls back with exactly the same accepted action id and payload',async()=>{
  const live=new LiveActions(5),sent=[];let commits=0;
  const accepted=new Set();
  live.bind(frame=>{const {action:a}=JSON.parse(frame);sent.push(a);accepted.add(a.actionId);commits++;});
  const result=await postRoomAction(action,'private-token',undefined,async(_,options)=>{
    const a=JSON.parse(options.body);assert.deepEqual(a,action);sent.push(a);
    if(!accepted.has(a.actionId)){accepted.add(a.actionId);commits++;}
    return Response.json({version:4});
  },p=>live.send(p));
  assert.equal(commits,1);assert.equal(sent.length,2);assert.equal(result.data.version,4);
});

test('disconnect releases pending commands immediately; duplicate sends share one frame',async()=>{
  const live=new LiveActions(),sent=[];live.bind(frame=>sent.push(frame));
  const one=live.send(action),two=live.send(action);assert.equal(sent.length,1);
  live.bind(null);assert.equal(await one,null);assert.equal(await two,null);assert.equal(await live.send(action),null);
});

test('create and join bypass the live channel while an unsupported connection uses HTTP immediately',async()=>{
  let frames=0,requests=0;
  for(const type of ['create','join'])await postRoomAction({...action,type},'old-token',undefined,async()=>{requests++;return Response.json({});},async()=>{frames++;throw new Error('not allowed');});
  const live=new LiveActions();await postRoomAction(action,'token',undefined,async()=>{requests++;return Response.json({});},p=>live.send(p));
  assert.equal(frames,0);assert.equal(requests,3);
});

test('room work stays serial across awaited writes and recovers after a rejected command',async()=>{
  const queue=new RoomQueue(),events=[];let release;
  const one=queue.run(async()=>{events.push('first');await new Promise(done=>release=done);events.push('saved');});
  const invalid=queue.run(async()=>{events.push('invalid');throw new Error('bad move');});
  const rejected=assert.rejects(invalid,/bad move/);
  const next=queue.run(async()=>{events.push('next');return 4;});
  await Promise.resolve();assert.deepEqual(events,['first']);release();
  await one;await rejected;assert.equal(await next,4);assert.deepEqual(events,['first','saved','invalid','next']);
});

test('manual sorting coalesces unsent order and does not enqueue until foreground work is released',async()=>{
  const sent=[],sync=new HandSync(async order=>{sent.push(order);},10000);
  sync.hold(true);sync.update(['a','b']);sync.update(['b','a']);await sync.flush();assert.equal(sent.length,0);
  sync.hold(false);await sync.flush();assert.deepEqual(sent,[['b','a']]);sync.reset();
});

test('sorting preserves the newest queued order during an in-flight save and resets at a room boundary',async()=>{
  const sent=[];let release;
  const sync=new HandSync(async order=>{sent.push(order);if(sent.length===1)await new Promise(done=>release=done);},10000);
  sync.update(['a','b']);const first=sync.flush();sync.update(['b','a']);sync.update(['b','new','a']);await sync.flush();assert.equal(sent.length,1);
  release();await first;await sync.flush();assert.deepEqual(sent,[['a','b'],['b','new','a']]);
  sync.update(['old-room']);sync.reset();await sync.flush();assert.equal(sent.length,2);
});

test('live command validation keeps accountless room setup and timed ticks on their dedicated routes',()=>{
  assert.equal(validRoomCommand(action),true);
  for(const patch of [{type:'create'},{type:'join'},{type:'heartbeat'},{type:'tick'},{actionId:''},{actionId:'x'.repeat(101)},{version:'3'}])assert.equal(validRoomCommand({...action,...patch}),false);
  for(const input of [null,[],42,'draw'])assert.equal(validRoomCommand(input),false);
});
