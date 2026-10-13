import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type { InventoryService } from '../application/inventory-service.ts';
import type { ProductInput, MovementInput } from '../domain/contracts.ts';
import { InventoryError } from '../domain/errors.ts';
import { exactObject, pagination, readJson } from './validation.ts';

function respond(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
function localRequest(req: IncomingMessage): void {
  const port = req.socket.localPort;
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (port === 80) allowedHosts.push('127.0.0.1', 'localhost');
  if (!req.headers.host || !allowedHosts.includes(req.headers.host.toLowerCase())) throw new InventoryError('FORBIDDEN', 'Host is not allowed.');
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new InventoryError('FORBIDDEN', 'Origin is not allowed.');
}
export function createApp(service: InventoryService): Server {
  const server = createServer(async (req, res) => {
    try {
      localRequest(req);
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;
      const detail = /^\/products\/([^/]+)(\/movements)?$/.exec(path);
      let allowed: string[];
      if (path === '/health' || detail) allowed = ['GET'];
      else if (path === '/products') allowed = ['GET', 'POST'];
      else if (path === '/movements') allowed = ['POST'];
      else throw new InventoryError('NOT_FOUND', 'Route not found.');
      if (!allowed.includes(req.method ?? '')) { res.setHeader('Allow', allowed.join(', ')); throw new InventoryError('METHOD_NOT_ALLOWED', 'Method not allowed.'); }
      if (path === '/health') { respond(res, 200, { status: 'ok' }); return; }
      if (req.method === 'GET') {
        if (path === '/products') respond(res, 200, service.listProducts(pagination(url.searchParams)));
        else if (detail?.[2]) respond(res, 200, service.listMovements(detail[1]!, pagination(url.searchParams)));
        else respond(res, 200, service.getProduct(detail![1]!));
        return;
      }
      const body = await readJson(req);
      if (path === '/products') {
        const object = exactObject(body, ['sku', 'name', 'unit', 'minimumStock']);
        respond(res, 201, service.createProduct(object as unknown as ProductInput));
      } else {
        const object = exactObject(body, ['productId', 'type', 'quantity', 'reason']);
        respond(res, 201, service.recordMovement(object as unknown as MovementInput));
      }
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      if (error instanceof InventoryError) {
        const statuses: Record<string, number> = { NOT_FOUND: 404, DUPLICATE_SKU: 409, INSUFFICIENT_STOCK: 409, FORBIDDEN: 403, METHOD_NOT_ALLOWED: 405, UNSUPPORTED_MEDIA: 415, BODY_TOO_LARGE: 413 };
        respond(res, statuses[error.code] ?? 400, { error: { code: error.code, message: error.message } });
      } else respond(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.timeout = 10000;
  return server;
}
