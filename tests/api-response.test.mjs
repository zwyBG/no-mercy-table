import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiResponse } from '../lib/api-response.ts';
test('room responses accept JSON and never expose HTML parser errors', async () => {
  assert.deepEqual(await readApiResponse(Response.json({ code: 'ABC234' })), { code: 'ABC234' });
  for (const status of [200, 404, 503]) await assert.rejects(readApiResponse(new Response('<!DOCTYPE html><html>Service unavailable</html>', { status, headers: { 'Content-Type': 'text/html' } })), e => !e.message.includes('Unexpected') && !e.message.includes('DOCTYPE'));
  await assert.rejects(readApiResponse(new Response('{broken', { headers: { 'Content-Type': 'application/json' } })), /数据暂时未完整/);
});
