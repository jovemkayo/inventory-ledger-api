export class InventoryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'InventoryError';
    this.code = code;
  }
}
