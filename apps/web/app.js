const state = {
  token: localStorage.getItem("morph_token"),
  user: null,
  view: "dashboard",
  docs: [],
  outputs: [],
  analytics: null,
  activeDoc: null,
  chat: []
};

const OUTPUTS = [
  "Citizen Simplifier", "Officer Brief", "Executive Summary", "FAQ Generator",
  "WhatsApp Generator", "Social Media Generator", "Presentation Generator", "Voice Script",
  "Press Release", "SMS / Alert", "Infographic Content", "Detailed Report",
  "Key Facts / Statistics", "Action Checklist"
];
const LANGUAGES = ["English", "Hindi", "Hinglish", "Tamil", "Telugu", "Bengali", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Odia"];
const NAV = [
  ["dashboard", "Command Center"], ["transform", "Transform"], ["documents", "Source Library"],
  ["history", "Output Vault"], ["features", "Capabilities"], ["analytics", "Analytics"], ["settings", "System"]
];
const CAPABILITIES = [
  ["01", "Document ingestion", "PDF, DOCX, TXT, Markdown and pasted text with server-side parsing."],
  ["02", "Document intelligence", "Claims, entities, dates, numbers, topics, page estimates and risk signals."],
  ["03", "Multi-format generation", "Create fourteen audience and channel-specific communication artifacts from one source."],
  ["04", "Source traceability", "Every generated claim can be traced to source evidence, page and section."],
  ["05", "Factuality verification", "Score generated content against extracted source claims and expose unsupported content."],
  ["06", "Document chat", "Ask questions against retrieved source chunks instead of an ungrounded conversation."],
  ["07", "Document comparison", "Compare two sources for added, removed and changed dates or numbers."],
  ["08", "Versioned outputs", "Edit an artifact and persist a new version without losing the original output record."],
  ["09", "Export", "Download approved artifacts as Markdown or JSON directly from the workspace."],
  ["10", "Operational analytics", "Track source volume, artifacts, languages, factuality and citation coverage."],
  ["11", "Secure access", "Protected APIs, signed sessions, hashed passwords, rate limiting and audit logging."],
  ["12", "Provider abstraction", "Run the deterministic demo provider or connect a configured OpenAI provider for real generation."]
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const app = $("#app");

boot();

async function boot() {
  if (!state.token) return landing();
  try {
    state.user = (await api("/api/me")).user;
    await refresh();
    render();
  } catch {
    logout();
  }
}

async function refresh() {
  const [docs, outputs, analytics] = await Promise.all([
    api("/api/documents"), api("/api/transformations"), api("/api/analytics")
  ]);
  state.docs = docs.documents || [];
  state.outputs = outputs.outputs || [];
  state.analytics = analytics || {};
  if (!state.activeDoc || !state.docs.some((doc) => doc.id === state.activeDoc.id)) {
    state.activeDoc = state.docs[0] || null;
  }
}

function landing() {
  app.innerHTML = `
    <div class="landing">
      <header class="topbar">
        <div class="brand"><span class="seal">M</span><div><b>MORPH</b><small>INTELLIGENCE TRANSFORMATION OS</small></div></div>
        <button class="primary" id="login">Officer Login</button>
      </header>
      <main class="landing-main">
        <section class="hero-copy">
          <div class="eyebrow">SOURCE-GROUNDED COMMUNICATION PLATFORM</div>
          <h1>MORPH</h1>
          <h2>One source.<br>Every mission-ready message.</h2>
          <p>Turn trusted source material into verified, audience-specific communication while preserving facts, citations and source context.</p>
          <div class="hero-actions"><button class="primary" id="demo">Enter Command Center</button><button class="ghost" id="register">Create Account</button></div>
          <div class="trust-row"><span>● Source grounded</span><span>● Verifiable</span><span>● Audit ready</span></div>
        </section>
        <section class="landing-console">
          <div class="console-head"><span>MORPH / CORE PIPELINE</span><span class="status-text">SYSTEM READY</span></div>
          <div class="console-title">Ingest → understand → transform → verify</div>
          <div class="console-sub">A focused deployable core. No unsupported feature theatre.</div>
          <div class="pipeline-preview">${["01 / INGEST", "02 / UNDERSTAND", "03 / MORPH", "04 / VERIFY", "05 / PUBLISH"].map((x, i) => `<div><b>${x}</b><span>${["PDF · DOCX · TXT · MD", "Claims · entities · dates", "Audience · tone · channel", "Facts · citations · score", "Copy · version · export"][i]}</span></div>`).join("")}</div>
          <div class="cap-strip">${CAPABILITIES.slice(0, 6).map((c) => `<span>${c[1]}</span>`).join("")}</div>
        </section>
      </main>
    </div>`;
  $("#login").onclick = () => formPage(false);
  $("#register").onclick = () => formPage(true);
  $("#demo").onclick = demo;
}

function formPage(register) {
  app.innerHTML = `
    <main class="auth-page"><section class="panel auth-card">
      <div class="brand"><span class="seal">M</span><b>MORPH</b></div>
      <div class="eyebrow">SECURE OPERATOR ACCESS</div>
      <h1>${register ? "Create operator account" : "Officer Login"}</h1>
      <p class="muted">${register ? "Create a workspace account to use the transformation core." : "Authenticate to enter the MORPH command center."}</p>
      <form id="authForm">
        ${register ? '<label>Name<input name="name" required maxlength="100" autocomplete="name"></label>' : ""}
        <label>Email<input name="email" type="email" required autocomplete="username"></label>
        <label>Password<input name="password" type="password" required minlength="8" autocomplete="current-password"></label>
        <button class="primary full" type="submit">${register ? "Create Account" : "Authenticate"}</button>
        <button class="ghost full" type="button" id="back">Back</button>
      </form>
    </section></main>`;
  $("#back").onclick = landing;
  $("#authForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const result = await api(register ? "/api/auth/register" : "/api/auth/login", {
        method: "POST", body: Object.fromEntries(new FormData(event.target))
      });
      state.token = result.token;
      localStorage.setItem("morph_token", result.token);
      await boot();
    } catch (error) { toast(error.message); }
  };
}

async function demo() {
  try {
    const result = await api("/api/auth/login", { method: "POST", body: { email: "officer@transformai.gov", password: "Officer@123" } });
    state.token = result.token;
    localStorage.setItem("morph_token", result.token);
    await boot();
  } catch { toast("Demo access is unavailable. Use Create Account."); }
}

function render() {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand sidebar-brand"><span class="seal">M</span><div><b>MORPH</b><small>INTELLIGENCE OS</small></div></div>
        <div class="secure-badge"><span class="pulse"></span> SECURE WORKSPACE</div>
        <nav class="nav">${NAV.map(([key, label]) => `<button data-view="${key}" class="${state.view === key ? "active" : ""}"><span>${icon(key)}</span>${label}</button>`).join("")}</nav>
        <div class="sidebar-source"><span>ACTIVE SOURCE</span><b>${state.activeDoc ? esc(state.activeDoc.title) : "None loaded"}</b><small>${state.activeDoc ? `${state.activeDoc.fileType?.toUpperCase() || "DOC"} · ${state.activeDoc.pages || 1} page(s)` : "Start with Transform"}</small></div>
        <div class="user-box"><b>${esc(state.user?.name || "Operator")}</b><small>${esc(state.user?.role || "USER")} · ${esc(state.user?.email || "")}</small><button class="ghost" id="logout">Sign out</button></div>
      </aside>
      <main class="main">
        <header class="main-top">
          <div><span class="crumb">MORPH / ${title(state.view)}</span><h1>${pageTitle()}</h1><p>${pageSubtitle()}</p></div>
          <div class="top-actions"><span class="session-badge">● VERIFIED SESSION</span><button class="primary" id="quickTransform">New Transformation</button></div>
        </header>
        ${view()}
      </main>
    </div>`;
  $$('[data-view]').forEach((button) => button.onclick = () => { state.view = button.dataset.view; render(); });
  $("#logout").onclick = logout;
  $("#quickTransform").onclick = () => { state.view = "transform"; render(); };
  bindView();
}

function pageTitle() {
  return ({ dashboard: "Command Center", transform: "Transformation Workspace", documents: "Source Library", history: "Output Vault", features: "Capabilities", analytics: "Operational Analytics", settings: "System & Security" })[state.view] || "Command Center";
}
function pageSubtitle() {
  return ({ dashboard: "A live view of source intake, transformations and verification.", transform: "Build publication-ready outputs from a trusted source without losing provenance.", documents: "Inspect analyzed sources, intelligence and processing state.", history: "Review, edit, verify and export generated artifacts.", features: "Only capabilities that are implemented in the deployable core are shown here.", analytics: "Operational volume, languages, factuality and citation coverage.", settings: "Deployment posture, provider mode and session controls." })[state.view] || "";
}
function title(key) { return NAV.find(([k]) => k === key)?.[1]?.toUpperCase() || "COMMAND CENTER"; }
function view() {
  if (state.view === "transform") return workspace();
  if (state.view === "documents") return documents();
  if (state.view === "history") return outputsPage();
  if (state.view === "features") return featureMatrix();
  if (state.view === "analytics") return analytics();
  if (state.view === "settings") return settings();
  return dashboard();
}

function dashboard() {
  const a = state.analytics || {};
  return `<section class="metric-grid">
    ${metric("Sources processed", a.documentsProcessed ?? 0, "SOURCE")}
    ${metric("Transformations", a.transformationsGenerated ?? 0, "OPS")}
    ${metric("Artifacts", a.outputsGenerated ?? 0, "OUTPUT")}
    ${metric("Languages", a.languagesUsed ?? 0, "I18N")}
    ${metric("Avg factuality", `${a.averageFactualityScore ?? 0}%`, "VERIFY")}
  </section>
  <section class="dashboard-grid">
    <div class="panel"><div class="section-head"><div><span class="eyebrow">CORE PIPELINE</span><h2>Source → intelligence → action</h2></div><button class="ghost" id="dashboardTransform">Open workspace</button></div>
      <div class="flow">${[["01","INGEST","PDF · DOCX · TXT · MD"],["02","UNDERSTAND","CLAIMS · ENTITIES · DATES"],["03","MORPH","AUDIENCE · TONE · CHANNEL"],["04","VERIFY","FACTS · CITATIONS · SCORE"],["05","PUBLISH","COPY · VERSION · EXPORT"]].map((x) => `<div class="flow-step"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join("")}</div>
    </div>
    <div class="panel"><div class="section-head"><div><span class="eyebrow">WORKSPACE STATUS</span><h2>Operational</h2></div><span class="status-pill ok">READY</span></div>
      ${[["Source-grounded generation","Provider uses extracted source evidence"],["Traceability","Citation map stored with each artifact"],["Verification","Factuality checked before save"],["Audit","Protected actions logged"]].map((x) => `<div class="status-row"><span class="check">✓</span><div><b>${x[0]}</b><small>${x[1]}</small></div><span class="status-pill ok">ON</span></div>`).join("")}
    </div>
  </section>
  <section class="panel recent"><div class="section-head"><div><span class="eyebrow">SOURCE LIBRARY</span><h2>Recent sources</h2></div><button class="ghost" id="allDocs">View all</button></div>${docTable(state.docs.slice(0, 6))}</section>`;
}

function workspace() {
  const d = state.activeDoc;
  return `<section class="workspace-grid">
    <section class="panel source-panel">
      <div class="section-head"><div><span class="eyebrow">01 / INGEST</span><h2>Source material</h2></div>${d ? `<span class="status-pill ok">ANALYZED</span>` : `<span class="status-pill">WAITING</span>`}</div>
      <div class="drop" id="drop"><div class="drop-icon">＋</div><b>Drop a source file here</b><small>PDF · DOCX · TXT · Markdown</small></div>
      <input type="file" id="fileInput" accept=".pdf,.docx,.txt,.md,.markdown">
      <textarea id="sourceText" placeholder="Or paste source text here…">${esc(d?.text || "")}</textarea>
      <div class="actions"><button class="primary" id="upload">Analyze Source</button><button class="ghost" id="sample">Load Scenario</button></div>
      ${d ? sourceSummary(d) : `<div class="helper">Upload or paste a source. MORPH extracts evidence before any transformation can run.</div>`}
    </section>
    <section class="panel transform-panel">
      <div class="section-head"><div><span class="eyebrow">02 / MORPH</span><h2>Transformation controls</h2></div><span class="mode-chip">SOURCE GROUNDED</span></div>
      <div class="form-grid">
        ${select("audience", ["Citizen","Officer","Executive","Student","Media","General Public"], "Citizen")}
        ${select("tone", ["Formal","Simple","Professional","Friendly","Urgent","Educational"], "Professional")}
        ${select("length", ["Short","Medium","Detailed"], "Medium")}
        ${select("channel", ["Website","WhatsApp","Email","Social Media","SMS","Presentation","Report","Voice"], "Website")}
        ${select("language", LANGUAGES, "English", "full")}
      </div>
      <div class="control-title">OUTPUT ARTIFACTS</div>
      <div class="output-picker">${OUTPUTS.map((name, i) => `<label class="output-option"><input type="checkbox" name="outputType" value="${esc(name)}" ${i < 5 ? "checked" : ""}><span>${esc(name)}</span></label>`).join("")}</div>
      <div class="actions"><button class="primary full" id="generate" ${d ? "" : "disabled"}>Generate verified artifacts</button></div>
      ${d ? intelligence(d) : ""}
    </section>
    <section class="panel result-panel">
      <div class="result-tabs"><button class="active" id="outTab">Outputs</button><button id="chatTab">Document Chat</button><button id="compareTab">Compare</button></div>
      <div id="rightPane">${generated()}</div>
    </section>
  </section>`;
}

function sourceSummary(d) {
  const i = d.intelligence || {};
  return `<div class="source-summary"><span class="eyebrow">ACTIVE SOURCE</span><b>${esc(d.title)}</b><small>${esc(d.fileType?.toUpperCase() || "TEXT")} · ${i.wordCount || 0} words · ${d.pages || 1} page(s)</small><div class="mini-stats"><span><b>${i.claimCount || 0}</b> claims</span><span><b>${i.entityCount || 0}</b> entities</span><span><b>${i.citationCount || 0}</b> citations</span></div></div>`;
}

function intelligence(d) {
  const i = d.intelligence || {};
  return `<div class="intel"><div class="control-title">SOURCE INTELLIGENCE</div><div class="intel-grid"><div><span>WORDS</span><b>${i.wordCount || 0}</b></div><div><span>CLAIMS</span><b>${i.claimCount || 0}</b></div><div><span>ENTITIES</span><b>${i.entityCount || 0}</b></div><div><span>PAGES</span><b>${i.pages || d.pages || 1}</b></div></div><div class="chips">${(i.topics || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>${i.risks?.length ? `<div class="risk-box"><b>REVIEW SIGNALS</b>${i.risks.slice(0, 3).map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}</div>`;
}

function generated() {
  const outputs = state.outputs.filter((o) => !state.activeDoc || o.documentIds?.includes(state.activeDoc.id)).slice(0, 8);
  return outputs.length ? outputs.map(outputCard).join("") : emptyState("No artifacts generated", "Analyze a source, choose outputs and generate verified artifacts.");
}

function outputCard(o) {
  const trace = (o.citationMap || []).slice(0, 8);
  return `<article class="output-card"><div class="output-head"><div><span class="eyebrow">ARTIFACT / ${esc(o.outputType)}</span><h3>${esc(o.title || o.outputType)}</h3></div><span class="status-pill ${o.factualityScore >= 90 ? "ok" : "warn"}">${o.factualityScore || 0}% FACTUALITY</span></div>
    <div class="output-meta"><span>${esc(o.language || "English")}</span><span>${esc(o.audience || "")}</span><span>${esc(o.channel || "")}</span><span>CITATIONS ${o.citationCoverage || 0}%</span>${o.demo ? "<span>DEMO PROVIDER</span>" : ""}</div>
    <div class="content" contenteditable="true" spellcheck="true" data-edit="${esc(o.id)}">${esc(o.content || "")}</div>
    <details class="trace"><summary>Glass Box · source trace (${trace.length})</summary>${trace.length ? trace.map((c) => `<div class="trace-row"><b>${esc(c.marker)}</b><span>Page ${esc(c.page)} · ${esc(c.section)}</span><small>${esc(c.source)}</small></div>`).join("") : `<div class="helper">No citation map was returned for this artifact.</div>`}</details>
    <div class="actions"><button data-copy="${esc(o.id)}">Copy</button><button data-save="${esc(o.id)}">Save Version</button><button data-export="${esc(o.id)}" data-format="md">Export MD</button><button data-export="${esc(o.id)}" data-format="json">Export JSON</button><button data-verify="${esc(o.id)}">Re-verify</button></div>
  </article>`;
}

function documents() {
  return `<section class="panel"><div class="section-head"><div><span class="eyebrow">SOURCE LIBRARY</span><h2>Analyzed sources</h2></div><button class="primary" id="newSource">New source</button></div>${docTable(state.docs)}</section>`;
}
function docTable(docs) {
  if (!docs.length) return emptyState("No sources yet", "Open Transform and analyze your first document.");
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Source</th><th>Type</th><th>Intelligence</th><th>Created</th><th></th></tr></thead><tbody>${docs.map((d) => `<tr><td><b>${esc(d.title)}</b><small>${esc(d.name || "")}</small></td><td>${esc((d.fileType || "txt").toUpperCase())}</td><td>${d.intelligence?.claimCount || 0} claims · ${d.intelligence?.entityCount || 0} entities</td><td>${formatDate(d.createdAt)}</td><td><button class="link-btn" data-open-doc="${esc(d.id)}">Open</button></td></tr>`).join("")}</tbody></table></div>`;
}

function outputsPage() {
  return `<section class="panel"><div class="section-head"><div><span class="eyebrow">OUTPUT VAULT</span><h2>Generated artifacts</h2></div><span class="status-pill ok">${state.outputs.length} TOTAL</span></div>${state.outputs.length ? state.outputs.map(outputCard).join("") : emptyState("No artifacts yet", "Generated outputs will appear here.")}</section>`;
}

function featureMatrix() {
  return `<section class="capability-grid">${CAPABILITIES.map((c) => `<article class="capability-card"><span class="cap-number">${c[0]}</span><span class="status-pill ok">IMPLEMENTED</span><div class="cap-icon">◆</div><h2>${esc(c[1])}</h2><p>${esc(c[2])}</p></article>`).join("")}</section>`;
}

function analytics() {
  const a = state.analytics || {};
  const langs = a.byLanguage || {};
  const types = a.byOutputType || {};
  const bars = (obj) => { const entries = Object.entries(obj).sort((x, y) => y[1] - x[1]).slice(0, 8); const max = Math.max(1, ...entries.map((x) => x[1])); return entries.length ? entries.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><i><em style="width:${Math.round(v / max * 100)}%"></em></i><b>${v}</b></div>`).join("") : `<div class="helper">No usage data yet.</div>`; };
  return `<section class="analytics-grid"><div class="panel"><div class="section-head"><div><span class="eyebrow">LANGUAGES</span><h2>Usage</h2></div></div><div class="chart">${bars(langs)}</div></div><div class="panel"><div class="section-head"><div><span class="eyebrow">OUTPUT MIX</span><h2>Artifacts</h2></div></div><div class="chart">${bars(types)}</div></div><div class="panel"><div class="section-head"><div><span class="eyebrow">QUALITY</span><h2>Verification</h2></div></div><div class="quality-big">${a.averageFactualityScore ?? 0}<small>% average factuality</small></div><div class="quality-row"><span>Documents</span><b>${a.documentsProcessed ?? 0}</b></div><div class="quality-row"><span>Artifacts</span><b>${a.outputsGenerated ?? 0}</b></div><div class="quality-row"><span>Citation coverage</span><b>${a.averageCitationCoverage ?? 0}%</b></div></div></section>`;
}

function settings() {
  return `<section class="settings-grid"><div class="panel"><div class="section-head"><div><span class="eyebrow">DEPLOYMENT</span><h2>Runtime posture</h2></div><span class="status-pill ok">SERVER ONLINE</span></div>${setting("Provider", "Configured by LLM_PROVIDER", "No frontend secret")} ${setting("Database", "Local JSON by default; PostgreSQL-ready", "Server side")} ${setting("Authentication", "Signed bearer sessions + hashed passwords", "Protected")} ${setting("Uploads", "PDF · DOCX · TXT · Markdown", "Server parsed")}</div><div class="panel"><div class="section-head"><div><span class="eyebrow">SESSION</span><h2>Current operator</h2></div></div>${setting("Name", esc(state.user?.name || "Operator"), "")} ${setting("Role", esc(state.user?.role || "USER"), "")} ${setting("Email", esc(state.user?.email || ""), "")}<div class="actions"><button class="ghost" id="settingsLogout">Sign out</button></div></div><div class="panel"><div class="section-head"><div><span class="eyebrow">SCOPE</span><h2>What is intentionally not here</h2></div></div><p class="muted">Oracle forecasting, historical Echo analysis, cryptographic Traitor Tracer and true mixed-media Swarm ingestion are not presented as implemented features. They require deeper server-side systems and are excluded from this deployable core.</p></div></section>`;
}
function setting(label, value, meta) { return `<div class="setting-row"><span>${label}</span><b>${value}</b><i>${meta}</i></div>`; }

function bindView() {
  $("#dashboardTransform")?.addEventListener("click", () => { state.view = "transform"; render(); });
  $("#allDocs")?.addEventListener("click", () => { state.view = "documents"; render(); });
  $("#newSource")?.addEventListener("click", () => { state.view = "transform"; state.activeDoc = null; render(); });
  $("#settingsLogout")?.addEventListener("click", logout);
  $$('[data-open-doc]').forEach((button) => button.onclick = () => { state.activeDoc = state.docs.find((d) => d.id === button.dataset.openDoc) || null; state.view = "transform"; render(); });
  if (state.view === "transform") bindTransform();
  $$('[data-copy]').forEach((button) => button.onclick = () => copyOutput(button.dataset.copy));
  $$('[data-save]').forEach((button) => button.onclick = () => saveVersion(button.dataset.save));
  $$('[data-export]').forEach((button) => button.onclick = () => exportOutput(button.dataset.export, button.dataset.format));
  $$('[data-verify]').forEach((button) => button.onclick = () => reverify(button.dataset.verify));
}

function bindTransform() {
  const drop = $("#drop");
  const input = $("#fileInput");
  drop?.addEventListener("click", () => input?.click());
  ["dragenter", "dragover"].forEach((event) => drop?.addEventListener(event, (e) => { e.preventDefault(); drop.classList.add("active"); }));
  ["dragleave", "drop"].forEach((event) => drop?.addEventListener(event, (e) => { e.preventDefault(); drop.classList.remove("active"); }));
  drop?.addEventListener("drop", (event) => { const files = event.dataTransfer.files; if (files?.length) { input.files = files; drop.querySelector("b").textContent = `${files[0].name} selected`; } });
  input?.addEventListener("change", () => { if (input.files?.length) drop.querySelector("b").textContent = `${input.files[0].name} selected`; });
  $("#sample")?.addEventListener("click", () => { $("#sourceText").value = "Government Welfare Scheme Notification 2026\nThe Department of Social Welfare launched the Suraksha Benefit Scheme on 1 August 2026. Eligible households with annual income below INR 2,50,000 may apply through district service centres. Applications close on 20 September 2026. The scheme provides a one-time benefit of INR 10,000 after verification. District officers must publish beneficiary lists within 30 days."; input.value = ""; });
  $("#upload")?.addEventListener("click", upload);
  $("#generate")?.addEventListener("click", generate);
  $("#outTab")?.addEventListener("click", () => tab("outTab", generated()));
  $("#chatTab")?.addEventListener("click", () => tab("chatTab", chatPane()));
  $("#compareTab")?.addEventListener("click", () => tab("compareTab", comparePane()));
}

function tab(activeId, html) { ["outTab", "chatTab", "compareTab"].forEach((id) => $("#" + id)?.classList.toggle("active", id === activeId)); $("#rightPane").innerHTML = html; if (activeId === "chatTab") bindChat(); if (activeId === "compareTab") bindCompare(); }

async function upload() {
  const input = $("#fileInput");
  const file = input?.files?.[0];
  const text = $("#sourceText").value.trim();
  if (!file && !text) return toast("Choose a file or paste source text.");
  try {
    const body = { department: "General" };
    if (file) { body.name = file.name; body.type = file.type || "application/octet-stream"; body.encoding = "base64"; body.content = await fileToBase64(file); }
    else { body.name = "Pasted source.txt"; body.type = "text/plain"; body.content = text; body.encoding = "text"; }
    const result = await api("/api/documents/upload", { method: "POST", body });
    state.activeDoc = result.document;
    await refresh();
    state.activeDoc = state.docs.find((d) => d.id === result.document.id) || result.document;
    toast("Source analyzed successfully");
    render();
  } catch (error) { toast(error.message); }
}

async function generate() {
  if (!state.activeDoc) return toast("Analyze a source first.");
  const outputTypes = $$('[name="outputType"]:checked').map((x) => x.value);
  if (!outputTypes.length) return toast("Select at least one output.");
  const button = $("#generate");
  button.disabled = true; button.textContent = "Generating…";
  try {
    await api("/api/transformations", { method: "POST", body: {
      documentIds: [state.activeDoc.id], outputTypes,
      audience: $("#audience").value, tone: $("#tone").value, length: $("#length").value,
      channel: $("#channel").value, language: $("#language").value
    }});
    await refresh(); toast("Artifacts generated and verified"); render();
  } catch (error) { toast(error.message); button.disabled = false; button.textContent = "Generate verified artifacts"; }
}

function chatPane() {
  if (!state.activeDoc) return emptyState("No source selected", "Analyze a document before using Document Chat.");
  return `<div class="chat"><div class="chat-log">${state.chat.length ? state.chat.map((m) => `<div class="msg ${m.role}">${esc(m.text)}</div>`).join("") : `<div class="helper">Ask a question. Answers are grounded in retrieved chunks from the selected source.</div>`}</div><div class="chat-input"><input id="question" placeholder="Ask about this document…"><button class="primary" id="ask">Ask</button></div></div>`;
}
function bindChat() { $("#ask")?.addEventListener("click", ask); $("#question")?.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(); }); }
async function ask() {
  const q = $("#question")?.value.trim(); if (!q || !state.activeDoc) return;
  state.chat.push({ role: "user", text: q }); tab("chatTab", chatPane());
  try { const result = await api(`/api/documents/${state.activeDoc.id}/chat`, { method: "POST", body: { question: q } }); state.chat.push({ role: "ai", text: `${result.answer}${(result.citations || []).length ? `\n\n${result.citations.map((c) => `${c.marker} Page ${c.page} · ${c.section}`).join("\n")}` : ""}` }); tab("chatTab", chatPane()); }
  catch (error) { toast(error.message); }
}
function comparePane() {
  if (state.docs.length < 2) return emptyState("Two sources required", "Analyze at least two documents before comparing them.");
  return `<div class="compare"><div class="compare-selects">${select("docA", state.docs.map((d) => ({ value: d.id, label: d.title })), state.docs[0]?.id)}${select("docB", state.docs.map((d) => ({ value: d.id, label: d.title })), state.docs[1]?.id)}</div><div class="actions"><button class="primary" id="compare">Compare sources</button></div><div id="compareResult"></div></div>`;
}
function bindCompare() { $("#compare")?.addEventListener("click", async () => { const a = $("#docA")?.value, b = $("#docB")?.value; if (!a || !b || a === b) return toast("Choose two different sources."); try { const r = await api("/api/documents/compare", { method: "POST", body: { documentIds: [a, b] } }); $("#compareResult").innerHTML = `<div class="compare-result"><h3>Added clauses</h3><pre>${esc((r.addedClauses || []).join("\n") || "None")}</pre><h3>Removed clauses</h3><pre>${esc((r.removedClauses || []).join("\n") || "None")}</pre><h3>Changed dates</h3><pre>${esc(JSON.stringify(r.changedDates || [], null, 2))}</pre><h3>Changed numbers</h3><pre>${esc(JSON.stringify(r.changedNumbers || [], null, 2))}</pre></div>`; } catch (error) { toast(error.message); } }); }

async function copyOutput(id) { const output = state.outputs.find((o) => o.id === id); if (!output) return; try { await navigator.clipboard.writeText(output.content || ""); toast("Copied to clipboard"); } catch { toast("Clipboard access is unavailable"); } }
async function saveVersion(id) { const output = state.outputs.find((o) => o.id === id); const editor = document.querySelector(`[data-edit="${CSS.escape(id)}"]`); if (!output || !editor) return; try { await api(`/api/transformations/${id}/version`, { method: "POST", body: { content: editor.innerText } }); await refresh(); toast("Version saved"); render(); } catch (error) { toast(error.message); } }
async function reverify(id) { try { const result = await api(`/api/transformations/${id}/verify`, { method: "POST", body: {} }); toast(`Re-verified: ${result.factualityScore}% factuality`); await refresh(); render(); } catch (error) { toast(error.message); } }
function exportOutput(id, format) { const output = state.outputs.find((o) => o.id === id); if (!output) return; const payload = format === "json" ? JSON.stringify(output, null, 2) : `# ${output.title || output.outputType}\n\n${output.content || ""}\n\n---\nFactuality: ${output.factualityScore || 0}%\nCitation coverage: ${output.citationCoverage || 0}%`; const blob = new Blob([payload], { type: format === "json" ? "application/json" : "text/markdown" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${safeName(output.title || output.outputType)}.${format}`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); toast(`Exported ${format.toUpperCase()}`); }

function metric(label, value, tag) { return `<div class="metric-card"><span>${tag}</span><small>${label}</small><b>${value}</b></div>`; }
function select(id, options, value = options[0]?.value ?? options[0], extra = "") { return `<label class="${extra}">${id.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase())}<select id="${id}">${options.map((option) => { const val = typeof option === "string" ? option : option.value; const label = typeof option === "string" ? option : option.label; return `<option value="${esc(val)}" ${val === value ? "selected" : ""}>${esc(label)}</option>`; }).join("")}</select></label>`; }
function emptyState(titleText, detail) { return `<div class="empty"><div class="empty-mark">◇</div><b>${esc(titleText)}</b><small>${esc(detail)}</small></div>`; }
function formatDate(value) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }
function safeName(value) { const name = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); return name || "morph-artifact"; }
function esc(value = "") { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }
function icon(key) { return ({ dashboard: "⌂", transform: "↗", documents: "▤", history: "◫", features: "◇", analytics: "▥", settings: "⚙" })[key] || "•"; }
async function fileToBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = reject; reader.readAsDataURL(file); }); }
async function api(path, options = {}) { const headers = { "Content-Type": "application/json", ...(options.headers || {}) }; if (state.token) headers.Authorization = `Bearer ${state.token}`; const response = await fetch(path, { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`); return data; }
function logout() { state.token = null; state.user = null; localStorage.removeItem("morph_token"); landing(); }
function toast(message) { const node = $("#toast"); if (!node) return; node.textContent = message; node.classList.add("show"); clearTimeout(window.__morphToast); window.__morphToast = setTimeout(() => node.classList.remove("show"), 2800); }
