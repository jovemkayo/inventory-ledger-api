import type { InventoryRepository, ProductInput, MovementInput, Pagination } from '../domain/contracts.ts';
import { InventoryError } from '../domain/errors.ts';
import { toMilliQuantity } from '../domain/quantity.ts';

export function validateId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new InventoryError('INVALID_INPUT', 'A valid UUID v4 is required.');
  }
}
function text(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new InventoryError('INVALID_INPUT', `${field} must contain 1 to ${max} characters.`);
  }
  return value.trim();
}
function validatePage(page: Pagination): void {
  if (!Number.isSafeInteger(page.limit) || page.limit < 1 || page.limit > 100 || !Number.isSafeInteger(page.offset) || page.offset < 0) {
    throw new InventoryError('INVALID_INPUT', 'Invalid pagination.');
  }
}
export class InventoryService {
  private readonly repository: InventoryRepository;
  constructor(repository: InventoryRepository) { this.repository = repository; }
  createProduct(input: ProductInput) {
    const rawSku = text(input.sku, 40, 'SKU');
    if (!/^[A-Za-z0-9_-]+$/.test(rawSku)) throw new InventoryError('INVALID_INPUT', 'Invalid SKU.');
    const sku = rawSku.toUpperCase();
    const name = text(input.name, 120, 'Name');
    if (!/^[A-Z0-9_-]+$/.test(sku) || !['unit', 'kg', 'g', 'l', 'ml'].includes(input.unit)) {
      throw new InventoryError('INVALID_INPUT', 'Invalid SKU or unit.');
    }
    toMilliQuantity(input.minimumStock, true);
    if (input.unit === 'unit' && !Number.isInteger(input.minimumStock)) {
      throw new InventoryError('INVALID_QUANTITY', 'Whole units require an integer quantity.');
    }
    return this.repository.createProduct({ ...input, sku, name });
  }
  getProduct(id: string) { validateId(id); return this.repository.getProduct(id.toLowerCase()); }
  listProducts(page: Pagination) { validatePage(page); return this.repository.listProducts(page); }
  recordMovement(input: MovementInput) {
    validateId(input.productId);
    if (input.type !== 'in' && input.type !== 'out') throw new InventoryError('INVALID_INPUT', 'Type must be in or out.');
    toMilliQuantity(input.quantity);
    const reason = text(input.reason, 240, 'Reason');
    return this.repository.recordMovement({ ...input, productId: input.productId.toLowerCase(), reason });
  }
  listMovements(productId: string, page: Pagination) {
    validateId(productId); validatePage(page);
    return this.repository.listMovements(productId.toLowerCase(), page);
  }
}
