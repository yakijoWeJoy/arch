import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleModel } from '../shared/sample';
import { openDb } from './db';
import { importModel, isEmpty } from './repo';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dbFile = process.env.DB_FILE ?? path.join(root, 'data', 'arch.db');
const db = openDb(dbFile);
if (!isEmpty(db)) {
  console.error(`${dbFile} already has data — seed skipped.`);
  process.exit(1);
}
importModel(db, sampleModel());
console.log(`Seeded sample model into ${dbFile}`);
