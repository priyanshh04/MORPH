import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG, OUTPUT_TYPES } from "../../packages/shared/config.js";
import { mutateDb, readDb, id, now, logAudit } from "../../packages/database/store.js";
import { analyzeDocument, chunkDocument, parseUploadedContent, retrieve } from "../../packages/ai/document.js";
import { createProvider, listTemplates } from "../../packages/ai/provider.js";
import { verifyOutput } from "../../packages/ai/verification.js";
import { hashPassword, signToken, verifyPassword, verifyToken } from "./auth.js";
import { ensureSeedData } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const webDir = path.join(root, "apps", "web");
const exportDir = path.join(root, "exports");
const provider = createProvider();
const rate = new Map();

await ensureSeedData();

const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);
    if (rateLimited(req)) return json(res, 429, { error: "Rate limit exceeded" });
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
    return serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    return json(res, error.message === "Payload too large" ? 413 : 500, {
      error: error.message === "Payload too large" ? error.message : "Internal server error"
    });
  }
});

server.listen(CONFIG.port, "0.0.0.0", () => console.log(`MORPH running on port ${CONFIG.port}`));

async function handleApi(req, res, url) {
  const publicRoutes = ["/api/auth/login", "/api/auth/register", "/api/health"];
  const isPublic = publicRoutes.includes(url.pathname);
  const user = isPublic ? null : await requireUser(req, res);
  if (!isPublic && !user) return;
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, { ok: true, provider: provider.name, database: CONFIG.databaseUrl ? "postgres" : "json" });
  }
  if (req.method === "POST" && url.pathname === "/api/auth/login") return login(req, res);
  if (req.method === "POST" && url.pathname === "/api/auth/register") return register(req, res);
  if (req.method === "GET" && url.pathname === "/api/me") return json(res, 200, { user });
  if (req.method === "GET" && url.pathname === "/api/templates") return json(res, 200, { templates: listTemplates() });
  if (req.method === "GET" && url.pathname === "/api/documents") return documents(res, user);
  if (req.method === "POST" && url.pathname === "/api/documents/upload") return upload(req, res, user);
  if (req.method === "POST" && url.pathname.match(/^\/api\/documents\/[^/]+\/chat$/)) {
    return chat(req, res, user, url.pathname.split("/")[3]);
  }
  if (req.method === "POST" && url.pathname === "/api/documents/compare") return compare(req, res, user);
  if (req.method === "GET" && url.pathname === "/api/transformations") return outputs(res, user);
  if (req.method === "POST" && url.pathname === "/api/transformations") return transform(req, res, user);
  if (req.method === "POST" && url.pathname.match(/^\/api\/transformations\/[^/]+\/verify$/)) {
    return reverify(req, res, user, url.pathname.split("/")[3]);
  }
  if (req.method === "POST" && url.pathname.match(/^\/api\/transformations\/[^/]+\/version$/)) {
    return versionOutput(req, res, user, url.pathname.split("/")[3]);
  }
  if (req.method === "POST" && url.pathname.match(/^\/api\/exports\/[^/]+$/)) {
    return exportOutput(req, res, user, url.pathname.split("/")[3]);
  }
  if (req.method === "GET" && url.pathname === "/api/analytics") return analytics(res, user);
  return json(res, 404, { error: "Not found" });
}

async function login(req, res) {
  const body = await bodyJson(req);
  const db = await readDb();
  const email = String(body.email || "").trim().toLowerCase();
  const user = db.users.find((u) => u.email.toLowerCase() === email);
  if (!user || !verifyPassword(body.password || "", user.passwordHash)) return json(res, 401, { error: "Invalid credentials" });
  const token = signToken({ sub: user.id, role: user.role, email: user.email });
  await logAudit(user.id, "login");
  return json(res, 200, { token, user: safeUser(user) });
}

async function register(req, res) {
  const body = await bodyJson(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    return json(res, 400, { error: "A valid email and a password of at least 8 characters are required" });
  }
  const created = await mutateDb((db) => {
    if (db.users.some((u) => u.email.toLowerCase() === email)) return null;
    const user = {
      id: id("user"),
      name: String(body.name || "MORPH User").trim().slice(0, 100),
      email,
      role: "USER",
      passwordHash: hashPassword(password),
      createdAt: now()
    };
    db.users.push(user);
    return user;
  });
  if (!created) return json(res, 409, { error: "User already exists" });
  return json(res, 201, {
    token: signToken({ sub: created.id, role: created.role, email: created.email }),
    user: safeUser(created)
  });
}

async function documents(res, user) {
  const db = await readDb();
  const visible = db.documents.filter((d) => canAccess(user, d.uploadedBy));
  return json(res, 200, {
    documents: visible.map((d) => ({ ...d, text: d.text.slice(0, 4000) }))
  });
}

async function upload(req, res, user) {
  const body = await bodyJson(req, CONFIG.maxUploadMb * 1.5);
  if (!body.name && !body.content) return json(res, 400, { error: "Document name or content is required" });
  const parsed = await parseUploadedContent(body);
  if (!parsed.supported) return json(res, 415, { error: `Unsupported file type: ${parsed.fileType}` });
  const doc = {
    id: id("doc"), title: parsed.title, name: body.name || parsed.title, text: parsed.text,
    fileType: parsed.fileType, pages: parsed.pages,
    department: String(body.department || "General").slice(0, 100), uploadedBy: user.id,
    metadata: parsed.metadata, createdAt: now(), status: "Analyzed"
  };
  const chunks = chunkDocument(doc.id, doc.text);
  const analysis = analyzeDocument(doc, chunks);
  doc.intelligence = analysis.intelligence;
  await mutateDb((db) => {
    db.documents.push(doc);
    db.document_chunks.push(...chunks);
    db.document_facts.push(...analysis.facts);
    db.document_entities.push(...analysis.entities);
    db.usage_analytics.push({ id: id("metric"), type: "document_uploaded", userId: user.id, department: doc.department, createdAt: now() });
  });
  await logAudit(user.id, "document.upload", { documentId: doc.id, fileType: doc.fileType });
  return json(res, 201, { document: doc, chunks, facts: analysis.facts, entities: analysis.entities });
}

async function transform(req, res, user) {
  const body = await bodyJson(req);
  const db = await readDb();
  const ids = Array.isArray(body.documentIds) ? body.documentIds : [body.documentId];
  const requestedIds = [...new Set(ids.filter(Boolean))];
  if (!requestedIds.length) return json(res, 400, { error: "documentId or documentIds is required" });
  const docs = db.documents.filter((d) => requestedIds.includes(d.id));
  if (docs.length !== requestedIds.length || docs.some((d) => !canAccess(user, d.uploadedBy))) {
    return json(res, 404, { error: "Document not found" });
  }
  const requestedTypes = Array.isArray(body.outputTypes) ? body.outputTypes.slice(0, 14) : [body.outputType || "Citizen Simplifier"];
  const outputTypes = [...new Set(requestedTypes)].filter((type) => OUTPUT_TYPES.includes(type));
  if (!outputTypes.length) return json(res, 400, { error: "No supported output type was requested" });
  const outputs = [];
  for (const outputType of outputTypes) {
    const facts = db.document_facts.filter((f) => docs.some((d) => d.id === f.documentId));
    const chunks = db.document_chunks.filter((c) => docs.some((d) => d.id === c.documentId));
    const merged = {
      ...docs[0],
      title: docs.map((d) => d.title).join(" + "),
      text: docs.map((d) => d.text).join("\n\n")
    };
    const ai = await provider.transform({
      document: merged, facts, chunks, outputType,
      audience: body.audience || "Citizen", tone: body.tone || "Professional",
      length: body.length || "Medium", channel: body.channel || "Website",
      language: body.language || "English"
    });
    const verification = verifyOutput(ai.content, facts);
    const output = {
      id: id("out"), transformationId: id("tr"), documentIds: docs.map((d) => d.id),
      title: ai.title, outputType, audience: body.audience || "Citizen", tone: body.tone || "Professional",
      length: body.length || "Medium", language: body.language || "English", channel: body.channel || "Website",
      content: ai.content, provider: ai.provider, model: ai.model, citationMap: ai.citationMap,
      factualityScore: verification.factualityScore, citationCoverage: verification.citationCoverage,
      createdBy: user.id, createdAt: now(), version: 1, demo: ai.provider === "demo"
    };
    await mutateDb((wdb) => {
      wdb.transformations.push({ id: output.transformationId, documentIds: output.documentIds, requestedBy: user.id, outputType, createdAt: now() });
      wdb.generated_outputs.push(output);
      wdb.transformation_versions.push({ id: id("ver"), outputId: output.id, version: 1, content: output.content, createdBy: user.id, createdAt: now() });
      wdb.verification_results.push({ id: id("verify"), outputId: output.id, ...verification, createdAt: now() });
      wdb.usage_analytics.push({ id: id("metric"), type: "output_generated", userId: user.id, department: docs[0].department, outputType, language: output.language, factualityScore: output.factualityScore, citationCoverage: output.citationCoverage, createdAt: now() });
    });
    outputs.push({ ...output, verification });
  }
  await logAudit(user.id, "transformation.create", { count: outputs.length });
  return json(res, 201, { outputs });
}

async function chat(req, res, user, documentId) {
  const body = await bodyJson(req);
  const db = await readDb();
  const document = db.documents.find((d) => d.id === documentId);
  if (!document || !canAccess(user, document.uploadedBy)) return json(res, 404, { error: "Document not found" });
  const question = String(body.question || "").trim().slice(0, 2000);
  if (!question) return json(res, 400, { error: "Question is required" });
  const chunks = db.document_chunks.filter((c) => c.documentId === documentId);
  const evidence = retrieve(chunks, question);
  const answer = await provider.chat({ question, evidence });
  await logAudit(user.id, "document.chat", { documentId });
  return json(res, 200, answer);
}

async function compare(req, res, user) {
  const body = await bodyJson(req);
  const db = await readDb();
  const [a, b] = Array.isArray(body.documentIds) ? body.documentIds : [];
  if (!a || !b || a === b) return json(res, 400, { error: "Two different documentIds are required" });
  const docs = db.documents.filter((d) => d.id === a || d.id === b);
  if (docs.length !== 2 || docs.some((d) => !canAccess(user, d.uploadedBy))) return json(res, 404, { error: "Document not found" });
  const factsA = db.document_facts.filter((f) => f.documentId === a).map((f) => f.claim);
  const factsB = db.document_facts.filter((f) => f.documentId === b).map((f) => f.claim);
  const onlyA = factsA.filter((x) => !factsB.some((y) => overlap(x, y) > 0.55));
  const onlyB = factsB.filter((x) => !factsA.some((y) => overlap(x, y) > 0.55));
  return json(res, 200, {
    addedClauses: onlyB, removedClauses: onlyA,
    changedNumbers: diffRegex(factsA.join(" "), factsB.join(" "), /(?:INR|₹)?\s?\d[\d,]*(?:\s?(?:crore|lakh|%|days))?/gi),
    changedDates: diffRegex(factsA.join(" "), factsB.join(" "), /\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}/g)
  });
}

async function outputs(res, user) {
  const db = await readDb();
  const visible = db.generated_outputs.filter((o) => canAccess(user, o.createdBy));
  const outputIds = new Set(visible.map((o) => o.id));
  return json(res, 200, {
    outputs: visible.slice().reverse(),
    verification: db.verification_results.filter((v) => outputIds.has(v.outputId))
  });
}

async function reverify(req, res, user, outputId) {
  const db = await readDb();
  const output = db.generated_outputs.find((o) => o.id === outputId);
  if (!output || !canAccess(user, output.createdBy)) return json(res, 404, { error: "Output not found" });
  const facts = db.document_facts.filter((f) => output.documentIds.includes(f.documentId));
  const verification = verifyOutput(output.content, facts);
  await mutateDb((wdb) => wdb.verification_results.push({ id: id("verify"), outputId, ...verification, createdAt: now() }));
  return json(res, 200, verification);
}

async function versionOutput(req, res, user, outputId) {
  const body = await bodyJson(req);
  const content = String(body.content || "").trim();
  if (!content) return json(res, 400, { error: "Content is required" });
  if (content.length > 100000) return json(res, 413, { error: "Content is too large" });
  const version = await mutateDb((db) => {
    const out = db.generated_outputs.find((o) => o.id === outputId);
    if (!out || !canAccess(user, out.createdBy)) return null;
    out.version += 1;
    out.content = content;
    out.updatedAt = now();
    const ver = { id: id("ver"), outputId, version: out.version, content: out.content, createdBy: user.id, createdAt: now() };
    db.transformation_versions.push(ver);
    return ver;
  });
  if (!version) return json(res, 404, { error: "Output not found" });
  await logAudit(user.id, "transformation.version", { outputId, version: version.version });
  return json(res, 201, { version });
}

async function exportOutput(req, res, user, outputId) {
  const body = await bodyJson(req).catch(() => ({}));
  const db = await readDb();
  const out = db.generated_outputs.find((o) => o.id === outputId);
  if (!out || !canAccess(user, out.createdBy)) return json(res, 404, { error: "Output not found" });
  const format = ["md", "json"].includes(body.format) ? body.format : "md";
  await mkdir(exportDir, { recursive: true });
  const filename = `${out.outputType.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${outputId}.${format}`;
  const content = format === "json"
    ? JSON.stringify(out, null, 2)
    : `# ${out.title}\n\n${out.content}\n\nFactuality: ${out.factualityScore}%\nCitation coverage: ${out.citationCoverage}%\n`;
  const file = path.join(exportDir, filename);
  await writeFile(file, content, "utf8");
  await logAudit(user.id, "output.export", { outputId, format });
  return json(res, 200, { filename, format, content });
}

async function analytics(res, user) {
  const db = await readDb();
  const outputs = db.generated_outputs.filter((o) => canAccess(user, o.createdBy));
  const documents = db.documents.filter((d) => canAccess(user, d.uploadedBy));
  const transformations = db.transformations.filter((t) => canAccess(user, t.requestedBy));
  const avg = (key) => Math.round(outputs.reduce((s, o) => s + (o[key] || 0), 0) / Math.max(1, outputs.length));
  return json(res, 200, {
    documentsProcessed: documents.length,
    transformationsGenerated: transformations.length || outputs.length,
    outputsGenerated: outputs.length,
    languagesUsed: [...new Set(outputs.map((o) => o.language))].length,
    averageFactualityScore: avg("factualityScore"),
    averageCitationCoverage: avg("citationCoverage"),
    byType: group(outputs, "outputType"),
    byLanguage: group(outputs, "language"),
    byDepartment: group(documents, "department"),
    monthlyUsage: group(outputs.map((o) => ({ month: o.createdAt.slice(0, 7) })), "month")
  });
}

async function requireUser(req, res) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = verifyToken(token);
  if (!payload) { json(res, 401, { error: "Authentication required" }); return null; }
  const db = await readDb();
  const user = db.users.find((u) => u.id === payload.sub);
  if (!user) { json(res, 401, { error: "User session is no longer valid" }); return null; }
  return safeUser(user);
}

function canAccess(user, ownerId) {
  return user && (user.role === "ADMIN" || user.role === "OFFICER" || user.id === ownerId);
}

function safeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

async function bodyJson(req, maxMb = 2) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > maxMb * 1024 * 1024) throw new Error("Payload too large");
  }
  try { return data ? JSON.parse(data) : {}; } catch { throw new Error("Invalid JSON payload"); }
}

async function serveStatic(res, pathname) {
  const clean = pathname === "/" ? "/index.html" : pathname;
  const target = path.normalize(path.join(webDir, clean));
  if (!target.startsWith(webDir)) return json(res, 403, { error: "Forbidden" });
  try {
    const bytes = await readFile(target);
    const type = target.endsWith(".css") ? "text/css" : target.endsWith(".js") ? "text/javascript" : "text/html";
    res.writeHead(200, {
      "Content-Type": `${type}; charset=utf-8`,
      "Cache-Control": target.endsWith("index.html") ? "no-cache" : "public, max-age=3600"
    });
    return res.end(bytes);
  } catch {
    const html = await readFile(path.join(webDir, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(status === 204 ? "" : JSON.stringify(payload));
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

function rateLimited(req) {
  const key = req.socket.remoteAddress || "local";
  const bucket = rate.get(key) || { count: 0, at: Date.now() };
  if (Date.now() - bucket.at > 60_000) Object.assign(bucket, { count: 0, at: Date.now() });
  bucket.count += 1;
  rate.set(key, bucket);
  return bucket.count > 240;
}

function group(items, key) {
  return items.reduce((acc, item) => {
    const label = item[key] || "Unknown";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

function overlap(a, b) {
  const ax = new Set(a.toLowerCase().match(/[a-z0-9]+/g) || []);
  const bx = new Set(b.toLowerCase().match(/[a-z0-9]+/g) || []);
  return [...ax].filter((x) => bx.has(x)).length / Math.max(1, ax.size);
}

function diffRegex(a, b, re) {
  const left = [...new Set(a.match(re) || [])];
  const right = [...new Set(b.match(re) || [])];
  return { fromA: left.filter((x) => !right.includes(x)), fromB: right.filter((x) => !left.includes(x)) };
}
