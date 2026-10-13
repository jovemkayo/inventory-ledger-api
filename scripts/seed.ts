import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SqliteInventoryRepository } from '../src/infrastructure/sqlite-repository.ts';
import { InventoryService } from '../src/application/inventory-service.ts';

const path = process.env.INVENTORY_DB_PATH ?? 'data/inventory.sqlite';
if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
const repo = new SqliteInventoryRepository(path);
try {
  const service = new InventoryService(repo);
  if (service.listProducts({ limit: 1, offset: 0 }).total > 0) {
    console.error('Seed refused: database already contains products. No data was reset.');
    process.exitCode = 1;
  } else {
    for (const item of [
      { sku: 'DEMO-BOX', name: 'Example box', unit: 'unit' as const, quantity: 20 },
      { sku: 'DEMO-GRAIN', name: 'Example grain', unit: 'kg' as const, quantity: 5 },
      { sku: 'DEMO-LIQUID', name: 'Example liquid', unit: 'l' as const, quantity: 2.5 },
    ]) {
      const p = service.createProduct({ sku: item.sku, name: item.name, unit: item.unit, minimumStock: 0 });
      service.recordMovement({ productId: p.id, type: 'in', quantity: item.quantity, reason: 'Fictional opening stock' });
    }
    console.log('Created three fictional products and opening movements.');
  }
} finally { repo.close(); }
