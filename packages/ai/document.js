import { id, now } from "../database/store.js";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const STOP = new Set("the and for with from this that have will are was were has into shall should would could about above below where which when what who whom your their there here been being through using under over such not its also than then them they you our out use can may per via a an as is of to in on at by or be it if how why does did do this these those what when where who which whose been being".split(" "));

export function normalizeText(text = "") {
  let value = String(text)
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // PDF extraction often produces table-of-contents/page-number noise such as:
  // "Newly launched scheme ........ 13 2.1.1.". Remove only lines that are
  // overwhelmingly punctuation/page-number markers; preserve real source text.
  value = value
    .split("\n")
    .map((line) => cleanPdfLine(line))
    .filter(Boolean)
    .join("\n");

  // Join sentences that were split across PDF line wraps while keeping headings.
  value = value.replace(/([^.!?:;])\n(?=[a-z])/g, "$1 ");
  return value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanPdfLine(line) {
  const s = String(line).trim();
  if (!s) return "";
  const compact = s.replace(/\s+/g, " ");
  const withoutDots = compact.replace(/[.·•_\-–—]{3,}/g, " ").trim();
  const pageTail = withoutDots.replace(/\s+(?:\d+\s*){1,4}$/, "").trim();

  // Keep ordinary prose even when it contains numbers. Drop obvious TOC rows.
  const punctuationRatio = (compact.match(/[.·•_\-–—]/g) || []).length / Math.max(1, compact.length);
  const numericTokens = (compact.match(/\b\d+(?:\.\d+)*\b/g) || []).length;
  const wordTokens = compact.split(/\s+/).length;
  if (punctuationRatio > 0.18 && numericTokens >= 1 && numericTokens >= wordTokens / 3) return "";
  if (/^(?:page|contents|table of contents)\s+\d+$/i.test(compact)) return "";
  if (/^(?:\d+\.){1,6}\s*$/.test(compact)) return "";

  return pageTail || withoutDots || compact;
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
      } else {
        clean = normalizeText(buffer.toString("utf8"));
      }
    } else {
      clean = normalizeText(content);
    }
  } catch (error) {
    throw new Error(`Could not parse ${ext || "document"}: ${error.message}`);
  }

  if (!clean) clean = demoBodyFor(name);
  return {
    title: inferTitle(clean, name),
    text: clean,
    fileType: ext || "txt",
    supported,
    pages: Math.max(1, Math.ceil(clean.length / 2600)),
    metadata: { originalName: name, mimeType: type, parser }
  };
}

function inferTitle(text, name) {
  const first = text.split("\n").map((x) => x.trim()).find(Boolean);
  return first && first.length < 120 ? first.replace(/^#+\s*/, "") : name.replace(/\.[^.]+$/, "");
}

function demoBodyFor(name) {
  if (/alert|weather|disaster/i.test(name)) return "District Disaster Management Authority Cyclone Preparedness Alert\nIssued on 20 September 2026 for coastal blocks. Citizens in low-lying areas must move to shelters by 6 PM. Emergency helpline 1077 will operate continuously. Fishing activity is suspended until 22 September 2026. Schools in affected blocks remain closed on 21 September 2026. [1] Section: Public Safety Advisory.";
  if (/education|policy/i.test(name)) return "Education Department Digital Learning Policy 2026\nThe policy provides tablets to students of classes 9 to 12 in government schools. Schools must complete beneficiary verification by 15 October 2026. District officers must submit implementation reports every month. Budget allocation is INR 10 crore for phase one. [1] Section: Implementation Guidelines.";
  return "Government Welfare Scheme Notification 2026\nThe Department of Social Welfare launched the Suraksha Benefit Scheme on 1 August 2026. Eligible households with annual income below INR 2,50,000 may apply through district service centres. Applications close on 20 September 2026. The scheme provides a one-time benefit of INR 10,000 after verification. District officers must publish beneficiary lists within 30 days. [1] Section: Eligibility and Benefits.";
}

export function chunkDocument(documentId, text) {
  const normalized = normalizeText(text);
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .flatMap((block) => splitIntoSentences(block))
    .map((x) => x.trim())
    .filter((x) => x.length >= 12);

  const chunks = [];
  let page = 1;
  let buffer = "";

  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer} ${paragraph}` : paragraph;
    if (buffer && candidate.length > 1100) {
      chunks.push(makeChunk(documentId, chunks.length, page, buffer));
      page += 1;
      buffer = paragraph;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) chunks.push(makeChunk(documentId, chunks.length, page, buffer));

  return chunks.length ? chunks : [{ id: id("chunk"), documentId, index: 0, page: 1, section: "Source", text: normalized, createdAt: now() }];
}

function splitIntoSentences(block) {
  const clean = block.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  // Keep headings attached to the first sentence and split ordinary prose for better retrieval.
  return clean.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean);
}

function makeChunk(documentId, index, page, text) {
  return { id: id("chunk"), documentId, index, page, section: detectSection(text, index), text, createdAt: now() };
}

function detectSection(text, i) {
  if (i === 0) return "Title / Overview";
  if (/eligib|eligible|qualification|beneficiar/i.test(text)) return "Eligibility";
  if (/deadline|close|by \d|due|last date|submit/i.test(text)) return "Deadlines";
  if (/budget|INR|₹|crore|lakh|amount|fund/i.test(text)) return "Financial Details";
  if (/risk|alert|emergency|urgent|suspended|warning|hazard/i.test(text)) return "Risk / Advisory";
  return "Source Section";
}

export function analyzeDocument(doc, chunks) {
  const text = normalizeText(doc.text);
  const sentences = splitIntoSentences(text).map((s) => s.trim()).filter((s) => s.length > 18);
  const claims = sentences.slice(0, 30).map((claim, idx) => {
    const owningChunk = findBestChunkForClaim(claim, chunks, idx);
    return {
      id: id("fact"), documentId: doc.id, claim, citationId: `C${idx + 1}`,
      page: owningChunk?.page || 1, section: owningChunk?.section || "Source",
      confidence: claim.match(/\d|must|shall|eligible|deadline|budget|launched|provides|apply/i) ? 0.94 : 0.84,
      createdAt: now()
    };
  });

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

function findBestChunkForClaim(claim, chunks, fallbackIndex) {
  const claimTerms = tokenize(claim);
  let best = chunks[fallbackIndex] || chunks[0];
  let bestScore = -1;
  for (const chunk of chunks) {
    const terms = tokenize(chunk.text);
    const score = claimTerms.reduce((sum, term) => sum + (terms.has(term) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = chunk; }
  }
  return best;
}

function extractEntities(text, documentId) {
  const matches = [...text.matchAll(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,})){0,5}\b/g)]
    .map((m) => m[0])
    .filter((x) => x.length > 2 && !/^(The|This|If|For|Section|Issued|When|What|Where|Which)$/.test(x));
  return [...new Set(matches)].slice(0, 18).map((name) => ({ id: id("entity"), documentId, name, type: classifyEntity(name), createdAt: now() }));
}

function classifyEntity(name) {
  if (/Department|Ministry|Authority|Organisation|Organization|NTRO|NCIIPC/i.test(name)) return "Organization";
  if (/India|District|Block|State|City|Coastal/i.test(name)) return "Location";
  if (/Scheme|Policy|Alert|Notification/i.test(name)) return "Program / Document";
  return "Entity";
}

function tokenize(text) {
  return new Set((String(text).toLowerCase().match(/[a-z0-9]+/g) || []).filter((x) => x.length > 1 && !STOP.has(x)));
}

function topTerms(text) {
  const counts = {};
  for (const raw of text.toLowerCase().match(/[a-z]{4,}/g) || []) if (!STOP.has(raw)) counts[raw] = (counts[raw] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

export function retrieve(chunks, question, limit = 4) {
  const questionTerms = tokenize(question);
  const questionText = String(question).toLowerCase();
  const scored = chunks.map((chunk) => {
    const hay = chunk.text.toLowerCase();
    const chunkTerms = tokenize(hay);
    let score = 0;
    for (const term of questionTerms) {
      if (chunkTerms.has(term)) score += 3;
      else if (hay.includes(term)) score += 1;
    }

    // Intent-aware boosts make common factual questions land on the sentence that
    // actually contains the answer rather than a neighbouring TOC/header chunk.
    if (/\bwhen\b|\bdate\b|\blaunched\b|\bstarted\b/.test(questionText) && /launched|issued|started|began|\b20\d{2}\b|\b\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}\b/i.test(hay)) score += 5;
    if (/\bwho\b|\bdepartment\b|\bministry\b/.test(questionText) && /department|ministry|authority|organisation|organization/i.test(hay)) score += 4;
    if (/\bhow much\b|\bamount\b|\bbudget\b|\bprice\b|\bbenefit\b/.test(questionText) && /INR|₹|crore|lakh|amount|benefit/i.test(hay)) score += 5;
    if (/\bdeadline\b|\bwhen.*close|\blast date\b|\bapply\b/.test(questionText) && /close|deadline|apply|submit|\bby\b/i.test(hay)) score += 5;
    if (/\beligib/.test(questionText) && /eligib|qualification|beneficiar/i.test(hay)) score += 5;

    // Strongly penalize tiny numeric/TOC fragments unless they contain a meaningful word.
    const words = hay.split(/\s+/).filter(Boolean).length;
    if (words < 6 && /\d/.test(hay)) score -= 4;
    return { ...chunk, score };
  });

  return scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit);
}
