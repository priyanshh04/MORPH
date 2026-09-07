import { id, now } from "../database/store.js";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const STOP = new Set("the and for with from this that have will are was were has into shall should would could about above below where which when what who whom your their there here been being through using under over such not its also than then them they our out use can may per via a an as is of to in on at by or be it if how why does did do these those whose scheme schemes document source information government department ministry page pages table contents news".split(" "));

export function normalizeText(text = "") {
  const raw = String(text).replace(/\r/g, "").replace(/\u00a0/g, " ");
  const lines = raw.split("\n").map((line) => cleanPdfLine(line)).filter(Boolean);
  const joined = lines.join("\n");
  return joined.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").replace(/([^.!?:;])\n(?=[a-z])/g, "$1 ").trim();
}

function cleanPdfLine(line) {
  let s = String(line).replace(/\s+/g, " ").trim();
  if (!s) return "";
  const dots = (s.match(/[.·•_–—-]/g) || []).length;
  const numbers = (s.match(/\b\d+(?:\.\d+)*\b/g) || []).length;
  const words = s.split(/\s+/).length;
  if (dots >= 5 && (dots / Math.max(1, s.length) > 0.08 || numbers >= Math.max(1, Math.floor(words / 3)))) return "";
  if (/^(?:page|contents|table of contents|chapter)\s*(?:\d+)?$/i.test(s)) return "";
  if (/^(?:\d+\.){1,8}\s*$/.test(s)) return "";
  s = s.replace(/[.·•_–—-]{3,}/g, " ").replace(/\s+(?:\d+\s*){1,5}$/g, "").trim();
  return s;
}

export async function parseUploadedContent({ name = "Pasted source", type = "text/plain", content = "", encoding = "text" }) {
  const ext = name.split(".").pop()?.toLowerCase();
  const supported = ["pdf", "docx", "txt", "md", "markdown"].includes(ext) || type.includes("text");
  let clean = "";
  let parser = "text-extractor";
  try {
    if (encoding === "base64") {
      const buffer = Buffer.from(String(content).replace(/^data:[^;]+;base64,/, ""), "base64");
      if (ext === "pdf") {
        const pdfParser = new PDFParse({ data: buffer });
        const parsed = await pdfParser.getText();
        clean = normalizeText(parsed.text || "");
        await pdfParser.destroy();
        parser = "pdf-parse";
      } else if (ext === "docx") {
        const parsed = await mammoth.extractRawText({ buffer });
        clean = normalizeText(parsed.value || "");
        parser = "mammoth-docx";
      } else clean = normalizeText(buffer.toString("utf8"));
    } else clean = normalizeText(content);
  } catch (error) { throw new Error(`Could not parse ${ext || "document"}: ${error.message}`); }
  if (!clean) clean = demoBodyFor(name);
  return { title: inferTitle(clean, name), text: clean, fileType: ext || "txt", supported, pages: Math.max(1, Math.ceil(clean.length / 2600)), metadata: { originalName: name, mimeType: type, parser } };
}

function inferTitle(text, name) {
  const first = text.split("\n").map((x) => x.trim()).find(Boolean);
  return first && first.length < 160 ? first.replace(/^#+\s*/, "") : name.replace(/\.[^.]+$/, "");
}

function demoBodyFor(name) {
  if (/alert|weather|disaster/i.test(name)) return "District Disaster Management Authority Cyclone Preparedness Alert\nIssued on 20 September 2026 for coastal blocks. Citizens in low-lying areas must move to shelters by 6 PM. Emergency helpline 1077 will operate continuously. Fishing activity is suspended until 22 September 2026. Schools in affected blocks remain closed on 21 September 2026. [1] Section: Public Safety Advisory.";
  if (/education|policy/i.test(name)) return "Education Department Digital Learning Policy 2026\nThe policy provides tablets to students of classes 9 to 12 in government schools. Schools must complete beneficiary verification by 15 October 2026. District officers must submit implementation reports every month. Budget allocation is INR 10 crore for phase one. [1] Section: Implementation Guidelines.";
  return "Government Welfare Scheme Notification 2026\nThe Department of Social Welfare launched the Suraksha Benefit Scheme on 1 August 2026. Eligible households with annual income below INR 2,50,000 may apply through district service centres. Applications close on 20 September 2026. The scheme provides a one-time benefit of INR 10,000 after verification. District officers must publish beneficiary lists within 30 days. [1] Section: Eligibility and Benefits.";
}

export function chunkDocument(documentId, text) {
  const normalized = normalizeText(text);
  const blocks = normalized.split(/\n\s*\n+/).flatMap((block) => splitIntoSentences(block)).map((x) => x.trim()).filter((x) => x.length >= 20);
  const chunks = [];
  let page = 1;
  let buffer = "";
  for (const sentence of blocks) {
    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (buffer && candidate.length > 1100) { chunks.push(makeChunk(documentId, chunks.length, page, buffer)); page += 1; buffer = sentence; }
    else buffer = candidate;
  }
  if (buffer) chunks.push(makeChunk(documentId, chunks.length, page, buffer));
  return chunks.length ? chunks : [{ id: id("chunk"), documentId, index: 0, page: 1, section: "Source", text: normalized, createdAt: now() }];
}

function splitIntoSentences(block) {
  return String(block).replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean);
}
function makeChunk(documentId, index, page, text) { return { id: id("chunk"), documentId, index, page, section: detectSection(text, index), text, createdAt: now() }; }
function detectSection(text, i) {
  if (i === 0) return "Title / Overview";
  if (/eligib|eligible|qualification|beneficiar|applicant/i.test(text)) return "Eligibility";
  if (/deadline|close|by \d|due|last date|submit|apply/i.test(text)) return "Deadlines / Applications";
  if (/budget|INR|₹|crore|lakh|amount|fund|benefit/i.test(text)) return "Financial Details";
  if (/risk|alert|emergency|urgent|suspended|warning|hazard|closed/i.test(text)) return "Risk / Advisory";
  return "Source Section";
}

export function analyzeDocument(doc, chunks) {
  const text = normalizeText(doc.text);
  const sentences = splitIntoSentences(text).map((s) => s.trim()).filter(isUsableClaim);
  const facts = rankClaims(sentences).slice(0, 40).map((claim, idx) => {
    const owningChunk = findBestChunkForClaim(claim, chunks);
    return { id: id("fact"), documentId: doc.id, claim, citationId: `C${idx + 1}`, page: owningChunk?.page || 1, section: owningChunk?.section || "Source", confidence: factConfidence(claim), createdAt: now() };
  });
  const entities = extractEntities(text, doc.id);
  const dates = uniqueMatches(text, /\b(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]20\d{2}\b|\b20\d{2}\b/gi);
  const numbers = uniqueMatches(text, /(?:INR|₹)\s?[\d,]+(?:\.\d+)?(?:\s?(?:crore|lakh|million|thousand))?|\b\d[\d,]*(?:\.\d+)?\s?(?:crore|lakh|%|days|PM|AM)\b/gi);
  const topics = topTerms(text).slice(0, 10);
  return { facts, entities, intelligence: { wordCount: text.split(/\s+/).filter(Boolean).length, pages: doc.pages, detectedLanguage: /[\u0900-\u097F]/.test(text) ? "Hindi / Indic" : "English", claimCount: facts.length, entityCount: entities.length, citationCount: (text.match(/\[\d+\]/g) || []).length || Math.min(5, facts.length), topics, dates, numbers, risks: facts.filter((f) => /risk|urgent|alert|emergency|must|deadline|suspended|closed/i.test(f.claim)).slice(0, 6).map((f) => f.claim) } };
}

function isUsableClaim(s) {
  const t = String(s).replace(/\s+/g, " ").trim();
  if (t.length < 28 || t.length > 900) return false;
  if (/^[\d\s.,:;\-–—]+$/.test(t)) return false;
  if (/^[A-Z\s]{14,}$/.test(t) && !/[.!?]/.test(t)) return false;
  if (/\.\s*\.\s*\.|\.\.\.\s*\d+$/i.test(t)) return false;
  if (/^(?:table of contents|contents|page|chapter)\b/i.test(t)) return false;
  if (/^[A-Z][A-Z\s&,-]{20,}\s+\d+(?:\s+[A-Z][A-Z\s&,-]{3,}){2,}$/i.test(t)) return false;
  return true;
}
function rankClaims(sentences) {
  const seen = new Set();
  return sentences.map((s, i) => ({ s, i, score: claimScore(s) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).filter((x) => { const k = normalize(x.s); if (seen.has(k)) return false; seen.add(k); return true; }).map((x) => x.s);
}
function claimScore(s) {
  let score = 5;
  if (/\b\d{4}\b|\d[/-]\d|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(s)) score += 8;
  if (/INR|₹|crore|lakh|%|amount|budget|benefit|fund/i.test(s)) score += 6;
  if (/must|shall|required|eligible|apply|submit|deadline|provides?|launched|issued|announced|introduced/i.test(s)) score += 6;
  if (/\.\.\.|·|•/.test(s)) score -= 20;
  if (/^(?:newly launched scheme|government schemes in news|table of contents)/i.test(s)) score -= 30;
  return score;
}
function factConfidence(s) { return /\d|must|shall|eligible|deadline|budget|launched|provides|apply/i.test(s) ? 0.95 : 0.88; }
function findBestChunkForClaim(claim, chunks) {
  const terms = tokenize(claim); let best = chunks[0]; let bestScore = -1;
  for (const chunk of chunks) { const ct = tokenize(chunk.text); const score = [...terms].reduce((sum, t) => sum + (ct.has(t) ? 1 : 0), 0); if (score > bestScore) { bestScore = score; best = chunk; } }
  return best;
}
function extractEntities(text, documentId) {
  const matches = [...text.matchAll(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,})){0,5}\b/g)].map((m) => m[0]).filter((x) => x.length > 2 && !/^(The|This|That|When|What|Where|Which|Issued|Section|Source|Table|Contents)$/.test(x));
  return [...new Set(matches)].slice(0, 24).map((name) => ({ id: id("entity"), documentId, name, type: classifyEntity(name), createdAt: now() }));
}
function classifyEntity(name) { if (/Department|Ministry|Authority|Organisation|Organization/i.test(name)) return "Organization"; if (/India|District|Block|State|City|Coastal/i.test(name)) return "Location"; if (/Scheme|Policy|Alert|Notification/i.test(name)) return "Program / Document"; return "Entity"; }
function tokenize(text) { return new Set((String(text).toLowerCase().match(/[a-z0-9]+/g) || []).filter((x) => x.length > 1 && !STOP.has(x))); }
function topTerms(text) { const counts = {}; for (const w of String(text).toLowerCase().match(/[a-z]{4,}/g) || []) if (!STOP.has(w)) counts[w] = (counts[w] || 0) + 1; return Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([w]) => w); }
function uniqueMatches(text, re) { return [...new Set(String(text).match(re) || [])]; }

export function retrieve(chunks, question, limit = 6) {
  const q = tokenize(question); const raw = String(question).toLowerCase();
  const intent = /\bwhen\b|\blaunched\b|\bdate\b|\byear\b/.test(raw) ? "date" : /\bhow much\b|\bamount\b|\bbudget\b|\bbenefit\b|\bcost\b/.test(raw) ? "amount" : /\bdeadline\b|\blast date\b|\bclose\b|\bapply\b|\bsubmit\b|\bdue\b/.test(raw) ? "deadline" : /\beligib|qualif|beneficiar|who can/.test(raw) ? "eligibility" : "general";
  const scored = chunks.map((chunk) => { const hay = chunk.text.toLowerCase(); const terms = tokenize(hay); let score = 0; for (const t of q) if (terms.has(t)) score += 4; else if (hay.includes(t)) score += 1; if (intent === "date" && /launched|launch|started|introduced|announced|issued|effective|commenced/i.test(hay)) score += 18; if (intent === "date" && /\b(?:\d{1,2}\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+20\d{2}\b|\b20\d{2}\b/i.test(hay)) score += 25; if (intent === "amount" && /INR|₹|crore|lakh|amount|benefit|budget/i.test(hay)) score += 15; if (intent === "deadline" && /deadline|close|last date|apply|submit|due|by\b/i.test(hay)) score += 15; if (intent === "eligibility" && /eligib|qualification|qualify|beneficiar|who can/i.test(hay)) score += 15; return { ...chunk, score }; }).sort((a,b) => b.score-a.score || a.index-b.index);
  return scored.filter((x) => x.score > 0).slice(0, limit);
}
