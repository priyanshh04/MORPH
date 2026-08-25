const state = {
  token: localStorage.getItem("transformai_token"),
  user: null,
  view: "overview",
  docs: [],
  outputs: [],
  analytics: null,
  activeDoc: null,
  chat: []
};

const outputTypes = ["Citizen Simplifier", "Officer Brief", "Executive Summary", "FAQ Generator", "WhatsApp Generator", "Social Media Generator", "Presentation Generator", "Voice Script", "Press Release", "SMS / Alert", "Infographic Content"];
const nav = ["Overview", "New Transformation", "Documents", "Transformation History", "Templates", "Saved Outputs", "Analytics", "Settings"];

const $ = (sel) => document.querySelector(sel);
const app = $("#app");

init();

async function init() {
  if (!state.token) return renderLanding();
  try {
    const me = await api("/api/me");
    state.user = me.user;
    await loadData();
    renderApp();
  } catch {
    localStorage.removeItem("transformai_token");
    state.token = null;
    renderLanding();
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
  app.innerHTML = `
    <div class="landing">
      <header class="topbar">
        <div class="brand"><span class="seal">T</span> TransformAI</div>
        <div><button class="ghost" data-login>Login</button> <button class="primary" data-demo>Explore Demo</button></div>
      </header>
      <main class="hero">
        <section>
          <h1>Transform One Source Into Every Message.</h1>
          <p>AI-powered content transformation that preserves facts, context, citations, and intent for government and enterprise communication workflows.</p>
          <div class="hero-actions">
            <button class="primary" data-demo>Start Transforming</button>
            <button class="ghost" data-login>Officer Login</button>
          </div>
        </section>
        <section class="workflow-board">
          <div class="workflow">
            ${["Upload", "Understand", "Transform", "Verify", "Publish"].map((x, i) => `<div class="step"><b>0${i + 1}</b><strong>${x}</strong><span>${workflowText(x)}</span></div>`).join("")}
          </div>
          <div class="feature-grid">
            ${["Multilingual AI", "Factuality Verification", "Citation Preservation", "Multi-Format Generation", "Document Intelligence", "Source-Grounded AI"].map((x) => `<div class="feature">${x}</div>`).join("")}
          </div>
        </section>
      </main>
    </div>`;
  document.querySelectorAll("[data-demo]").forEach((b) => b.onclick = demoLogin);
  document.querySelectorAll("[data-login]").forEach((b) => b.onclick = renderAuth);
}

function renderAuth() {
  app.innerHTML = `
    <main class="auth">
      <section class="panel auth-card">
        <div class="brand"><span class="seal">T</span> TransformAI</div>
        <h2>Secure officer login</h2>
        <p class="metric">Demo credentials: officer@transformai.gov / Officer@123</p>
        <form id="loginForm">
          <label>Email<input name="email" value="officer@transformai.gov" autocomplete="username"></label><br>
          <label>Password<input name="password" type="password" value="Officer@123" autocomplete="current-password"></label><br>
          <button class="primary full" type="submit">Login</button>
          <button class="ghost full" type="button" data-back>Back</button>
        </form>
      </section>
    </main>`;
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    const result = await api("/api/auth/login", { method: "POST", body });
    state.token = result.token;
    localStorage.setItem("transformai_token", result.token);
    toast("Login successful");
    await init();
  };
  $("[data-back]").onclick = renderLanding;
}

async function demoLogin() {
  const result = await api("/api/auth/login", { method: "POST", body: { email: "officer@transformai.gov", password: "Officer@123" } });
  state.token = result.token;
  localStorage.setItem("transformai_token", result.token);
  await init();
}

function renderApp() {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="seal">T</span> TransformAI</div>
        <nav class="nav">${nav.map((n) => `<button class="${viewKey(n) === state.view ? "active" : ""}" data-view="${viewKey(n)}">${n}</button>`).join("")}</nav>
        <div class="user-box">
          <strong>${state.user.name}</strong><br>${state.user.role}<br>${state.user.email}
          <br><br><button class="ghost" data-logout>Logout</button>
        </div>
      </aside>
      <main class="main">
        ${renderView()}
      </main>
    </div>`;
  document.querySelectorAll("[data-view]").forEach((b) => b.onclick = () => { state.view = b.dataset.view; renderApp(); });
  $("[data-logout]").onclick = () => { localStorage.removeItem("transformai_token"); location.reload(); };
  bindView();
}

function renderView() {
  if (state.view === "new-transformation") return renderWorkspace();
  if (state.view === "documents") return renderDocuments();
  if (state.view === "transformation-history" || state.view === "saved-outputs") return renderOutputs();
  if (state.view === "analytics") return renderAnalytics();
  if (state.view === "templates") return renderTemplates();
  if (state.view === "settings") return renderSettings();
  return renderOverview();
}

function renderOverview() {
  const a = state.analytics;
  return `
    <div class="header"><div><h2>Operational Dashboard</h2><p>Source-grounded content transformation overview.</p></div><button class="primary" data-go-transform>New Transformation</button></div>
    <section class="cards">
      ${metric("Documents processed", a.documentsProcessed)}
      ${metric("Transformations generated", a.transformationsGenerated)}
      ${metric("Languages used", a.languagesUsed)}
      ${metric("Outputs generated", a.outputsGenerated)}
      ${metric("Avg factuality", `${a.averageFactualityScore}%`)}
    </section>
    <br>
    <section class="panel">
      <h3>Recent documents</h3>
      ${docTable(state.docs.slice(0, 5))}
    </section>`;
}

function renderWorkspace() {
  const d = state.activeDoc;
  return `
    <div class="header"><div><h2>Transformation Workspace</h2><p>Upload once, generate many source-grounded deliverables.</p></div><button class="secondary" data-demo-fill>Load Sample Scenario</button></div>
    <section class="workspace">
      <div class="panel">
        <h3>Source Document</h3>
        <div class="drop" id="drop">Drop PDF, DOCX, TXT, MD or paste text below</div><br>
        <input type="file" id="fileInput" accept=".txt,.md,.pdf,.docx">
        <br><br><textarea id="sourceText" placeholder="Paste source content here...">${d?.text || ""}</textarea>
        <div class="actions"><button class="primary" data-upload>Analyze Document</button></div>
        ${d ? `<br><h3>Document Preview</h3><div class="doc-preview">${escapeHtml(d.text)}</div>` : ""}
      </div>
      <div class="panel">
        <h3>Transform</h3>
        <div class="form-grid">
          ${select("audience", ["Citizen", "Officer", "Executive", "Student", "Media", "General Public"])}
          ${select("tone", ["Formal", "Simple", "Professional", "Friendly", "Urgent", "Educational"])}
          ${select("length", ["Short", "Medium", "Detailed"])}
          ${select("channel", ["WhatsApp", "Email", "Website", "Social Media", "SMS", "Presentation", "Report", "Voice"])}
          ${select("language", ["English", "Hindi", "Hinglish", "Tamil", "Telugu", "Bengali", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Odia"], "English", "full")}
        </div>
        <h3>Output formats</h3>
        <div class="check-list">${outputTypes.map((x, i) => `<label><input type="checkbox" name="outputType" value="${x}" ${i < 5 ? "checked" : ""}> ${x}</label>`).join("")}</div>
        <div class="actions"><button class="primary" data-generate ${d ? "" : "disabled"}>Generate Selected Outputs</button></div>
        ${d ? renderIntelligence(d) : ""}
      </div>
      <div class="panel">
        <div class="tabs"><button class="active">Generated Output</button><button data-chat-tab>Chat</button><button data-compare-tab>Compare</button></div>
        <div id="rightPane">${renderGenerated()}</div>
      </div>
    </section>`;
}

function renderGenerated() {
  const visible = state.outputs.filter((o) => !state.activeDoc || o.documentIds.includes(state.activeDoc.id)).slice(0, 4);
  if (!visible.length) return `<p class="metric">Generated outputs will appear here with factuality, citation coverage, and export controls.</p>`;
  return visible.map(outputCard).join("");
}

function outputCard(o) {
  const unsupported = o.verification?.unsupported || 0;
  return `
    <article class="output-card">
      <strong>${o.outputType}</strong>
      <div class="output-meta">
        <span class="badge">${o.language}</span><span class="badge">${o.audience}</span>
        <span class="badge ${o.factualityScore >= 90 ? "ok" : "warn"}">Factuality ${o.factualityScore}%</span>
        <span class="badge ok">Citations ${o.citationCoverage}%</span>
        ${o.demo ? `<span class="badge warn">Demo provider</span>` : ""}
        ${unsupported ? `<span class="badge danger">${unsupported} unsupported</span>` : ""}
      </div>
      <div class="content" contenteditable="true" data-edit="${o.id}">${escapeHtml(o.content)}</div>
      <details><summary>Why did AI generate this?</summary>${(o.citationMap || []).slice(0, 5).map((c) => `<p class="metric">${c.marker} Page ${c.page}, ${c.section}: ${escapeHtml(c.source)}</p>`).join("")}</details>
      <div class="actions"><button data-copy="${o.id}">Copy</button><button data-save-version="${o.id}">Save Version</button><button data-export="${o.id}" data-format="md">Export MD</button><button data-export="${o.id}" data-format="json">Export JSON</button><button data-verify="${o.id}">Verify</button></div>
    </article>`;
}

function renderIntelligence(d) {
  const i = d.intelligence || {};
  return `<br><h3>Source Intelligence</h3>
    <div class="chips">${(i.topics || []).map((x) => `<span class="chip">${x}</span>`).join("")}</div><br>
    <table class="table">
      <tr><td>Words</td><td>${i.wordCount}</td></tr><tr><td>Pages</td><td>${i.pages}</td></tr>
      <tr><td>Language</td><td>${i.detectedLanguage}</td></tr><tr><td>Claims</td><td>${i.claimCount}</td></tr>
      <tr><td>Entities</td><td>${i.entityCount}</td></tr><tr><td>Citations</td><td>${i.citationCount}</td></tr>
    </table>
    <h3>Dates and numbers</h3><div class="chips">${[...(i.dates || []), ...(i.numbers || [])].map((x) => `<span class="chip">${x}</span>`).join("")}</div>`;
}

function renderDocuments() {
  return `<div class="header"><div><h2>Documents</h2><p>Analyzed source library with document-level intelligence.</p></div></div><section class="panel">${docTable(state.docs)}</section>`;
}

function renderOutputs() {
  return `<div class="header"><div><h2>Transformation History</h2><p>Versioned, verified outputs generated from source documents.</p></div></div><section class="panel">${state.outputs.map(outputCard).join("")}</section>`;
}

function renderAnalytics() {
  const a = state.analytics;
  return `<div class="header"><div><h2>Analytics</h2><p>Usage, factuality, languages, and department insights.</p></div></div>
    <section class="cards">${metric("Avg factuality", `${a.averageFactualityScore}%`)}${metric("Avg citation coverage", `${a.averageCitationCoverage}%`)}${metric("Outputs", a.outputsGenerated)}${metric("Documents", a.documentsProcessed)}${metric("Languages", a.languagesUsed)}</section><br>
    <div class="workspace" style="grid-template-columns:1fr 1fr 1fr">
      <section class="panel"><h3>Transformation types</h3>${chart(a.byType)}</section>
      <section class="panel"><h3>Languages</h3>${chart(a.byLanguage)}</section>
      <section class="panel"><h3>Departments</h3>${chart(a.byDepartment)}</section>
    </div>`;
}

function renderTemplates() {
  return `<div class="header"><div><h2>Templates</h2><p>Reusable AI content modes for public communication.</p></div></div><section class="cards">${outputTypes.map((x) => `<div class="card"><strong>${x}</strong><p class="metric">${workflowText(x)}</p></div>`).join("")}</section>`;
}

function renderSettings() {
  return `<div class="header"><div><h2>Settings</h2><p>Provider abstraction and security posture.</p></div></div><section class="panel"><table class="table">
    <tr><th>Capability</th><th>Status</th></tr>
    <tr><td>AI provider</td><td>Demo fallback active unless LLM_PROVIDER and API keys are configured</td></tr>
    <tr><td>Authentication</td><td>JWT-style signed token, hashed passwords, protected APIs</td></tr>
    <tr><td>Storage</td><td>Local JSON prototype with PostgreSQL-ready data model names</td></tr>
    <tr><td>Security</td><td>Rate limiting, file size limits, no frontend API keys, audit logs</td></tr>
  </table></section>`;
}

function bindView() {
  const go = $("[data-go-transform]");
  if (go) go.onclick = () => { state.view = "new-transformation"; renderApp(); };
  const demo = $("[data-demo-fill]");
  if (demo) demo.onclick = () => { state.activeDoc = state.docs[0]; renderApp(); };
  const upload = $("[data-upload]");
  if (upload) upload.onclick = uploadDoc;
  const gen = $("[data-generate]");
  if (gen) gen.onclick = generate;
  const chatTab = $("[data-chat-tab]");
  if (chatTab) chatTab.onclick = renderChatPane;
  const compareTab = $("[data-compare-tab]");
  if (compareTab) compareTab.onclick = renderComparePane;
  document.querySelectorAll("[data-export]").forEach((b) => b.onclick = () => exportOutput(b.dataset.export, b.dataset.format));
  document.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => copyOutput(b.dataset.copy));
  document.querySelectorAll("[data-verify]").forEach((b) => b.onclick = () => verify(b.dataset.verify));
  document.querySelectorAll("[data-save-version]").forEach((b) => b.onclick = () => saveVersion(b.dataset.saveVersion));
}

async function uploadDoc() {
  const file = $("#fileInput").files[0];
  let content = $("#sourceText").value;
  let name = "Pasted content.txt";
  let type = "text/plain";
  if (file) {
    name = file.name; type = file.type || "application/octet-stream";
    content = await file.text().catch(() => content);
  }
  if (!content && !file) return toast("Paste content or choose a document");
  const result = await api("/api/documents/upload", { method: "POST", body: { name, type, content, department: "Demo Department" } });
  state.activeDoc = result.document;
  await loadData();
  toast("Document successfully analyzed");
  renderApp();
}

async function generate() {
  const body = {
    documentIds: [state.activeDoc.id],
    outputTypes: [...document.querySelectorAll("[name=outputType]:checked")].map((x) => x.value),
    audience: $("#audience").value, tone: $("#tone").value, length: $("#length").value, channel: $("#channel").value, language: $("#language").value
  };
  if (!body.outputTypes.length) return toast("Select at least one output format");
  const btn = $("[data-generate]");
  btn.disabled = true; btn.textContent = "Generating...";
  const result = await api("/api/transformations", { method: "POST", body });
  state.outputs = [...result.outputs, ...state.outputs];
  await loadData();
  toast(`${result.outputs.length} outputs generated and verified`);
  renderApp();
}

async function renderChatPane() {
  $("#rightPane").innerHTML = `<h3>Chat with Document</h3><div class="chat-log" id="chatLog">${state.chat.map((m) => `<div class="msg ${m.role}">${escapeHtml(m.text)}</div>`).join("")}</div><br><input id="chatQuestion" placeholder="Ask: What is the eligibility criteria?"><div class="actions"><button class="primary" data-ask>Ask</button></div>`;
  $("[data-ask]").onclick = async () => {
    const q = $("#chatQuestion").value;
    state.chat.push({ role: "user", text: q });
    const result = await api(`/api/documents/${state.activeDoc.id}/chat`, { method: "POST", body: { question: q } });
    state.chat.push({ role: "ai", text: `${result.answer}\n${(result.citations || []).map((c) => `${c.marker} Page ${c.page}, ${c.section}`).join("\n")}` });
    renderChatPane();
  };
}

async function renderComparePane() {
  const options = state.docs.map((d) => `<option value="${d.id}">${d.title}</option>`).join("");
  $("#rightPane").innerHTML = `<h3>Compare Documents</h3>${select("docA", [], "", "", options)}${select("docB", [], "", "", options)}<div class="actions"><button class="primary" data-compare>Compare</button></div><div id="compareResult"></div>`;
  $("[data-compare]").onclick = async () => {
    const result = await api("/api/documents/compare", { method: "POST", body: { documentIds: [$("#docA").value, $("#docB").value] } });
    $("#compareResult").innerHTML = `<h3>Added clauses</h3><div class="content">${escapeHtml(result.addedClauses.join("\n"))}</div><h3>Removed clauses</h3><div class="content">${escapeHtml(result.removedClauses.join("\n"))}</div><h3>Changed dates</h3><pre>${escapeHtml(JSON.stringify(result.changedDates, null, 2))}</pre>`;
  };
}

async function exportOutput(id, format) {
  const result = await api(`/api/exports/${id}`, { method: "POST", body: { format } });
  toast(`Exported to ${result.file}`);
}

async function copyOutput(id) {
  const out = state.outputs.find((o) => o.id === id);
  await navigator.clipboard.writeText(out.content);
  toast("Copied output");
}

async function verify(id) {
  const result = await api(`/api/transformations/${id}/verify`, { method: "POST", body: {} });
  toast(`Factuality ${result.factualityScore}%, unsupported ${result.unsupported}`);
}

async function saveVersion(id) {
  const el = document.querySelector(`[data-edit="${id}"]`);
  await api(`/api/transformations/${id}/version`, { method: "POST", body: { content: el.innerText } });
  toast("Version saved");
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function metric(label, value) { return `<div class="card"><div class="metric">${label}</div><div class="value">${value}</div></div>`; }
function docTable(docs) { return `<table class="table"><tr><th>Document</th><th>Department</th><th>Claims</th><th>Status</th></tr>${docs.map((d) => `<tr><td><button class="ghost" onclick="window.pickDoc('${d.id}')">${d.title}</button></td><td>${d.department}</td><td>${d.intelligence?.claimCount || 0}</td><td><span class="badge ok">${d.status}</span></td></tr>`).join("")}</table>`; }
window.pickDoc = (id) => { state.activeDoc = state.docs.find((d) => d.id === id); state.view = "new-transformation"; renderApp(); };
function chart(obj) { const max = Math.max(1, ...Object.values(obj || {})); return `<div class="chart">${Object.entries(obj || {}).map(([k, v]) => `<div class="bar"><span>${k}</span><span style="width:${(v / max) * 100}%"></span><b>${v}</b></div>`).join("")}</div>`; }
function select(id, values, selected = values[0], klass = "", override = "") { return `<label class="${klass}">${title(id)}<select id="${id}">${override || values.map((x) => `<option ${x === selected ? "selected" : ""}>${x}</option>`).join("")}</select></label>`; }
function title(s) { return s.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase()); }
function viewKey(s) { return s.toLowerCase().replace(/\s+/g, "-"); }
function escapeHtml(s = "") { return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
function toast(text) { const t = document.createElement("div"); t.className = "toast"; t.textContent = text; $("#toast").append(t); setTimeout(() => t.remove(), 4200); }
function workflowText(x) {
  return {
    Upload: "Ingest PDF, DOCX, TXT, Markdown, or pasted text.",
    Understand: "Extract claims, entities, dates, numbers, and topics.",
    Transform: "Generate for many audiences, tones, languages, and channels.",
    Verify: "Check generated claims against source evidence.",
    Publish: "Copy, version, export, and share approved output."
  }[x] || "Reusable source-grounded transformation mode.";
}
