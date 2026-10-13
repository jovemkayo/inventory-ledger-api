import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteInventoryRepository } from '../src/infrastructure/sqlite-repository.ts';
import { InventoryService } from '../src/application/inventory-service.ts';

const product = { sku: 'coffee-01', name: 'Demo coffee', unit: 'kg' as const, minimumStock: 0 };
test('creates normalized SKU and rejects a case-insensitive duplicate', (t) => {
  const repo = new SqliteInventoryRepository(':memory:'); t.after(() => repo.close());
  const service = new InventoryService(repo);
  const item = service.createProduct(product);
  assert.equal(item.sku, 'COFFEE-01'); assert.equal(item.stock, 0);
  assert.throws(() => service.createProduct({ ...product, sku: 'COFFEE-01' }), { code: 'DUPLICATE_SKU' });
  assert.equal(service.listProducts({ limit: 50, offset: 0 }).total, 1);
});
test('records stock and history while preserving both on insufficient stock', (t) => {
  const repo = new SqliteInventoryRepository(':memory:'); t.after(() => repo.close());
  const service = new InventoryService(repo); const p = service.createProduct(product);
  service.recordMovement({ productId: p.id, type: 'in', quantity: 10, reason: 'Delivery' });
  service.recordMovement({ productId: p.id, type: 'out', quantity: 3, reason: 'Usage' });
  assert.equal(service.getProduct(p.id).stock, 7);
  assert.throws(() => service.recordMovement({ productId: p.id, type: 'out', quantity: 8, reason: 'Usage' }), { code: 'INSUFFICIENT_STOCK' });
  assert.equal(service.getProduct(p.id).stock, 7);
  assert.equal(service.listMovements(p.id, { limit: 50, offset: 0 }).total, 2);
});
test('rejects unknown products and whole-unit fractions', (t) => {
  const repo = new SqliteInventoryRepository(':memory:'); t.after(() => repo.close());
  const s = new InventoryService(repo);
  assert.throws(() => s.getProduct('00000000-0000-4000-8000-000000000000'), { code: 'NOT_FOUND' });
  const p = s.createProduct({ ...product, unit: 'unit' });
  assert.throws(() => s.recordMovement({ productId: p.id, type: 'in', quantity: 0.5, reason: 'Fraction' }), { code: 'INVALID_QUANTITY' });
  assert.throws(() => s.createProduct({ ...product, sku: 'other', unit: 'unit', minimumStock: 0.5 }), { code: 'INVALID_QUANTITY' });
});
test('validates text, unit, movement type and pagination in the application boundary', (t) => {
  const repo = new SqliteInventoryRepository(':memory:'); t.after(() => repo.close());
  const s = new InventoryService(repo);
  for (const input of [{ ...product, name: '' }, { ...product, sku: 'bad sku' }, { ...product, unit: 'ton' }, { ...product, name: 'x'.repeat(121) }]) {
    assert.throws(() => s.createProduct(input as typeof product), { code: 'INVALID_INPUT' });
  }
  const p = s.createProduct(product);
  assert.throws(() => s.recordMovement({ productId: p.id, type: 'in', quantity: 1, reason: '' }), { code: 'INVALID_INPUT' });
  assert.throws(() => s.recordMovement({ productId: p.id, type: 'bad' as 'in', quantity: 1, reason: 'x' }), { code: 'INVALID_INPUT' });
  assert.throws(() => s.listProducts({ limit: 101, offset: 0 }), { code: 'INVALID_INPUT' });
});
test('decimal movements remain exact and lists paginate without losing total', (t) => {
  const repo = new SqliteInventoryRepository(':memory:'); t.after(() => repo.close());
  const s = new InventoryService(repo); const p = s.createProduct(product);
  s.recordMovement({ productId: p.id, type: 'in', quantity: 0.3, reason: 'Delivery' });
  s.recordMovement({ productId: p.id, type: 'out', quantity: 0.1, reason: 'Usage' });
  assert.equal(s.getProduct(p.id).stock, 0.2);
  const page = s.listMovements(p.id, { limit: 1, offset: 1 });
  assert.equal(page.total, 2); assert.equal(page.items.length, 1);
});
test('database reopens with the same stock and movements', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inventory-test-')); const file = join(dir, 'test.sqlite');
  let repo = new SqliteInventoryRepository(file);
  try {
    const s = new InventoryService(repo); const p = s.createProduct(product);
    s.recordMovement({ productId: p.id, type: 'in', quantity: 2.5, reason: 'Delivery' });
    repo.close(); repo = new SqliteInventoryRepository(file);
    assert.equal(repo.getProduct(p.id).stock, 2.5);
    assert.equal(repo.listMovements(p.id, { limit: 50, offset: 0 }).total, 1);
  } finally { repo.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('failed history insertion rolls stock back using a real database trigger', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inventory-rollback-')); const file = join(dir, 'test.sqlite');
  const repo = new SqliteInventoryRepository(file); const admin = new DatabaseSync(file);
  try {
    const p = repo.createProduct(product);
    admin.exec("CREATE TRIGGER fail_history BEFORE INSERT ON movements BEGIN SELECT RAISE(ABORT, 'injected failure'); END;");
    assert.throws(() => repo.recordMovement({ productId: p.id, type: 'in', quantity: 4, reason: 'Delivery' }));
    assert.equal(repo.getProduct(p.id).stock, 0);
    assert.equal(repo.listMovements(p.id, { limit: 50, offset: 0 }).total, 0);
  } finally { admin.close(); repo.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('uppercase UUIDs resolve the same product and history', (t) => {
  const repo = new SqliteInventoryRepository(':memory:'); t.after(() => repo.close());
  const s = new InventoryService(repo); const p = s.createProduct(product);
  assert.equal(s.getProduct(p.id.toUpperCase()).id, p.id);
  s.recordMovement({ productId: p.id.toUpperCase(), type: 'in', quantity: 1, reason: 'Delivery' });
  assert.equal(s.listMovements(p.id.toUpperCase(), { limit: 50, offset: 0 }).total, 1);
});
test('non-ASCII SKUs are rejected before uppercase expansion', (t) => {
  const repo = new SqliteInventoryRepository(':memory:'); t.after(() => repo.close());
  const s = new InventoryService(repo);
  assert.throws(() => s.createProduct({ ...product, sku: 'ß'.repeat(40) }), { code: 'INVALID_INPUT' });
  assert.equal(s.listProducts({ limit: 50, offset: 0 }).total, 0);
});
test('stock limit rejects overflow without creating a movement', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inventory-limit-')); const file = join(dir, 'test.sqlite');
  const repo = new SqliteInventoryRepository(file); const admin = new DatabaseSync(file);
  try {
    const p = repo.createProduct(product);
    admin.prepare('UPDATE products SET stock_milli = ? WHERE id = ?').run(1_000_000_000_000, p.id);
    assert.throws(() => repo.recordMovement({ productId: p.id, type: 'in', quantity: 0.001, reason: 'Delivery' }), { code: 'INVALID_QUANTITY' });
    assert.equal(repo.getProduct(p.id).stock, 1_000_000_000);
    assert.equal(repo.listMovements(p.id, { limit: 50, offset: 0 }).total, 0);
    repo.recordMovement({ productId: p.id, type: 'out', quantity: 0.001, reason: 'Usage' });
    assert.equal(repo.getProduct(p.id).stock, 999_999_999.999);
  } finally { admin.close(); repo.close(); rmSync(dir, { recursive: true, force: true }); }
});
