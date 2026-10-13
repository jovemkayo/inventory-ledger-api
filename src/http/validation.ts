import type { IncomingMessage } from 'node:http';
import type { Pagination } from '../domain/contracts.ts';
import { InventoryError } from '../domain/errors.ts';

export function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InventoryError('INVALID_INPUT', 'A JSON object is required.');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(object, key))) {
    throw new InventoryError('INVALID_INPUT', 'Missing or unknown fields.');
  }
  return object;
}
export function pagination(query: URLSearchParams): Pagination {
  for (const key of query.keys()) {
    if (!['limit', 'offset'].includes(key) || query.getAll(key).length !== 1) throw new InventoryError('INVALID_INPUT', 'Invalid query parameters.');
  }
  const limit = query.get('limit') ?? '50'; const offset = query.get('offset') ?? '0';
  if (!/^\d+$/.test(limit) || !/^\d+$/.test(offset)) throw new InventoryError('INVALID_INPUT', 'Invalid pagination.');
  return { limit: Number(limit), offset: Number(offset) };
}
export async function readJson(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    req.resume(); throw new InventoryError('UNSUPPORTED_MEDIA', 'Content-Type must be application/json.');
  }
  const body = await new Promise<string>((resolve, reject) => {
    let size = 0; let chunks: Buffer[] = []; let exceeded = false;
    req.on('data', (chunk: Buffer) => {
      if (exceeded) return;
      size += chunk.length;
      if (size > 16384) { exceeded = true; chunks = []; reject(new InventoryError('BODY_TOO_LARGE', 'Body exceeds 16 KiB.')); }
      else chunks.push(chunk);
    });
    req.on('end', () => { if (!exceeded) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
    req.on('aborted', () => reject(new InventoryError('INVALID_INPUT', 'Request aborted.')));
  });
  try { return JSON.parse(body); } catch { throw new InventoryError('INVALID_INPUT', 'Invalid JSON.'); }
}
