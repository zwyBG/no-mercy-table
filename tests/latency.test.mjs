import test from 'node:test';
import assert from 'node:assert/strict';
import {LatencyProbe,LATENCY_INTERVAL,latencyQuality} from '../lib/latency.ts';
import {GET,HEAD} from '../app/api/ping/route.ts';

test('a zero-clock first ping measures its own response and ignores unsolicited or duplicate pongs',()=>{
  const probe=new LatencyProbe();assert.equal(probe.complete(0),null);assert.equal(probe.begin(0),true);assert.equal(probe.complete(123.4),123);assert.equal(probe.sampledAt,123.4);assert.equal(probe.complete(124),null);
});
test('overlapping pings cannot overwrite the timestamp or make a late response look fast',()=>{
  const probe=new LatencyProbe();probe.begin(100);assert.equal(probe.begin(7000),false);assert.equal(probe.timedOut(8100),true);assert.equal(probe.complete(8200),null);assert.equal(probe.sampledAt,null);
  assert.equal(probe.begin(9000),true);assert.equal(probe.complete(9050),50);
});
test('a reconnected probe discards the previous connection timing',()=>{
  const probe=new LatencyProbe();probe.begin(100);probe.reset();assert.equal(probe.complete(200),null);probe.begin(300);assert.equal(probe.complete(300.2),1);
});
test('latency colors distinguish fresh measurements and the background uses fewer probes',()=>{
  assert.deepEqual([null,1,150,151,350,351].map(latencyQuality),['checking','good','good','fair','fair','poor']);assert.equal(LATENCY_INTERVAL.room,10000);assert.equal(LATENCY_INTERVAL.background,60000);assert.equal(LATENCY_INTERVAL.home,30000);
});
test('homepage probes return an uncached empty response without room credentials',async()=>{
  for(const handler of [GET,HEAD]){const res=handler();assert.equal(res.status,204);assert.equal(res.headers.get('Cache-Control'),'no-store');assert.equal(await res.text(),'');}
});
