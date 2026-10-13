import { InventoryError } from './errors.ts';

/** Store three decimal places as integers; reject additional precision. */
export function toMilliQuantity(value: unknown, allowZero = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < (allowZero ? 0 : 0.001) || value > 1_000_000) {
    throw new InventoryError('INVALID_QUANTITY', 'Quantity must be positive and at most 1000000, with up to three decimals.');
  }
  const scaled = value * 1000;
  const rounded = Math.round(scaled);
  if (rounded / 1000 !== value) {
    throw new InventoryError('INVALID_QUANTITY', 'Quantity supports up to three decimal places.');
  }
  return rounded;
}
export function fromMilliQuantity(value: number): number { return value / 1000; }
