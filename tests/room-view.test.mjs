import test from 'node:test';
import assert from 'node:assert/strict';
import {canAcceptRoomView} from '../lib/room-view.ts';

test('a buffered post-leave view cannot reopen a room after its session is cleared',()=>{
  const session={code:'ROOM23',token:'seat-a'},view={code:session.code,version:8};
  assert.ok(canAcceptRoomView(null,view,session,session.token));
  assert.equal(canAcceptRoomView(null,{...view,version:9},null,session.token),false);
});

test('switching seats rejects old-connection views even when the room code and version look current',()=>{
  const current={code:'ROOM23',version:8},active={code:'ROOM23',token:'new-seat'};
  assert.equal(canAcceptRoomView(current,{...current,version:10},active,'old-seat'),false);
  assert.equal(canAcceptRoomView(current,{code:'OTHER2',version:99},active,'new-seat'),false);
  assert.ok(canAcceptRoomView(current,{...current,version:10},active,'new-seat'));
});

test('valid current-seat HTTP and socket views still preserve monotonic room versions',()=>{
  const session={code:'ROOM23',token:'seat-a'},current={code:session.code,version:8};
  assert.equal(canAcceptRoomView(current,{...current,version:7},session),false);
  assert.ok(canAcceptRoomView(current,current,session));
  assert.ok(canAcceptRoomView({code:'OTHER2',version:99},{...current,version:1},session));
});
