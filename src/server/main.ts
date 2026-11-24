import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { openDb } from './db';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dbFile = process.env.DB_FILE ?? path.join(root, 'data', 'arch.db');
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

const app = buildApp({
  db: openDb(dbFile),
  webDir: path.join(root, 'dist', 'web'),
  logger: true,
});
await app.listen({ port, host });
app.log.info(`Arch Modeler on http://${host}:${port} (db: ${dbFile})`);
