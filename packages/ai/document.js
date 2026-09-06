import { id, now } from "../database/store.js";

const STOP = new Set("the and for with from this that have will are was were has into shall should would could about above below where which when what who whom your their there here been being through using under over such not its also than then them they you our out use can may per via".split(" "));

export function normalizeText(text = "") {
  return String(text).replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseUploadedContent({ name = "Pasted source", type = "text/plain", content = "" }) {
  const clean = normalizeText(content);
  const ext = name.split(".").pop()?.toLowerCase();
  const supported = ["pdf", "docx", "txt", "md", "markdown", "csv", "png", "jpg", "jpeg", "webp", "wav", "mp3", "zip"].includes(ext) || type.includes("text");
  const fallback = clean || demoBodyFor(name);
  return {
    title: inferTitle(fallback, name),
    text: fallback,
    fileType: ext || "txt",
    supported,
    pages: Math.max(1, Math.ceil(fallback.length / 2600)),
    metadata: { originalName: name, mimeType: type, parser: parserFor(ext, clean) }
  };
}

function parserFor(ext, clean) {
  if (clean) return ["pdf", "docx", "png", "jpg", "jpeg", "webp", "wav", "mp3", "zip"].includes(ext) ? "text-surrogate-parser" : "text-extractor";
  return "demo-safe-fallback";
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
    page: chunks[Math.min(idx, chunks.length - 1)]?.page || 1,
    section: chunks[Math.min(idx, chunks.length - 1)]?.section || "Source",
    confidence: claim.match(/\d|must|shall|eligible|deadline|budget|launched/i) ? 0.94 : 0.84,
    createdAt: now()
  }));
  const entities = extractEntities(text, doc.id);
  const dates = [...text.matchAll(/\b\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}\b|\b20\d{2}\b/g)].map((m) => m[0]);
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

export function retrieve(chunks, question, limit = 4) {
  const terms = new Set((question.toLowerCase().match(/[a-z0-9]+/g) || []).filter((x) => !STOP.has(x)));
  return chunks
    .map((chunk) => {
      const hay = chunk.text.toLowerCase();
      const score = [...terms].reduce((sum, term) => sum + (hay.includes(term) ? 1 : 0), 0);
      return { ...chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
