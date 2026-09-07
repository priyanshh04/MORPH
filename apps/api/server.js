import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../../packages/shared/config.js";
import { mutateDb, readDb, id, now, logAudit } from "../../packages/database/store.js";
import { analyzeDocument, chunkDocument, parseUploadedContent, retrieve, questionIntent } from "../../packages/ai/document.js";
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
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
    return serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Internal server error", detail: error.message });
  }
});

server.listen(CONFIG.port, () => console.log(`TransformAI running at http://localhost:${CONFIG.port}`));

async function handleApi(req, res, url) {
  const publicRoutes = ["/api/auth/login", "/api/auth/register", "/api/health"];
  const user = publicRoutes.includes(url.pathname) ? null : await requireUser(req, res);
  if (!publicRoutes.includes(url.pathname) && !user) return;

  if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true, provider: provider.name });
  if (req.method === "POST" && url.pathname === "/api/auth/login") return login(req, res);
  if (req.method === "POST" && url.pathname === "/api/auth/register") return register(req, res);
  if (req.method === "GET" && url.pathname === "/api/me") return json(res, 200, { user });
  if (req.method === "GET" && url.pathname === "/api/templates") return json(res, 200, { templates: listTemplates() });
  if (req.method === "GET" && url.pathname === "/api/documents") return documents(res);
  if (req.method === "POST" && url.pathname === "/api/documents/upload") return upload(req, res, user);
  if (req.method === "POST" && url.pathname.match(/^\/api\/documents\/[^/]+\/chat$/)) return chat(req, res, user, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname === "/api/documents/compare") return compare(req, res);
  if (req.method === "GET" && url.pathname === "/api/transformations") return outputs(res);
  if (req.method === "POST" && url.pathname === "/api/transformations") return transform(req, res, user);
  if (req.method === "POST" && url.pathname.match(/^\/api\/transformations\/[^/]+\/verify$/)) return reverify(req, res, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname.match(/^\/api\/transformations\/[^/]+\/version$/)) return versionOutput(req, res, user, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname.match(/^\/api\/exports\/[^/]+$/)) return exportOutput(req, res, url.pathname.split("/")[3]);
  if (req.method === "GET" && url.pathname === "/api/analytics") return analytics(res);
  return json(res, 404, { error: "Not found" });
}

async function login(req, res) {
  const body = await bodyJson(req);
  const db = await readDb();
  const user = db.users.find((u) => u.email.toLowerCase() === String(body.email || "").toLowerCase());
  if (!user || !verifyPassword(body.password || "", user.passwordHash)) return json(res, 401, { error: "Invalid credentials" });
  const token = signToken({ sub: user.id, role: user.role, email: user.email });
  await logAudit(user.id, "login");
  json(res, 200, { token, user: safeUser(user) });
}

async function register(req, res) {
  const body = await bodyJson(req);
  if (!body.email || !body.password) return json(res, 400, { error: "Email and password are required" });
  const created = await mutateDb((db) => {
    if (db.users.some((u) => u.email === body.email)) return null;
    const user = { id: id("user"), name: body.name || "TransformAI User", email: body.email, role: "USER", passwordHash: hashPassword(body.password), createdAt: now() };
    db.users.push(user);
    return user;
  });
  if (!created) return json(res, 409, { error: "User already exists" });
  json(res, 201, { token: signToken({ sub: created.id, role: created.role, email: created.email }), user: safeUser(created) });
}

async function documents(res) {
  const db = await readDb();
  json(res, 200, { documents: db.documents.map((d) => ({ ...d, text: d.text.slice(0, 4000) })) });
}

async function upload(req, res, user) {
  const body = await bodyJson(req, CONFIG.maxUploadMb);
  const parsed = parseUploadedContent(body);
  const doc = { id: id("doc"), title: parsed.title, name: body.name || parsed.title, text: parsed.text, fileType: parsed.fileType, pages: parsed.pages, department: body.department || "General", uploadedBy: user.id, metadata: parsed.metadata, createdAt: now(), status: "Analyzed" };
  const chunks = chunkDocument(doc.id, doc.text);
  const analysis = analyzeDocument(doc, chunks);
  doc.intelligence = analysis.intelligence;
  await mutateDb((db) => {
    db.documents.push(doc);
    db.document_chunks.push(...chunks);
    db.document_facts.push(...analysis.facts);
    db.document_entities.push(...analysis.entities);
    db.usage_analytics.push({ id: id("metric"), type: "document_uploaded", department: doc.department, createdAt: now() });
  });
  await logAudit(user.id, "document.upload", { documentId: doc.id });
  json(res, 201, { document: doc, chunks, facts: analysis.facts, entities: analysis.entities });
}

async function transform(req, res, user) {
  const body = await bodyJson(req);
  const db = await readDb();
  const docs = db.documents.filter((d) => (body.documentIds || [body.documentId]).includes(d.id));
  if (!docs.length) return json(res, 404, { error: "Document not found" });
  const outputs = [];
  for (const outputType of body.outputTypes || [body.outputType || "Citizen Simplifier"]) {
    const facts = db.document_facts.filter((f) => docs.some((d) => d.id === f.documentId));
    const chunks = db.document_chunks.filter((c) => docs.some((d) => d.id === c.documentId));
    const merged = { ...docs[0], title: docs.map((d) => d.title).join(" + "), text: docs.map((d) => d.text).join("\n\n") };
    const ai = await provider.transform({ document: merged, facts, chunks, outputType, audience: body.audience || "Citizen", tone: body.tone || "Professional", length: body.length || "Medium", channel: body.channel || "Website", language: body.language || "English" });
    const verification = verifyOutput(ai.content, facts);
    const output = { id: id("out"), transformationId: id("tr"), documentIds: docs.map((d) => d.id), title: ai.title, outputType, audience: body.audience || "Citizen", tone: body.tone || "Professional", length: body.length || "Medium", language: body.language || "English", channel: body.channel || "Website", content: ai.content, provider: ai.provider, model: ai.model, citationMap: ai.citationMap, factualityScore: verification.factualityScore, citationCoverage: verification.citationCoverage, createdBy: user.id, createdAt: now(), version: 1, demo: ai.provider === "demo" };
    await mutateDb((wdb) => {
      wdb.transformations.push({ id: output.transformationId, documentIds: output.documentIds, requestedBy: user.id, outputType, createdAt: now() });
      wdb.generated_outputs.push(output);
      wdb.transformation_versions.push({ id: id("ver"), outputId: output.id, version: 1, content: output.content, createdAt: now() });
      wdb.verification_results.push({ id: id("verify"), outputId: output.id, ...verification, createdAt: now() });
      wdb.usage_analytics.push({ id: id("metric"), type: "output_generated", department: docs[0].department, outputType, language: output.language, factualityScore: output.factualityScore, citationCoverage: output.citationCoverage, createdAt: now() });
    });
    outputs.push({ ...output, verification });
  }
  await logAudit(user.id, "transformation.create", { count: outputs.length });
  json(res, 201, { outputs });
}

async function chat(req, res, user, documentId) {
  const body = await bodyJson(req);
  const db = await readDb();
  const chunks = db.document_chunks.filter((c) => c.documentId === documentId);
  const question = String(body.question || "").trim();
  const intent = questionIntent(question);
  // Q&A needs broader evidence coverage than the artifact UI. Count/general questions
  // may depend on information spread across many pages, so search the full document.
  const evidenceLimit = ["count", "general"].includes(intent) ? Math.max(20, chunks.length) : 8;
  const evidence = retrieve(chunks, question, evidenceLimit);
  const answer = await provider.chat({ question, evidence });
  await logAudit(user.id, "document.chat", { documentId, intent });
  json(res, 200, answer);
}

async function compare(req, res) {
  const body = await bodyJson(req);
  const db = await readDb();
  const [a, b] = body.documentIds || [];
  const factsA = db.document_facts.filter((f) => f.documentId === a).map((f) => f.claim);
  const factsB = db.document_facts.filter((f) => f.documentId === b).map((f) => f.claim);
  const onlyA = factsA.filter((x) => !factsB.some((y) => overlap(x, y) > 0.55));
  const onlyB = factsB.filter((x) => !factsA.some((y) => overlap(x, y) > 0.55));
  json(res, 200, { addedClauses: onlyB, removedClauses: onlyA, changedNumbers: diffRegex(factsA.join(" "), factsB.join(" "), /(?:INR|₹)?\s?\d[\d,]*(?:\s?(?:crore|lakh|%|days))?/gi), changedDates: diffRegex(factsA.join(" "), factsB.join(" "), /\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}/g) });
}

async function outputs(res) {
  const db = await readDb();
  json(res, 200, { outputs: db.generated_outputs.slice().reverse(), verification: db.verification_results });
}

async function reverify(req, res, outputId) {
  const db = await readDb();
  const output = db.generated_outputs.find((o) => o.id === outputId);
  if (!output) return json(res, 404, { error: "Output not found" });
  const facts = db.document_facts.filter((f) => output.documentIds.includes(f.documentId));
  const verification = verifyOutput(output.content, facts);
  await mutateDb((wdb) => wdb.verification_results.push({ id: id("verify"), outputId, ...verification, createdAt: now() }));
  json(res, 200, verification);
}

async function versionOutput(req, res, user, outputId) {
  const body = await bodyJson(req);
  const version = await mutateDb((db) => {
    const out = db.generated_outputs.find((o) => o.id === outputId);
    if (!out) return null;
    out.version += 1;
    out.content = body.content || out.content;
    out.updatedAt = now();
    const ver = { id: id("ver"), outputId, version: out.version, content: out.content, createdBy: user.id, createdAt: now() };
    db.transformation_versions.push(ver);
    return ver;
  });
  if (!version) return json(res, 404, { error: "Output not found" });
  json(res, 201, { version });
}

async function exportOutput(req, res, outputId) {
  const body = await bodyJson(req).catch(() => ({}));
  const db = await readDb();
  const out = db.generated_outputs.find((o) => o.id === outputId);
  if (!out) return json(res, 404, { error: "Output not found" });
  await mkdir(exportDir, { recursive: true });
  const format = body.format || "md";
  const file = path.join(exportDir, `${out.outputType.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${outputId}.${format}`);
  const content = format === "json" ? JSON.stringify(out, null, 2) : `# ${out.title}\n\n${out.content}\n\nFactuality: ${out.factualityScore}%\nCitation coverage: ${out.citationCoverage}%\n`;
  await writeFile(file, content);
  json(res, 200, { file, content });
}

async function analytics(res) {
  const db = await readDb();
  const outputs = db.generated_outputs;
  const avg = (key) => Math.round(outputs.reduce((s, o) => s + (o[key] || 0), 0) / Math.max(1, outputs.length));
  json(res, 200, {
    documentsProcessed: db.documents.length,
    transformationsGenerated: db.transformations.length || outputs.length,
    outputsGenerated: outputs.length,
    languagesUsed: [...new Set(outputs.map((o) => o.language))].length,
    averageFactualityScore: avg("factualityScore"),
    averageCitationCoverage: avg("citationCoverage"),
    byType: group(outputs, "outputType"),
    byLanguage: group(outputs, "language"),
    byDepartment: group(db.documents, "department"),
    monthlyUsage: group(outputs.map((o) => ({ month: o.createdAt.slice(0, 7) })), "month")
  });
}

async function requireUser(req, res) {
  const payload = verifyToken((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  if (!payload) {
    json(res, 401, { error: "Authentication required" });
    return null;
  }
  const db = await readDb();
  const user = db.users.find((u) => u.id === payload.sub);
  return user ? safeUser(user) : null;
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
  return data ? JSON.parse(data) : {};
}

async function serveStatic(res, pathname) {
  const clean = pathname === "/" ? "/index.html" : pathname;
  const target = path.normalize(path.join(webDir, clean));
  if (!target.startsWith(webDir)) return json(res, 403, { error: "Forbidden" });
  try {
    const bytes = await readFile(target);
    const type = target.endsWith(".css") ? "text/css" : target.endsWith(".js") ? "text/javascript" : "text/html";
    res.writeHead(200, { "content-type": type });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function setSecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
}

function rateLimited(req) {
  const key = req.socket.remoteAddress || "unknown";
  const nowMs = Date.now();
  const entry = rate.get(key) || { count: 0, reset: nowMs + 60_000 };
  if (nowMs > entry.reset) { entry.count = 0; entry.reset = nowMs + 60_000; }
  entry.count += 1;
  rate.set(key, entry);
  return entry.count > 120;
}

function overlap(a, b) {
  const A = new Set((a.toLowerCase().match(/[a-z0-9]+/g) || []));
  const B = new Set((b.toLowerCase().match(/[a-z0-9]+/g) || []));
  const intersection = [...A].filter((x) => B.has(x)).length;
  return intersection / Math.max(1, Math.min(A.size, B.size));
}

function diffRegex(a, b, regex) {
  const A = [...a.matchAll(regex)].map((m) => m[0]);
  const B = [...b.matchAll(regex)].map((m) => m[0]);
  return { before: [...new Set(A)], after: [...new Set(B)].filter((x) => !A.includes(x)) };
}

function group(items, key) {
  return items.reduce((acc, item) => { const value = item[key] || "Unknown"; acc[value] = (acc[value] || 0) + 1; return acc; }, {});
}
