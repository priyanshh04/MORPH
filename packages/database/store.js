import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const dataDir = path.join(root, "data");
const dbFile = path.join(dataDir, "db.json");

export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

const initial = {
  users: [],
  documents: [],
  document_chunks: [],
  document_facts: [],
  document_entities: [],
  transformations: [],
  transformation_versions: [],
  generated_outputs: [],
  citations: [],
  verification_results: [],
  confidence_results: [],
  source_conflicts: [],
  historical_echoes: [],
  security_scans: [],
  prompt_injection_findings: [],
  authenticity_checks: [],
  redaction_rules: [],
  redaction_events: [],
  reviews: [],
  approvals: [],
  artifacts: [],
  provenance_records: [],
  templates: [],
  usage_analytics: [],
  audit_logs: []
};

export async function readDb() {
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
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbFile, JSON.stringify(db, null, 2));
}

export async function mutateDb(fn) {
  const db = await readDb();
  const result = await fn(db);
  await writeDb(db);
  return result;
}

export async function logAudit(userId, action, details = {}) {
  await mutateDb((db) => {
    db.audit_logs.push({ id: id("audit"), userId, action, details, createdAt: now() });
  });
}
