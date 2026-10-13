import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { InventoryRepository, ProductInput, Product, MovementInput, Movement, Pagination, Page } from '../domain/contracts.ts';
import { InventoryError } from '../domain/errors.ts';
import { toMilliQuantity, fromMilliQuantity } from '../domain/quantity.ts';

type ProductRow = Omit<Product, 'stock' | 'minimumStock'> & { stock_milli: number; minimum_milli: number };
type MovementRow = Omit<Movement, 'quantity'> & { quantity_milli: number };
function productFrom(row: ProductRow): Product {
  const { stock_milli, minimum_milli, ...fields } = row;
  return { ...fields, stock: fromMilliQuantity(stock_milli), minimumStock: fromMilliQuantity(minimum_milli) };
}
function movementFrom(row: MovementRow): Movement {
  const { quantity_milli, ...fields } = row;
  return { ...fields, quantity: fromMilliQuantity(quantity_milli) };
}

export class SqliteInventoryRepository implements InventoryRepository {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path, { timeout: 1000 });
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('unit','kg','g','l','ml')),
        minimum_milli INTEGER NOT NULL CHECK(minimum_milli BETWEEN 0 AND 1000000000),
        stock_milli INTEGER NOT NULL DEFAULT 0 CHECK(stock_milli BETWEEN 0 AND 1000000000000),
        createdAt TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS movements (
        id TEXT PRIMARY KEY, productId TEXT NOT NULL REFERENCES products(id),
        type TEXT NOT NULL CHECK(type IN ('in','out')),
        quantity_milli INTEGER NOT NULL CHECK(quantity_milli BETWEEN 1 AND 1000000000),
        reason TEXT NOT NULL, createdAt TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS movements_product ON movements(productId);
    `);
  }
  createProduct(input: ProductInput): Product {
    const id = randomUUID(); const createdAt = new Date().toISOString();
    try {
      this.db.prepare('INSERT INTO products(id,sku,name,unit,minimum_milli,createdAt) VALUES(?,?,?,?,?,?)')
        .run(id, input.sku.toUpperCase(), input.name, input.unit, toMilliQuantity(input.minimumStock, true), createdAt);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: products.sku')) {
        throw new InventoryError('DUPLICATE_SKU', 'SKU already exists.');
      }
      throw error;
    }
    return this.getProduct(id);
  }
  getProduct(id: string): Product {
    const row = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined;
    if (!row) throw new InventoryError('NOT_FOUND', 'Product not found.');
    return productFrom(row);
  }
  listProducts(page: Pagination): Page<Product> {
    const rows = this.db.prepare('SELECT * FROM products ORDER BY rowid LIMIT ? OFFSET ?').all(page.limit, page.offset) as ProductRow[];
    const count = this.db.prepare('SELECT COUNT(*) AS total FROM products').get() as { total: number };
    return { items: rows.map(productFrom), total: count.total };
  }
  recordMovement(input: MovementInput): Movement {
    const quantity = toMilliQuantity(input.quantity);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const p = this.getProduct(input.productId);
      if (p.unit === 'unit' && quantity % 1000 !== 0) throw new InventoryError('INVALID_QUANTITY', 'Whole units require an integer quantity.');
      const row = this.db.prepare('SELECT stock_milli FROM products WHERE id = ?').get(p.id) as { stock_milli: number };
      const current = row.stock_milli;
      const next = current + (input.type === 'in' ? quantity : -quantity);
      if (next < 0) throw new InventoryError('INSUFFICIENT_STOCK', 'Insufficient stock.');
      if (!Number.isSafeInteger(next) || next > 1_000_000_000_000) throw new InventoryError('INVALID_QUANTITY', 'Stock exceeds the supported range.');
      const movement: Movement = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
      this.db.prepare('UPDATE products SET stock_milli = ? WHERE id = ?').run(next, p.id);
      this.db.prepare('INSERT INTO movements(id,productId,type,quantity_milli,reason,createdAt) VALUES(?,?,?,?,?,?)')
        .run(movement.id, p.id, input.type, quantity, input.reason, movement.createdAt);
      this.db.exec('COMMIT');
      return movement;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  listMovements(productId: string, page: Pagination): Page<Movement> {
    this.getProduct(productId);
    const rows = this.db.prepare('SELECT * FROM movements WHERE productId = ? ORDER BY rowid LIMIT ? OFFSET ?')
      .all(productId, page.limit, page.offset) as MovementRow[];
    const count = this.db.prepare('SELECT COUNT(*) AS total FROM movements WHERE productId = ?').get(productId) as { total: number };
    return { items: rows.map(movementFrom), total: count.total };
  }
  close(): void { this.db.close(); }
}
