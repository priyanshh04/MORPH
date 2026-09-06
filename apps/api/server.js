import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../../packages/shared/config.js";
import { mutateDb, readDb, id, now, logAudit } from "../../packages/database/store.js";
import { analyzeDocument, chunkDocument, parseUploadedContent, retrieve } from "../../packages/ai/document.js";
import { createProvider, listTemplates } from "../../packages/ai/provider.js";
import { verifyOutput } from "../../packages/ai/verification.js";
import { hashPassword, signToken, verifyPassword, verifyToken } from "./auth.js";
import { ensureSeedData } from "./seed.js";
import { assessAuthenticity, scanContent, validateUpload } from "../../packages/ai/security.js";
import { redactText, syntheticTestData } from "../../packages/ai/redaction.js";
import { biasNeutralize, confidenceForClaim, detectConflicts, historicalEchoes, oracleScenario } from "../../packages/ai/confidence.js";
import { artifactRecord, verifyArtifact } from "../../packages/ai/provenance.js";

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

server.listen(CONFIG.port, () => console.log(`MORPH running at http://localhost:${CONFIG.port}`));

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
  if (req.method === "POST" && url.pathname === "/api/documents/swarm") return swarm(req, res, user);
  if (req.method === "POST" && url.pathname.match(/^\/api\/documents\/[^/]+\/analyze$/)) return analyzeExisting(req, res, user, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname.match(/^\/api\/documents\/[^/]+\/chat$/)) return chat(req, res, user, url.pathname.split("/")[3]);
  if (req.method === "GET" && url.pathname.match(/^\/api\/documents\/[^/]+\/glass-box$/)) return glassBox(req, res, url.pathname.split("/")[3]);
  if (req.method === "GET" && url.pathname.match(/^\/api\/documents\/[^/]+\/immune$/)) return immune(req, res, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname.match(/^\/api\/documents\/[^/]+\/redact$/)) return redact(req, res, user, url.pathname.split("/")[3]);
  if (req.method === "GET" && url.pathname.match(/^\/api\/documents\/[^/]+\/echoes$/)) return echoes(req, res, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname.match(/^\/api\/documents\/[^/]+\/neutralize$/)) return neutralize(req, res, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname.match(/^\/api\/documents\/[^/]+\/oracle$/)) return oracle(req, res, url.pathname.split("/")[3]);
  if (req.method === "GET" && url.pathname.match(/^\/api\/documents\/[^/]+\/authenticity$/)) return authenticity(req, res, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname.match(/^\/api\/documents\/[^/]+\/synthetic$/)) return synthetic(req, res, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname === "/api/documents/compare") return compare(req, res);
  if (req.method === "GET" && url.pathname === "/api/transformations") return outputs(res);
  if (req.method === "POST" && url.pathname === "/api/transformations") return transform(req, res, user);
  if (req.method === "POST" && url.pathname.match(/^\/api\/transformations\/[^/]+\/verify$/)) return reverify(req, res, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname.match(/^\/api\/transformations\/[^/]+\/version$/)) return versionOutput(req, res, user, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname.match(/^\/api\/reviews\/[^/]+$/)) return reviewOutput(req, res, user, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname.match(/^\/api\/exports\/[^/]+$/)) return exportOutput(req, res, url.pathname.split("/")[3]);
  if (req.method === "POST" && url.pathname === "/api/provenance/verify") return provenanceVerify(req, res);
  if (req.method === "GET" && url.pathname === "/api/analytics") return analytics(res);
  if (req.method === "GET" && url.pathname === "/api/audit") return audit(res);
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
    const user = { id: id("user"), name: body.name || "MORPH User", email: body.email, role: "USER", clearance: "PUBLIC", passwordHash: hashPassword(body.password), createdAt: now() };
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
  const validation = validateUpload(body, CONFIG.maxUploadMb);
  if (!validation.ok) return json(res, 400, { error: "Upload rejected", details: validation.errors });
  body.name = validation.filename;
  const parsed = parseUploadedContent(body);
  const doc = { id: id("doc"), title: parsed.title, name: body.name || parsed.title, text: parsed.text, fileType: parsed.fileType, pages: parsed.pages, department: body.department || "General", uploadedBy: user.id, metadata: parsed.metadata, createdAt: now(), status: "Analyzed" };
  const scan = scanContent({ documentId: doc.id, filename: doc.name, text: doc.text });
  doc.text = scan.sanitizedText;
  const chunks = chunkDocument(doc.id, doc.text);
  const analysis = analyzeDocument(doc, chunks);
  const auth = assessAuthenticity(doc);
  const echoes = [];
  doc.intelligence = analysis.intelligence;
  await mutateDb((db) => {
    db.documents.push(doc);
    db.document_chunks.push(...chunks);
    db.document_facts.push(...analysis.facts);
    db.document_entities.push(...analysis.entities);
    db.security_scans.push(scan);
    db.prompt_injection_findings.push(...scan.findings);
    db.authenticity_checks.push(auth);
    db.historical_echoes.push(...echoes);
    db.usage_analytics.push({ id: id("metric"), type: "document_uploaded", department: doc.department, createdAt: now() });
  });
  await logAudit(user.id, "document.upload", { documentId: doc.id });
  json(res, 201, { document: doc, chunks, facts: analysis.facts, entities: analysis.entities, securityScan: scan, authenticity: auth });
}

async function swarm(req, res, user) {
  const body = await bodyJson(req, CONFIG.maxUploadMb);
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) return json(res, 400, { error: "No files supplied" });
  const results = [];
  for (const file of files) {
    const validation = validateUpload(file, CONFIG.maxUploadMb);
    const stages = ["Queued", "Security scanning"];
    if (!validation.ok) {
      results.push({ name: file.name, status: "Failed", stages, errors: validation.errors });
      continue;
    }
    stages.push("Extracting", "Chunking", "Embedding", "Indexed");
    const parsed = parseUploadedContent({ ...file, name: validation.filename });
    const doc = { id: id("doc"), title: parsed.title, name: validation.filename, text: parsed.text, fileType: parsed.fileType, pages: parsed.pages, department: body.department || "Swarm", uploadedBy: user.id, metadata: parsed.metadata, createdAt: now(), status: "Indexed" };
    const scan = scanContent({ documentId: doc.id, filename: doc.name, text: doc.text });
    doc.text = scan.sanitizedText;
    const chunks = chunkDocument(doc.id, doc.text).map((c) => ({ ...c, filename: doc.name, sourceType: doc.fileType, securityClassification: "INTERNAL", extractedEntities: [] }));
    const analysis = analyzeDocument(doc, chunks);
    doc.intelligence = analysis.intelligence;
    await mutateDb((db) => {
      db.documents.push(doc);
      db.document_chunks.push(...chunks);
      db.document_facts.push(...analysis.facts);
      db.document_entities.push(...analysis.entities);
      db.security_scans.push(scan);
      db.prompt_injection_findings.push(...scan.findings);
      db.authenticity_checks.push(assessAuthenticity(doc));
      db.usage_analytics.push({ id: id("metric"), type: "swarm_file_indexed", department: doc.department, createdAt: now() });
    });
    results.push({ name: doc.name, documentId: doc.id, status: "Indexed", stages, findings: scan.findings.length });
  }
  await logAudit(user.id, "swarm.ingest", { files: results.length });
  json(res, 201, { results });
}

async function analyzeExisting(req, res, user, documentId) {
  const db = await readDb();
  const doc = db.documents.find((d) => d.id === documentId);
  if (!doc) return json(res, 404, { error: "Document not found" });
  const chunks = db.document_chunks.filter((c) => c.documentId === documentId);
  const analysis = analyzeDocument(doc, chunks);
  await logAudit(user.id, "document.analyze", { documentId });
  json(res, 200, { document: doc, ...analysis });
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
  const evidence = retrieve(chunks, body.question || "");
  const answer = await provider.chat({ question: body.question, evidence });
  const confidence = confidenceForClaim(body.question || "", evidence);
  await logAudit(user.id, "document.chat", { documentId });
  json(res, 200, { ...answer, confidence });
}

async function glassBox(req, res, documentId) {
  const db = await readDb();
  const outputs = db.generated_outputs.filter((o) => o.documentIds.includes(documentId));
  const verification = db.verification_results.filter((v) => outputs.some((o) => o.id === v.outputId));
  json(res, 200, { outputs: outputs.map((o) => ({ id: o.id, title: o.title, claims: o.citationMap || [] })), verification });
}

async function immune(req, res, documentId) {
  const db = await readDb();
  json(res, 200, { scans: db.security_scans.filter((s) => s.documentId === documentId), findings: db.prompt_injection_findings.filter((f) => f.documentId === documentId) });
}

async function redact(req, res, user, documentId) {
  const body = await bodyJson(req);
  const db = await readDb();
  const doc = db.documents.find((d) => d.id === documentId);
  if (!doc) return json(res, 404, { error: "Document not found" });
  const result = redactText(doc.text, body.clearance || "PUBLIC");
  await mutateDb((wdb) => wdb.redaction_events.push(...result.events.map((e) => ({ ...e, documentId, userId: user.id }))));
  await logAudit(user.id, "document.redact", { documentId, clearance: result.clearance });
  json(res, 200, result);
}

async function echoes(req, res, documentId) {
  const db = await readDb();
  const doc = db.documents.find((d) => d.id === documentId);
  if (!doc) return json(res, 404, { error: "Document not found" });
  const result = historicalEchoes(doc, db.documents);
  json(res, 200, { echoes: result });
}

async function neutralize(req, res, documentId) {
  const db = await readDb();
  const doc = db.documents.find((d) => d.id === documentId);
  if (!doc) return json(res, 404, { error: "Document not found" });
  json(res, 200, biasNeutralize(doc.text));
}

async function oracle(req, res, documentId) {
  const body = await bodyJson(req).catch(() => ({}));
  const db = await readDb();
  const doc = db.documents.find((d) => d.id === documentId);
  if (!doc) return json(res, 404, { error: "Document not found" });
  json(res, 200, oracleScenario(doc, body.assumptions));
}

async function authenticity(req, res, documentId) {
  const db = await readDb();
  const doc = db.documents.find((d) => d.id === documentId);
  if (!doc) return json(res, 404, { error: "Document not found" });
  const existing = db.authenticity_checks.find((a) => a.documentId === documentId) || assessAuthenticity(doc);
  json(res, 200, existing);
}

async function synthetic(req, res, documentId) {
  const db = await readDb();
  const doc = db.documents.find((d) => d.id === documentId);
  if (!doc) return json(res, 404, { error: "Document not found" });
  json(res, 200, syntheticTestData(doc.text));
}

async function compare(req, res) {
  const body = await bodyJson(req);
  const db = await readDb();
  const [a, b] = body.documentIds || [];
  const factsA = db.document_facts.filter((f) => f.documentId === a).map((f) => f.claim);
  const factsB = db.document_facts.filter((f) => f.documentId === b).map((f) => f.claim);
  const onlyA = factsA.filter((x) => !factsB.some((y) => overlap(x, y) > 0.55));
  const onlyB = factsB.filter((x) => !factsA.some((y) => overlap(x, y) > 0.55));
  const docs = db.documents.filter((d) => [a, b].includes(d.id));
  const conflicts = detectConflicts(docs, db.document_facts.filter((f) => [a, b].includes(f.documentId)));
  json(res, 200, { addedClauses: onlyB, removedClauses: onlyA, changedNumbers: diffRegex(factsA.join(" "), factsB.join(" "), /(?:INR|₹)?\s?\d[\d,]*(?:\s?(?:crore|lakh|%|days))?/gi), changedDates: diffRegex(factsA.join(" "), factsB.join(" "), /\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}/g), conflicts });
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
  const content = format === "json" ? JSON.stringify(out, null, 2) : `# ${out.title}\n\n${out.content}\n\nFactuality: ${out.factualityScore}%\nCitation coverage: ${out.citationCoverage}%\nApproval status: ${out.reviewStatus || "PENDING_REVIEW"}\n`;
  const artifact = artifactRecord({ userId: out.createdBy || "system", output: out, format, content });
  await writeFile(file, content);
  await mutateDb((db) => {
    db.artifacts.push(artifact);
    db.provenance_records.push(artifact);
  });
  json(res, 200, { file, content, artifact });
}

async function reviewOutput(req, res, user, outputId) {
  const body = await bodyJson(req);
  const action = ["APPROVE", "REJECT", "REQUEST_REVIEW", "EDIT"].includes(body.action) ? body.action : "REQUEST_REVIEW";
  const review = await mutateDb((db) => {
    const out = db.generated_outputs.find((o) => o.id === outputId);
    if (!out) return null;
    out.reviewStatus = action === "APPROVE" ? "APPROVED" : action;
    const item = { id: id("review"), outputId, reviewerId: user.id, action, note: body.note || "", createdAt: now() };
    db.reviews.push(item);
    if (action === "APPROVE") db.approvals.push({ id: id("approval"), outputId, reviewerId: user.id, createdAt: now() });
    return item;
  });
  if (!review) return json(res, 404, { error: "Output not found" });
  await logAudit(user.id, "review.action", { outputId, action });
  json(res, 200, { review });
}

async function provenanceVerify(req, res) {
  const body = await bodyJson(req);
  const db = await readDb();
  json(res, 200, verifyArtifact(body.content || "", db.provenance_records));
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
    aiRequests: db.audit_logs.filter((a) => /transformation|chat/.test(a.action)).length,
    conflictsDetected: db.source_conflicts.length,
    securityThreatsBlocked: db.prompt_injection_findings.length,
    historicalEchoesIdentified: db.historical_echoes.length,
    redactions: db.redaction_events.length,
    approvals: db.approvals.length,
    byType: group(outputs, "outputType"),
    byLanguage: group(outputs, "language"),
    byDepartment: group(db.documents, "department"),
    monthlyUsage: group(outputs.map((o) => ({ month: o.createdAt.slice(0, 7) })), "month")
  });
}

async function audit(res) {
  const db = await readDb();
  json(res, 200, { audit: db.audit_logs.slice().reverse().slice(0, 200) });
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
    res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    res.end(bytes);
  } catch {
    const html = await readFile(path.join(webDir, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  }
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
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
