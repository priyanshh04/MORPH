import { id, now } from "../database/store.js";

const STOP = new Set("the and for with from this that have will are was were has into shall should would could about above below where which when what who whom your their there here been being through using under over such not its also than then them they you our out use can may per via is a an of to in on as by be do does did how why it we they these those this all total number many scheme schemes provided provide benefit benefits eligible eligibility launched launch date dates year years".split(" "));

export function normalizeText(text = "") {
  return String(text).replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseUploadedContent({ name = "Pasted source", type = "text/plain", content = "" }) {
  const clean = normalizeText(content);
  const ext = name.split(".").pop()?.toLowerCase();
  const supported = ["pdf", "docx", "txt", "md", "markdown"].includes(ext) || type.includes("text");
  const fallback = clean || demoBodyFor(name);
  return {
    title: inferTitle(fallback, name),
    text: fallback,
    fileType: ext || "txt",
    supported,
    pages: Math.max(1, Math.ceil(fallback.length / 2600)),
    metadata: { originalName: name, mimeType: type, parser: clean ? "text-extractor" : "demo-safe-fallback" }
  };
}

function inferTitle(text, name) {
  const first = text.split("\n").map((x) => x.trim()).find(Boolean);
  return first && first.length < 120 ? first.replace(/^#+\s*/, "") : name.replace(/\.[^.]+$/, "");
}

function demoBodyFor(name) {
  if (/alert|weather|disaster/i.test(name)) {
    return "District Disaster Management Authority Cyclone Preparedness Alert\nIssued on 20 September 2026 for coastal blocks. Citizens in low-lying areas must move to shelters by 6 PM. Emergency helpline 1077 will operate continuously. Fishing activity is suspended until 22 September 2026. Schools in affected blocks remain closed on 21 September 2026. [1] Section: Public Safety Advisory.";
  }
  if (/education|policy/i.test(name)) {
    return "Education Department Digital Learning Policy 2026\nThe policy provides tablets to students of classes 9 to 12 in government schools. Schools must complete beneficiary verification by 15 October 2026. District officers must submit implementation reports every month. Budget allocation is INR 10 crore for phase one. [1] Section: Implementation Guidelines.";
  }
  return "Government Welfare Scheme Notification 2026\nThe Department of Social Welfare launched the Suraksha Benefit Scheme on 1 August 2026. Eligible households with annual income below INR 2,50,000 may apply through district service centres. Applications close on 20 September 2026. The scheme provides a one-time benefit of INR 10,000 after verification. District officers must publish beneficiary lists within 30 days. [1] Section: Eligibility and Benefits.";
}

export function chunkDocument(documentId, text) {
  const paragraphs = normalizeText(text).split(/\n\s*\n|(?<=\.)\s+(?=[A-Z])/).filter(Boolean);
  const chunks = [];
  let page = 1;
  for (let i = 0; i < paragraphs.length; i++) {
    const body = paragraphs[i].trim();
    if (!body) continue;
    chunks.push({ id: id("chunk"), documentId, index: chunks.length, page, section: detectSection(body, i), text: body, createdAt: now() });
    if (body.length > 1200) page += 1;
  }
  return chunks.length ? chunks : [{ id: id("chunk"), documentId, index: 0, page: 1, section: "Source", text, createdAt: now() }];
}

function detectSection(text, i) {
  if (i === 0) return "Title / Overview";
  if (/eligib/i.test(text)) return "Eligibility";
  if (/benefit|advantage|assistance/i.test(text)) return "Benefits";
  if (/deadline|close|by \d/i.test(text)) return "Deadlines";
  if (/budget|INR|₹|crore|lakh/i.test(text)) return "Financial Details";
  if (/risk|alert|emergency|urgent|suspended/i.test(text)) return "Risk / Advisory";
  return "Source Section";
}

export function analyzeDocument(doc, chunks) {
  const text = doc.text;
  const sentences = text.match(/[^.!?\n]+[.!?]?/g)?.map((s) => s.trim()).filter((s) => s.length > 18) || [];
  const claims = sentences.slice(0, 30).map((claim, idx) => ({
    id: id("fact"),
    documentId: doc.id,
    claim,
    citationId: `C${idx + 1}`,
    page: locatePage(claim, chunks),
    section: locateSection(claim, chunks),
    confidence: claim.match(/\d|must|shall|eligible|deadline|budget|launched|benefit/i) ? 0.94 : 0.84,
    createdAt: now()
  }));
  const entities = extractEntities(text, doc.id);
  const dates = [...text.matchAll(/\b\d{1,2}\s+(?:[A-Z][a-z]+|[A-Z][a-z]+,)\s+20\d{2}\b|\b20\d{2}\b/g)].map((m) => m[0]);
  const numbers = [...text.matchAll(/(?:INR|₹)?\s?\d[\d,]*(?:\.\d+)?\s?(?:crore|lakh|%|days|PM|AM)?/gi)].map((m) => m[0].trim());
  const topics = topTerms(text).slice(0, 8);
  return {
    facts: claims,
    entities,
    intelligence: {
      wordCount: text.split(/\s+/).filter(Boolean).length,
      pages: doc.pages,
      detectedLanguage: /[\u0900-\u097F]/.test(text) ? "Hindi / Indic" : "English",
      claimCount: claims.length,
      entityCount: entities.length,
      citationCount: (text.match(/\[\d+\]/g) || []).length || Math.min(3, claims.length),
      topics,
      dates: [...new Set(dates)].slice(0, 10),
      numbers: [...new Set(numbers)].slice(0, 10),
      risks: sentences.filter((s) => /risk|urgent|alert|emergency|must|deadline|suspended/i.test(s)).slice(0, 5)
    }
  };
}

function locatePage(text, chunks) {
  return chunks.find((c) => c.text.includes(text))?.page || chunks[0]?.page || 1;
}

function locateSection(text, chunks) {
  return chunks.find((c) => c.text.includes(text))?.section || "Source";
}

function extractEntities(text, documentId) {
  const matches = [...text.matchAll(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,})){0,5}\b/g)]
    .map((m) => m[0])
    .filter((x) => x.length > 2 && !/^(The|This|If|For|Section|Issued)$/.test(x));
  return [...new Set(matches)].slice(0, 18).map((name) => ({
    id: id("entity"), documentId, name, type: classifyEntity(name), createdAt: now()
  }));
}

function classifyEntity(name) {
  if (/Department|Ministry|Authority|Organisation|NTRO|NCIIPC/i.test(name)) return "Organization";
  if (/India|District|Block|State|City|Coastal/i.test(name)) return "Location";
  if (/Scheme|Policy|Alert|Notification/i.test(name)) return "Program / Document";
  return "Entity";
}

function topTerms(text) {
  const counts = {};
  for (const raw of text.toLowerCase().match(/[a-z]{4,}/g) || []) {
    if (!STOP.has(raw)) counts[raw] = (counts[raw] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

const INTENT_TERMS = {
  launch: ["launched", "launch", "introduced", "started", "commenced", "from", "on"],
  eligibility: ["eligible", "eligibility", "qualify", "qualification", "who can", "applicable"],
  benefits: ["benefit", "benefits", "assistance", "support", "provided", "receive", "amount"],
  count: ["total", "number", "count", "how many", "schemes", "programmes", "programs"],
  deadline: ["deadline", "close", "closing", "last date", "by when", "expires"],
  amount: ["amount", "cost", "budget", "outlay", "fund", "money", "how much"],
  location: ["where", "district", "state", "location", "through", "available"],
  requirement: ["required", "requirements", "documents", "must", "need to", "apply"]
};

export function questionIntent(question = "") {
  const q = question.toLowerCase();
  if (/\b(when|date|year)\b/.test(q) && /(launch|start|introduc|commenc)/.test(q)) return "launch";
  if (/\bwho\b/.test(q) && /(eligible|qualif|applicable)/.test(q)) return "eligibility";
  if (/(benefit|assistance|support|provided|receive|entitled)/.test(q)) return "benefits";
  if (/(total|number|count|how many)/.test(q)) return "count";
  if (/(deadline|closing|last date|by when|expire)/.test(q)) return "deadline";
  if (/(amount|cost|budget|outlay|fund|money|how much)/.test(q)) return "amount";
  if (/(where|district|state|location|through where)/.test(q)) return "location";
  if (/(required|requirement|documents|must|need to|apply)/.test(q)) return "requirement";
  return "general";
}

export function retrieve(chunks, question, limit = 8) {
  const q = question.toLowerCase().trim();
  const terms = new Set((q.match(/[a-z0-9]+/g) || []).filter((x) => !STOP.has(x) && x.length > 1));
  const intent = questionIntent(question);
  const intentTerms = INTENT_TERMS[intent] || [];
  return chunks
    .map((chunk) => {
      const hay = chunk.text.toLowerCase();
      let score = 0;
      for (const term of terms) if (hay.includes(term)) score += 2;
      for (const term of intentTerms) if (hay.includes(term)) score += intent === "general" ? 1 : 4;
      if (q.length > 8 && hay.includes(q)) score += 12;
      if (intent === "eligibility" && chunk.section === "Eligibility") score += 8;
      if (intent === "benefits" && chunk.section === "Benefits") score += 8;
      if (intent === "deadline" && chunk.section === "Deadlines") score += 8;
      if (intent === "amount" && chunk.section === "Financial Details") score += 8;
      if (intent === "launch" && /launched|launch|introduced|commenced|started/.test(hay)) score += 8;
      if (intent === "count" && /(total|number|count|scheme|program)/.test(hay)) score += 3;
      return { ...chunk, score };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit);
}
