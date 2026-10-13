import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { SqliteInventoryRepository } from '../src/infrastructure/sqlite-repository.ts';
import { InventoryService } from '../src/application/inventory-service.ts';
import { createApp } from '../src/http/app.ts';

async function setup(t: TestContext) {
  const repo = new SqliteInventoryRepository(':memory:');
  const server = createApp(new InventoryService(repo));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); repo.close(); });
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() as any };
  };
  return { base, call, repo };
}
const input = { sku: 'demo-1', name: 'Demo item', unit: 'kg', minimumStock: 0 };
test('HTTP product and movement flow persists exact stock and rejects conflicts', async (t) => {
  const { call } = await setup(t);
  assert.equal((await call('/health')).status, 200);
  const p = await call('/products', 'POST', input); assert.equal(p.status, 201);
  assert.equal((await call('/products', 'POST', input)).status, 409);
  const movement = { productId: p.data.id, type: 'in', quantity: 10, reason: 'Demo delivery' };
  assert.equal((await call('/movements', 'POST', movement)).status, 201);
  assert.equal((await call('/movements', 'POST', { ...movement, type: 'out', quantity: 11 })).status, 409);
  assert.equal((await call('/products/' + p.data.id)).data.stock, 10);
  assert.equal((await call('/products/' + p.data.id + '/movements')).data.total, 1);
  assert.equal((await call('/products?limit=1&offset=1')).data.items.length, 0);
  assert.equal((await call('/products?limit=1&offset=1')).data.total, 1);
  assert.equal((await call('/products/00000000-0000-4000-8000-000000000000')).status, 404);
});
test('HTTP rejects malformed bodies, IDs, extra fields and invalid pagination', async (t) => {
  const { base, call } = await setup(t);
  for (const body of [{ ...input, surprise: true }, null, [], { ...input, minimumStock: '0' }, { ...input, name: '' }, { ...input, unit: 'ton' }]) {
    assert.equal((await call('/products', 'POST', body)).status, 400);
  }
  for (const path of ['/products/nope', '/products?limit=0', '/products?limit=101', '/products?offset=-1', '/products?limit=1.5', '/products?limit=1&limit=2', '/products?extra=x']) {
    assert.equal((await call(path)).status, 400, path);
  }
  assert.equal((await fetch(base + '/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' })).status, 400);
  assert.equal((await fetch(base + '/products', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await call('/products', 'POST', { ...input, name: 'x'.repeat(17000) })).status, 413);
  assert.equal((await call('/products', 'DELETE')).status, 405);
  assert.equal((await call('/unknown')).status, 404);
});
test('HTTP permits its own origin and refuses external origins and hosts', async (t) => {
  const { base, call } = await setup(t);
  assert.equal((await call('/health', 'GET', undefined, { Origin: base })).status, 200);
  assert.equal((await call('/health', 'GET', undefined, { Origin: 'https://outside.example' })).status, 403);
  assert.equal((await call('/health', 'GET', undefined, { Origin: 'null' })).status, 403);
  const status = await new Promise<number>((resolve, reject) => {
    const req = request(base + '/health', { headers: { Host: 'attacker.example' } }, (res) => { res.resume(); resolve(res.statusCode!); });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 403);
});
test('two simultaneous outgoing requests cannot spend the same stock', async (t) => {
  const { call } = await setup(t);
  const p = await call('/products', 'POST', input);
  await call('/movements', 'POST', { productId: p.data.id, type: 'in', quantity: 10, reason: 'Delivery' });
  const results = await Promise.all([1, 2].map(() => call('/movements', 'POST', { productId: p.data.id, type: 'out', quantity: 7, reason: 'Usage' })));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await call('/products/' + p.data.id)).data.stock, 3);
  assert.equal((await call('/products/' + p.data.id + '/movements')).data.total, 2);
});
test('unexpected storage failures expose a generic error without internals', async (t) => {
  const { call, repo } = await setup(t);
  repo.listProducts = () => { throw new Error('SELECT /private/path secret-value'); };
  const response = await call('/products');
  assert.equal(response.status, 500);
  assert.deepEqual(response.data, { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } });
});
