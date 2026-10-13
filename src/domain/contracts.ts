export type Unit = 'unit' | 'kg' | 'g' | 'l' | 'ml';
export interface ProductInput { sku: string; name: string; unit: Unit; minimumStock: number }
export interface Product extends ProductInput { id: string; stock: number; createdAt: string }
export interface MovementInput { productId: string; type: 'in' | 'out'; quantity: number; reason: string }
export interface Movement extends MovementInput { id: string; createdAt: string }
export interface Pagination { limit: number; offset: number }
export interface Page<T> { items: T[]; total: number }
export interface InventoryRepository {
  createProduct(input: ProductInput): Product;
  getProduct(id: string): Product;
  listProducts(page: Pagination): Page<Product>;
  recordMovement(input: MovementInput): Movement;
  listMovements(productId: string, page: Pagination): Page<Movement>;
  close(): void;
}
