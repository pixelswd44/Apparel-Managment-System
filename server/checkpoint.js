/**
 * checkpoint.js
 * Run once to flush all pending WAL data into apparel.db
 *
 *   node checkpoint.js
 */
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath    = join(__dirname, 'apparel.db');

console.log('Opening:', dbPath);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

console.log('Running WAL checkpoint…');
const result = db.pragma('wal_checkpoint(TRUNCATE)');
console.log('Checkpoint result:', result);
// result: [{ busy, log, checkpointed }]
// busy        = 0 means no readers were blocking
// log         = number of pages in WAL before checkpoint
// checkpointed = number of pages written to main DB

db.close();
console.log('Done. All data is now in apparel.db');
