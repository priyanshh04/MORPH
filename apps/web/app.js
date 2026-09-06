const state = {
  token: localStorage.getItem("morph_token") || localStorage.getItem("transformai_token"),
  user: null,
  view: "dashboard",
  docs: [],
  outputs: [],
  analytics: {},
  activeDoc: null,
  chat: [],
  busy: ""
};

const outputTypes = ["Citizen Simplifier", "Officer Brief", "Executive Summary", "FAQ Generator", "WhatsApp Generator", "Social Media Generator", "Email", "Presentation Generator", "Voice Script", "Press Release", "SMS / Alert", "Infographic Content", "Report", "Action Checklist", "Key Facts"];
const nav = ["Dashboard", "Swarm Ingestion", "Documents", "MORPH Studio", "Ask MORPH", "Glass Box", "Conflicts & Confidence", "Historical Echoes", "Authenticity", "Clearance & Redaction", "Oracle Mode", "Bias Neutralizer", "Security / Immune System", "Review & Approval", "Exports", "Audit & Provenance", "Settings", "Admin / Analytics"];
const $ = (sel) => document.querySelector(sel);
const app = $("#app");

init();

async function init() {
  if (!state.token) return renderLanding();
  try {
    state.user = (await api("/api/me")).user;
    await loadData();
    renderShell();
  } catch {
    logout(false);
  }
}

async function loadData() {
  const [docs, outputs, analytics] = await Promise.all([api("/api/documents"), api("/api/transformations"), api("/api/analytics")]);
  state.docs = docs.documents;
  state.outputs = outputs.outputs;
  state.analytics = analytics;
  state.activeDoc ||= state.docs[0];
}

function renderLanding() {
  app.innerHTML = `<div class="landing morph-dark"><header class="topbar"><div class="brand"><span class="seal">M</span><span><b>MORPH</b><small>Multiformat Output & Representation Processing Hub</small></span></div><div><button class="ghost" data-action="login">Login</button><button class="primary" data-action="demo-login">Explore Demo</button></div></header><main class="hero"><section><h1><b>MORPH</b></h1><h2>Multiformat Output & Representation Processing Hub</h2><p>MORPH securely ingests information, retrieves evidence, transforms it into multiple representations, verifies generated claims, traces every important statement, supports human review, and exports approved content.</p><div class="hero-actions"><button class="primary" data-action="demo-login">Start Demo</button><button class="ghost" data-action="login">Officer Login</button></div></section><section class="workflow-board"><div class="pipeline">${["Authenticate", "Secure", "Ingest", "Understand", "Retrieve", "Transform", "Verify", "Trace", "Human Review", "Publish"].map((x) => `<span>${x}</span>`).join("")}</div><div class="feature-grid">${["Glass Box traceability", "Immune System scanning", "Confidence and conflicts", "Clearance redaction", "Historical Echoes", "Scenario analysis"].map((x) => `<div class="feature">${x}</div>`).join("")}</div></section></main></div>`;
  bindActions({ "login": renderAuth, "demo-login": demoLogin });
}

function renderAuth() {
  app.innerHTML = `<main class="auth morph-dark"><section class="panel auth-card"><div class="brand"><span class="seal">M</span><span><b>MORPH</b><small>Multiformat Output & Representation Processing Hub</small></span></div><h2>Secure workspace login</h2><p class="metric">Demo: officer@transformai.gov / Officer@123</p><form id="loginForm"><label>Email<input name="email" value="officer@transformai.gov" autocomplete="username"></label><label>Password<input name="password" type="password" value="Officer@123" autocomplete="current-password"></label><button class="primary" type="submit">Login</button><button class="ghost" type="button" data-action="back">Back</button></form></section></main>`;
  $("#loginForm").onsubmit = async (event) => { event.preventDefault(); await login(Object.fromEntries(new FormData(event.target))); };
  bindActions({ back: renderLanding });
}

async function login(body) {
  const result = await api("/api/auth/login", { method: "POST", body });
  state.token = result.token;
  localStorage.setItem("morph_token", result.token);
  localStorage.removeItem("transformai_token");
  await init();
}

async function demoLogin() {
  await login({ email: "officer@transformai.gov", password: "Officer@123" });
}

function renderShell() {
  app.innerHTML = `<div class="app-shell morph-dark"><aside class="sidebar"><div class="brand"><span class="seal">M</span><span><b>MORPH</b><small>Multiformat Output & Representation Processing Hub</small></span></div><nav class="nav">${nav.map((n) => `<button class="${key(n) === state.view ? "active" : ""}" data-view="${key(n)}">${n}</button>`).join("")}</nav><div class="user-box"><strong>${state.user.name}</strong><span>${state.user.role}</span><span>${state.user.email}</span><button class="logout" data-action="logout">Logout</button></div></aside><main class="main">${renderView()}</main></div>`;
  document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => { state.view = button.dataset.view; renderShell(); });
  bindActions({ logout: () => logout(true) });
  bindCurrentView();
}

function renderView() {
  const routes = {
    "swarm-ingestion": renderSwarm, documents: renderDocuments, "morph-studio": renderStudio, "ask-morph": renderAsk, "glass-box": renderGlassBox,
    "conflicts-&-confidence": renderCompare, "clearance-&-redaction": renderRedaction, "review-&-approval": renderReview, exports: renderExports,
    "audit-&-provenance": renderAudit, settings: renderSettings, "admin-/-analytics": renderAnalytics
  };
  if (state.view === "historical-echoes") return renderSimpleTool("Historical Echoes", "Find potential relationships to prior documents.", "Run Echo", "echo");
  if (state.view === "authenticity") return renderSimpleTool("Authenticity Assessment", "Assess authenticity signals without claiming guaranteed genuineness.", "Assess", "authenticity");
  if (state.view === "oracle-mode") return renderSimpleTool("Oracle Mode", "Evidence-based scenario analysis, not prediction.", "Generate Scenarios", "oracle");
  if (state.view === "bias-neutralizer") return renderSimpleTool("Bias Neutralizer", "Separate facts, attribution, loaded language, and speculation.", "Neutralize", "neutralize");
  if (state.view === "security-/-immune-system") return renderSimpleTool("MORPH Immune System", "Prompt-injection and suspicious-content findings.", "Inspect Scan", "immune");
  return (routes[state.view] || renderDashboard)();
}

function renderDashboard() {
  const a = state.analytics;
  return header("Dashboard", "Operational view of verified transformations and source-grounded workflows", `<button class="primary" data-action="go-studio">Open MORPH Studio</button>`) + `<section class="cards">${metric("Documents", a.documentsProcessed)}${metric("Outputs", a.outputsGenerated)}${metric("Avg factuality", `${a.averageFactualityScore || 0}%`)}${metric("Citation coverage", `${a.averageCitationCoverage || 0}%`)}${metric("Security findings", a.securityThreatsBlocked || 0)}</section><section class="workspace two"><div class="panel"><h3>Recent Documents</h3>${docTable(state.docs.slice(0, 6))}</div><div class="panel"><h3>Recent Outputs</h3>${state.outputs.slice(0, 3).map(outputCard).join("")}</div></section>`;
}

function renderSwarm() {
  return header("Swarm Ingestion Matrix", "Upload multiple supported files and track secure indexing stages") + `<section class="panel"><div class="drop">Supported: PDF, DOCX, TXT, Markdown, CSV, images, audio, ZIP containers</div><input id="swarmFiles" type="file" multiple accept=".txt,.md,.csv,.pdf,.docx,.png,.jpg,.jpeg,.webp,.wav,.mp3,.zip"><textarea id="swarmPaste" placeholder="Optional pasted content for a synthetic file in the swarm"></textarea><button class="primary" data-action="swarm-upload">Run Swarm Ingestion</button><div id="swarmResult" class="status-grid"></div></section>`;
}

function renderStudio() {
  const d = state.activeDoc;
  return header("MORPH Studio", "Transform selected sources with explicit controls and verified outputs") + `<section class="workspace"><div class="panel"><h3>Source</h3><select id="activeDoc">${state.docs.map((doc) => `<option value="${doc.id}" ${d?.id === doc.id ? "selected" : ""}>${doc.title}</option>`).join("")}</select><textarea id="sourceText">${d?.text || ""}</textarea><button class="primary" data-action="analyze">Analyze Document</button>${d ? renderIntelligence(d) : ""}</div><div class="panel"><h3>Controls</h3><div class="form-grid">${select("audience", ["Citizen", "Officer", "Executive", "Analyst", "General Public", "Media", "Student", "Internal Team", "Custom"])}${select("tone", ["Formal", "Simple", "Professional", "Neutral", "Friendly", "Urgent", "Educational", "Technical"])}${select("length", ["Brief", "Medium", "Detailed"])}${select("channel", ["Summary", "Brief", "FAQ", "WhatsApp", "Email", "Social", "Report", "Presentation", "Script", "Alert", "Custom"])}${select("language", ["English", "Hindi"], "English", "full")}</div><div class="check-list">${outputTypes.map((x, i) => `<label><input type="checkbox" name="outputType" value="${x}" ${i < 4 ? "checked" : ""}>${x}</label>`).join("")}</div><button class="primary" data-action="transform">Transform Selected</button></div><div class="panel"><h3>Verified Output</h3>${renderGenerated()}</div></section>`;
}

function renderAsk() {
  return header("Ask MORPH", "Answers are retrieved from selected authorized source evidence") + `<section class="workspace two"><div class="panel"><h3>Source</h3><select id="activeDoc">${state.docs.map((doc) => `<option value="${doc.id}" ${state.activeDoc?.id === doc.id ? "selected" : ""}>${doc.title}</option>`).join("")}</select><div class="doc-preview">${escapeHtml(state.activeDoc?.text || "")}</div></div><div class="panel"><h3>Conversation</h3><div class="chat-log">${state.chat.map((m) => `<div class="msg ${m.role}">${escapeHtml(m.text)}</div>`).join("")}</div><input id="question" placeholder="Ask: What are the key facts?"><button class="primary" data-action="ask">Ask MORPH</button></div></section>`;
}

function renderGlassBox() { return header("Glass Box", "Generated claims mapped to source evidence, verification, and confidence") + `<section class="panel"><button class="primary" data-action="glass">Load Evidence Map</button><div id="toolResult">${state.outputs.slice(0, 5).map(outputCard).join("")}</div></section>`; }
function renderCompare() { const opts = state.docs.map((d) => `<option value="${d.id}">${d.title}</option>`).join(""); return header("Conflicts & Confidence", "Surface disagreement instead of inventing a compromise") + `<section class="panel"><div class="form-grid"><label>Source A<select id="docA">${opts}</select></label><label>Source B<select id="docB">${opts}</select></label></div><button class="primary" data-action="compare">Compare Sources</button><div id="toolResult"></div></section>`; }
function renderRedaction() { return header("Clearance & Redaction", "Policy-based deterministic redaction before public release") + `<section class="panel"><label>Clearance<select id="clearance"><option>PUBLIC</option><option>LIMITED</option><option>INTERNAL</option><option>RESTRICTED</option><option>ADMIN</option></select></label><button class="primary" data-action="redact">Generate Safe Version</button><div id="toolResult"></div></section>`; }
function renderReview() { return header("Review & Approval", "AI output moves through verification, human review, approval, and publish") + `<section class="panel">${state.outputs.map((o) => `<article class="output-card"><strong>${o.title}</strong><span class="badge">${o.reviewStatus || "PENDING_REVIEW"}</span><div class="content">${escapeHtml((o.content || "").slice(0, 500))}</div><div class="actions"><button data-review="${o.id}" data-review-action="APPROVE">Approve</button><button data-review="${o.id}" data-review-action="REJECT">Reject</button><button data-review="${o.id}" data-review-action="REQUEST_REVIEW">Request Review</button></div></article>`).join("")}</section>`; }
function renderExports() { return header("Exports", "Export artifacts with provenance metadata") + `<section class="panel">${state.outputs.map((o) => `<article class="output-card"><strong>${o.title}</strong><div class="actions"><button data-export="${o.id}" data-format="md">Markdown</button><button data-export="${o.id}" data-format="json">JSON</button><button data-export="${o.id}" data-format="html">HTML</button></div></article>`).join("")}</section>`; }
function renderAudit() { return header("Audit & Provenance", "Inspect action logs and verify exported artifact fingerprints") + `<section class="workspace two"><div class="panel"><button class="primary" data-action="load-audit">Load Audit</button><div id="auditResult"></div></div><div class="panel"><textarea id="artifactText" placeholder="Paste exported artifact text to verify provenance"></textarea><button class="primary" data-action="verify-artifact">Verify Provenance</button><div id="toolResult"></div></div></section>`; }
function renderSimpleTool(title, desc, label, action) { return header(title, desc) + `<section class="panel"><p class="metric">Active source: ${escapeHtml(state.activeDoc?.title || "No document selected")}</p><button class="primary" data-action="${action}">${label}</button><div id="toolResult"></div></section>`; }
function renderDocuments() { return header("Documents", "Authorized source archive") + `<section class="panel">${docTable(state.docs)}</section>`; }
function renderAnalytics() { const a = state.analytics; return header("Admin / Analytics", "Real usage metrics from the local store") + `<section class="cards">${metric("AI requests", a.aiRequests || 0)}${metric("Conflicts", a.conflictsDetected || 0)}${metric("Redactions", a.redactions || 0)}${metric("Approvals", a.approvals || 0)}${metric("Echoes", a.historicalEchoesIdentified || 0)}</section><section class="workspace two"><div class="panel"><h3>Types</h3>${chart(a.byType || {})}</div><div class="panel"><h3>Departments</h3>${chart(a.byDepartment || {})}</div></section>`; }
function renderSettings() { return header("Settings", "Server-side AI, security, and deployment configuration") + `<section class="panel"><table class="table"><tr><th>Item</th><th>Status</th></tr><tr><td>Provider</td><td>OpenAI Responses API when configured; explicit demo provider otherwise</td></tr><tr><td>Secrets</td><td>Server-side environment variables only</td></tr><tr><td>Database</td><td>JSON prototype with relational table collections and PostgreSQL migration path</td></tr><tr><td>Security</td><td>Protected endpoints, rate limit, upload allow-list, Immune System, audit log</td></tr></table></section>`; }

function bindCurrentView() {
  bindActions({ "go-studio": () => { state.view = "morph-studio"; renderShell(); }, analyze, transform, ask, compare, redact, echo: () => docTool("echoes", "GET"), authenticity: () => docTool("authenticity", "GET"), oracle: () => docTool("oracle", "POST"), neutralize: () => docTool("neutralize", "POST"), immune: () => docTool("immune", "GET"), glass: loadGlass, "swarm-upload": swarmUpload, "load-audit": loadAudit, "verify-artifact": verifyArtifact });
  const docSelect = $("#activeDoc");
  if (docSelect) docSelect.onchange = () => { state.activeDoc = state.docs.find((d) => d.id === docSelect.value); renderShell(); };
  document.querySelectorAll("[data-export]").forEach((b) => b.onclick = () => exportOutput(b.dataset.export, b.dataset.format));
  document.querySelectorAll("[data-review]").forEach((b) => b.onclick = () => review(b.dataset.review, b.dataset.reviewAction));
  document.querySelectorAll("[data-evidence]").forEach((b) => b.onclick = () => toast(`Evidence: ${b.dataset.evidence}`));
}

async function analyze() { if (!state.activeDoc) return toast("Select a document first"); const result = await api(`/api/documents/${state.activeDoc.id}/analyze`, { method: "POST", body: {} }); state.activeDoc = { ...state.activeDoc, intelligence: result.intelligence }; toast("Analyze completed"); renderShell(); }
async function transform() { if (!state.activeDoc) return toast("Select a document first"); const body = { documentIds: [state.activeDoc.id], outputTypes: [...document.querySelectorAll("[name=outputType]:checked")].map((x) => x.value), audience: $("#audience").value, tone: $("#tone").value, length: $("#length").value, channel: $("#channel").value, language: $("#language").value }; if (!body.outputTypes.length) return toast("Select at least one format"); const result = await api("/api/transformations", { method: "POST", body }); await loadData(); toast(`${result.outputs.length} outputs generated, verified, and traced`); renderShell(); }
async function ask() { const q = $("#question").value.trim(); if (!q) return toast("Enter a question"); state.chat.push({ role: "user", text: q }); const result = await api(`/api/documents/${state.activeDoc.id}/chat`, { method: "POST", body: { question: q } }); state.chat.push({ role: "ai", text: `${result.answer}\nConfidence: ${result.confidence.level} (${result.confidence.score}%)` }); renderShell(); }
async function compare() { const result = await api("/api/documents/compare", { method: "POST", body: { documentIds: [$("#docA").value, $("#docB").value] } }); $("#toolResult").innerHTML = `<h3>Conflicts</h3>${result.conflicts.map((c) => `<div class="output-card danger"><strong>${c.status}</strong><p>${escapeHtml(c.reason)}</p><div class="chips">${c.values.map((v) => `<span class="chip warn">${v}</span>`).join("")}</div></div>`).join("") || "<p>No date/number conflicts detected.</p>"}<h3>Added</h3><div class="content">${escapeHtml(result.addedClauses.join("\n"))}</div><h3>Removed</h3><div class="content">${escapeHtml(result.removedClauses.join("\n"))}</div>`; }
async function redact() { const result = await api(`/api/documents/${state.activeDoc.id}/redact`, { method: "POST", body: { clearance: $("#clearance").value } }); $("#toolResult").innerHTML = `<p class="badge warn">${escapeHtml(result.summary)}</p><div class="doc-preview">${escapeHtml(result.redactedText)}</div>`; }
async function docTool(path, method) { const result = await api(`/api/documents/${state.activeDoc.id}/${path}`, { method, body: method === "POST" ? {} : undefined }); $("#toolResult").innerHTML = `<pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`; }
async function loadGlass() { const result = await api(`/api/documents/${state.activeDoc.id}/glass-box`); $("#toolResult").innerHTML = result.outputs.map((o) => `<article class="output-card"><strong>${o.title}</strong>${o.claims.map((c) => `<button class="claim" data-evidence="${escapeHtml(c.source)}">${c.marker} ${escapeHtml(c.source)}</button>`).join("")}</article>`).join("") || "<p>No generated claim map yet.</p>"; bindCurrentView(); }
async function swarmUpload() { const payload = []; for (const file of [...$("#swarmFiles").files]) payload.push({ name: file.name, type: file.type, content: await file.text().catch(() => "") }); const pasted = $("#swarmPaste").value.trim(); if (pasted) payload.push({ name: "pasted-swarm-source.txt", type: "text/plain", content: pasted }); const result = await api("/api/documents/swarm", { method: "POST", body: { files: payload, department: "Swarm Demo" } }); $("#swarmResult").innerHTML = result.results.map((r) => `<div class="status-card"><strong>${escapeHtml(r.name)}</strong><span>${r.status}</span><small>${(r.stages || []).join(" -> ")}</small><b>${r.findings || 0} findings</b></div>`).join(""); await loadData(); }
async function exportOutput(id, format) { const result = await api(`/api/exports/${id}`, { method: "POST", body: { format } }); toast(`Exported with artifact ID ${result.artifact.artifactId}`); }
async function review(id, action) { await api(`/api/reviews/${id}`, { method: "POST", body: { action } }); await loadData(); toast(`Review action: ${action}`); renderShell(); }
async function loadAudit() { const result = await api("/api/audit"); $("#auditResult").innerHTML = `<table class="table"><tr><th>Action</th><th>User</th><th>Time</th></tr>${result.audit.map((a) => `<tr><td>${a.action}</td><td>${a.userId}</td><td>${a.createdAt}</td></tr>`).join("")}</table>`; }
async function verifyArtifact() { const result = await api("/api/provenance/verify", { method: "POST", body: { content: $("#artifactText").value } }); $("#toolResult").innerHTML = `<pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`; }

function logout(render) { localStorage.removeItem("morph_token"); localStorage.removeItem("transformai_token"); state.token = null; if (render) renderLanding(); }
function bindActions(map) { document.querySelectorAll("[data-action]").forEach((b) => { if (map[b.dataset.action]) b.onclick = map[b.dataset.action]; }); }
function header(title, subtitle, action = "") { return `<div class="header"><div><h2>${title}</h2><p>${subtitle}</p></div>${action}</div>${state.busy ? `<div class="loading">${state.busy}...</div>` : ""}`; }
function outputCard(o) { return `<article class="output-card"><strong>${o.title || o.outputType}</strong><div class="output-meta"><span class="badge">${o.language}</span><span class="badge">${o.audience}</span><span class="badge ${o.factualityScore >= 90 ? "ok" : "warn"}">Factuality ${o.factualityScore}%</span><span class="badge ok">Citations ${o.citationCoverage}%</span><span class="badge">${o.reviewStatus || "PENDING_REVIEW"}</span>${o.demo ? `<span class="badge warn">Explicit demo provider</span>` : ""}</div><div class="content">${escapeHtml(o.content || "")}</div><div class="actions">${(o.citationMap || []).slice(0, 3).map((c) => `<button data-evidence="${escapeHtml(c.source)}">${c.marker} Evidence</button>`).join("")}</div></article>`; }
function renderGenerated() { const list = state.outputs.filter((o) => !state.activeDoc || o.documentIds.includes(state.activeDoc.id)).slice(0, 4); return list.length ? list.map(outputCard).join("") : `<p class="metric">Generate outputs to see verified content and evidence links.</p>`; }
function renderIntelligence(d) { const i = d.intelligence || {}; return `<h3>Source Intelligence</h3><div class="chips">${(i.topics || []).map((x) => `<span class="chip">${x}</span>`).join("")}</div><table class="table"><tr><td>Words</td><td>${i.wordCount || 0}</td></tr><tr><td>Claims</td><td>${i.claimCount || 0}</td></tr><tr><td>Entities</td><td>${i.entityCount || 0}</td></tr><tr><td>Citations</td><td>${i.citationCount || 0}</td></tr></table>`; }
function docTable(docs) { return `<table class="table"><tr><th>Document</th><th>Department</th><th>Status</th><th>Action</th></tr>${docs.map((d) => `<tr><td>${escapeHtml(d.title)}</td><td>${escapeHtml(d.department || "")}</td><td><span class="badge ok">${escapeHtml(d.status || "")}</span></td><td><button data-pick="${d.id}">Open</button></td></tr>`).join("")}</table>`; }
document.addEventListener("click", (event) => { const id = event.target?.dataset?.pick; if (id) { state.activeDoc = state.docs.find((d) => d.id === id); state.view = "morph-studio"; renderShell(); } });
function metric(label, value) { return `<div class="card"><div class="metric">${label}</div><div class="value">${value ?? 0}</div></div>`; }
function chart(obj) { const max = Math.max(1, ...Object.values(obj)); return `<div class="chart">${Object.entries(obj).map(([k, v]) => `<div class="bar"><span>${k}</span><i style="width:${(v / max) * 100}%"></i><b>${v}</b></div>`).join("")}</div>`; }
function select(id, values, selected = values[0], klass = "") { return `<label class="${klass}">${title(id)}<select id="${id}">${values.map((x) => `<option ${x === selected ? "selected" : ""}>${x}</option>`).join("")}</select></label>`; }
async function api(path, options = {}) { const res = await fetch(path, { method: options.method || "GET", headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined }); const data = await res.json(); if (!res.ok) { toast(data.error || "Request failed"); throw new Error(data.error || "Request failed"); } return data; }
function key(s) { return s.toLowerCase().replace(/\s+/g, "-"); }
function title(s) { return s.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase()); }
function escapeHtml(s = "") { return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
function toast(text) { const t = document.createElement("div"); t.className = "toast"; t.textContent = text; $("#toast").append(t); setTimeout(() => t.remove(), 4200); }
