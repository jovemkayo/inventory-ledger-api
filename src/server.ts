import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SqliteInventoryRepository } from './infrastructure/sqlite-repository.ts';
import { InventoryService } from './application/inventory-service.ts';
import { createApp } from './http/app.ts';

const rawPort = process.env.PORT ?? '3000';
if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const path = process.env.INVENTORY_DB_PATH ?? 'data/inventory.sqlite';
if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
const repository = new SqliteInventoryRepository(path);
const server = createApp(new InventoryService(repository));
server.on('error', () => { repository.close(); console.error('Unable to start the local API.'); process.exitCode = 1; });
server.listen(Number(rawPort), '127.0.0.1', () => console.log(`Inventory API: http://127.0.0.1:${rawPort}`));
let closing = false;
function shutdown(): void {
  if (closing) return;
  closing = true;
  server.close(() => repository.close());
  server.closeAllConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
