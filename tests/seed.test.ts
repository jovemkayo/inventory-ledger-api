import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteInventoryRepository } from '../src/infrastructure/sqlite-repository.ts';

test('seed creates fictional data once and refuses to reset a populated database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'inventory-seed-')); const path = join(dir, 'seed.sqlite');
  const run = () => spawnSync(process.execPath, ['scripts/seed.ts'], { encoding: 'utf8', env: { ...process.env, INVENTORY_DB_PATH: path } });
  try {
    const first = run(); assert.equal(first.status, 0, first.stderr);
    let repo = new SqliteInventoryRepository(path);
    const before = repo.listProducts({ limit: 50, offset: 0 }); repo.close();
    assert.equal(before.total, 3); assert.deepEqual(before.items.map((p) => p.stock), [20, 5, 2.5]);
    assert.equal(run().status, 1);
    repo = new SqliteInventoryRepository(path);
    assert.deepEqual(repo.listProducts({ limit: 50, offset: 0 }), before); repo.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
