import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { CONFIG } from "../shared/config.js";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const dataDir = path.join(root, "data");
const dbFile = path.join(dataDir, "db.json");

export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

const initial = {
  users: [], documents: [], document_chunks: [], document_facts: [], document_entities: [], transformations: [],
  transformation_versions: [], generated_outputs: [], citations: [], verification_results: [], templates: [],
  usage_analytics: [], audit_logs: []
};

let pool;
let pgReady;

async function getPool() {
  if (!CONFIG.databaseUrl) return null;
  if (!pool) {
    pool = new Pool({ connectionString: CONFIG.databaseUrl, ssl: CONFIG.dbSsl ? { rejectUnauthorized: false } : false, max: Number(process.env.DB_POOL_SIZE || 5) });
    pgReady = pool.query(`CREATE TABLE IF NOT EXISTS morph_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL)`)
      .then(() => pool.query("INSERT INTO morph_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO NOTHING", [initial]))
      .then(() => true);
  }
  await pgReady;
  return pool;
}

export async function readDb() {
  const dbPool = await getPool();
  if (dbPool) {
    const { rows } = await dbPool.query("SELECT data FROM morph_state WHERE id = 1");
    return { ...initial, ...(rows[0]?.data || {}) };
  }
  await mkdir(dataDir, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(dbFile, "utf8"));
    return { ...initial, ...parsed };
  } catch {
    await writeDb(initial);
    return structuredClone(initial);
  }
}

export async function writeDb(db) {
  const dbPool = await getPool();
  if (dbPool) {
    await dbPool.query("UPDATE morph_state SET data = $1 WHERE id = 1", [db]);
    return;
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbFile, JSON.stringify(db, null, 2));
}

export async function mutateDb(fn) {
  const dbPool = await getPool();
  if (!dbPool) {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result;
  }
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT data FROM morph_state WHERE id = 1 FOR UPDATE");
    const db = { ...initial, ...(rows[0]?.data || {}) };
    const result = await fn(db);
    await client.query("UPDATE morph_state SET data = $1 WHERE id = 1", [db]);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function logAudit(userId, action, details = {}) {
  await mutateDb((db) => {
    db.audit_logs.push({ id: id("audit"), userId, action, details, createdAt: now() });
  });
}

export async function closeDb() {
  if (pool) await pool.end();
}
