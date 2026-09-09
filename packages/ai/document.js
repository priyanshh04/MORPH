import { id, now } from "../database/store.js";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { createWorker } from "tesseract.js";

const STOP = new Set("the and for with from this that have will are was were has into shall should would could about above below where which when what who whom your their there here been being through using under over such not its also than then them they our out use can may per via a an as is of to in on at by or be it if how why does did do these those whose document source information table contents page".split(" "));
const MAX_OCR_IMAGES = 20;
const MAX_OCR_TEXT = 50000;

export function normalizeText(text = "") {
  const raw = String(text).replace(/\r/g, "").replace(/\u00a0/g, " ");
  const lines = raw.split("\n").map(cleanLine).filter(Boolean);
  return lines.join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").replace(/([^.!?:;])\n(?=[a-z])/g, "$1 ").trim();
}
function cleanLine(line) {
  let s = String(line).replace(/\s+/g, " ").trim(); if (!s) return "";
  const dots = (s.match(/[.·•_–—-]/g) || []).length; const nums = (s.match(/\b\d+(?:\.\d+)*\b/g) || []).length; const words = s.split(/\s+/).length;
  if (dots >= 5 && (dots / Math.max(1, s.length) > .08 || nums >= Math.max(1, Math.floor(words / 3)))) return "";
  if (/^(?:page|contents|table of contents|chapter)\s*(?:\d+)?$/i.test(s)) return "";
  if (/^(?:\d+\.){1,8}\s*$/.test(s)) return "";
  return s.replace(/[.·•_–—-]{3,}/g, " ").trim();
}

export async function parseUploadedContent({ name = "Pasted source", type = "text/plain", content = "", encoding = "text" }) {
  const ext = name.split(".").pop()?.toLowerCase(); const supported = ["pdf","docx","txt","md","markdown"].includes(ext) || type.includes("text"); let clean = ""; let parser = "text-extractor";
  let ocrImageCount = 0;
  let ocrTextLength = 0;
  try {
    if (encoding === "base64") {
      const buffer = Buffer.from(String(content).replace(/^data:[^;]+;base64,/, ""), "base64");
      if (ext === "pdf") {
        const p = new PDFParse({ data: buffer });
        try {
          const parsed = await p.getText();
          clean = normalizeText(parsed.text || "");
          parser = "pdf-parse";
          const ocr = await extractPdfImageText(p);
          ocrImageCount = ocr.imageCount;
          ocrTextLength = ocr.text.length;
          if (ocr.text) {
            clean = combineSourceAndOcr(clean, ocr.text);
            parser = "pdf-parse+ocr";
          }
        } finally {
          await p.destroy();
        }
      } else if (ext === "docx") { const parsed = await mammoth.extractRawText({ buffer }); clean = normalizeText(parsed.value || ""); parser = "mammoth-docx"; }
      else clean = normalizeText(buffer.toString("utf8"));
    } else clean = normalizeText(content);
  } catch (e) { throw new Error(`Could not parse ${ext || "document"}: ${e.message}`); }
  if (!clean) clean = demoBodyFor(name);
  return { title: inferTitle(clean,name), text: clean, fileType: ext || "txt", supported, pages: Math.max(1,Math.ceil(clean.length/2600)), metadata:{originalName:name,mimeType:type,parser,ocrImageCount,ocrTextLength,ocrEnabled:ext === "pdf" && encoding === "base64"} };
}

async function extractPdfImageText(parser) {
  const empty = { text: "", imageCount: 0 };
  if (!parser || typeof parser.getImage !== "function") return empty;
  let imageResult;
  try {
    imageResult = await parser.getImage({ imageThreshold: 80, imageBuffer: true, imageDataUrl: false });
  } catch (error) {
    console.warn("PDF image extraction skipped:", error.message);
    return empty;
  }
  const images = [];
  for (let pageIndex = 0; pageIndex < (imageResult?.pages || []).length; pageIndex += 1) {
    const page = imageResult.pages[pageIndex];
    for (let imageIndex = 0; imageIndex < (page?.images || []).length; imageIndex += 1) {
      if (images.length >= MAX_OCR_IMAGES) break;
      const image = page.images[imageIndex];
      if (!image?.data) continue;
      const width = Number(image.width || 0);
      const height = Number(image.height || 0);
      if (width && height && (width < 120 || height < 80)) continue;
      const data = Buffer.isBuffer(image.data) ? image.data : Buffer.from(image.data);
      if (!data.length || data.length > 12 * 1024 * 1024) continue;
      images.push({ data, page: pageIndex + 1, image: imageIndex + 1 });
    }
  }
  if (!images.length) return empty;

  const languages = String(process.env.MORPH_OCR_LANGS || "eng").trim() || "eng";
  let worker;
  try {
    worker = await createWorker(languages);
    const seen = new Set();
    const sections = [];
    let totalLength = 0;
    for (const item of images) {
      if (totalLength >= MAX_OCR_TEXT) break;
      try {
        const result = await worker.recognize(item.data);
        const text = normalizeText(result?.data?.text || "");
        if (!text || text.length < 8) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const remaining = MAX_OCR_TEXT - totalLength;
        const clipped = text.slice(0, remaining);
        sections.push(`[IMAGE OCR — page ${item.page}, image ${item.image}]\n${clipped}`);
        totalLength += clipped.length;
      } catch (error) {
        console.warn(`OCR skipped for PDF page ${item.page}, image ${item.image}:`, error.message);
      }
    }
    return { text: sections.join("\n\n"), imageCount: images.length };
  } catch (error) {
    console.warn("PDF OCR unavailable:", error.message);
    return empty;
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch { /* ignore OCR cleanup errors */ }
    }
  }
}

function combineSourceAndOcr(nativeText, ocrText) {
  const native = normalizeText(nativeText);
  const ocr = normalizeText(ocrText);
  if (!ocr) return native;
  if (!native) return ocr;
  return `${native}\n\n${ocr}`;
}

function inferTitle(text,name){const first=text.split("\n").map(x=>x.trim()).find(Boolean);return first&&first.length<160?first.replace(/^#+\s*/,""):name.replace(/\.[^.]+$/,"");}
function demoBodyFor(name){if(/alert|weather|disaster/i.test(name))return"District Disaster Management Authority Cyclone Preparedness Alert\nIssued on 20 September 2026 for coastal blocks. Citizens in low-lying areas must move to shelters by 6 PM. Emergency helpline 1077 will operate continuously. Fishing activity is suspended until 22 September 2026. Schools remain closed on 21 September 2026.";if(/education|policy/i.test(name))return"Education Department Digital Learning Policy 2026\nThe policy provides tablets to students of classes 9 to 12. Schools must complete beneficiary verification by 15 October 2026. Budget allocation is INR 10 crore for phase one.";return"Source document 2026\nThe Department launched the program on 1 August 2026. Eligible households may apply. Applications close on 20 September 2026. The program provides a one-time benefit of INR 10,000.";}

export function chunkDocument(documentId,text){const blocks=normalizeText(text).split(/\n\s*\n+/).flatMap(splitSentences).map(x=>x.trim()).filter(x=>x.length>=20);const chunks=[];let page=1,buffer="";for(const sentence of blocks){const candidate=buffer?`${buffer} ${sentence}`:sentence;if(buffer&&candidate.length>1100){chunks.push(makeChunk(documentId,chunks.length,page,buffer));page++;buffer=sentence;}else buffer=candidate;}if(buffer)chunks.push(makeChunk(documentId,chunks.length,page,buffer));return chunks.length?chunks:[{id:id("chunk"),documentId,index:0,page:1,section:"Source",text:normalizeText(text),createdAt:now()}];}
function splitSentences(block){return String(block).replace(/\s+/g," ").trim().split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean);}
function makeChunk(documentId,index,page,text){return{id:id("chunk"),documentId,index,page,section:detectSection(text,index),text,createdAt:now()};}
function detectSection(text,i){if(i===0)return"Title / Overview";if(/eligib|qualif|beneficiar|applicant|customer|buyer|audience/i.test(text))return"Audience / Eligibility";if(/deadline|close|last date|submit|apply|due|by \d/i.test(text))return"Dates / Deadlines";if(/budget|INR|₹|\$|€|£|amount|fund|benefit|revenue|sales|profit|price|cost/i.test(text))return"Financial / Metrics";if(/risk|alert|emergency|urgent|warning|hazard|suspend|closed/i.test(text))return"Risk / Advisory";return"Source Section";}

export function analyzeDocument(doc,chunks){const text=normalizeText(doc.text);const sentences=splitSentences(text).map(s=>s.trim()).filter(isUsableClaim);const facts=rankClaims(sentences).slice(0,60).map((claim,idx)=>{const owning=findBestChunk(claim,chunks);return{id:id("fact"),documentId:doc.id,claim,citationId:`C${idx+1}`,page:owning?.page||1,section:owning?.section||"Source",confidence:factConfidence(claim),createdAt:now()};});const entities=extractEntities(text,doc.id);const dates=uniqueMatches(text,/\b(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]20\d{2}\b|\b(?:19|20)\d{2}\b/gi);const numbers=uniqueMatches(text,/(?:(?:INR|USD|EUR|GBP|₹|\$|€|£)\s?[-+]?\d[\d,]*(?:\.\d+)?(?:\s?(?:crore|lakh|million|billion|thousand))?|\b[-+]?\d[\d,]*(?:\.\d+)?\s?(?:crore|lakh|million|billion|thousand|%|days|units?|items?|orders?|sales|reviews?|stars?)\b)/gi);return{facts,entities,intelligence:{wordCount:text.split(/\s+/).filter(Boolean).length,pages:doc.pages,detectedLanguage:/[\u0900-\u097F]/.test(text)?"Hindi / Indic":"English",claimCount:facts.length,entityCount:entities.length,citationCount:(text.match(/\[\d+\]/g)||[]).length||Math.min(5,facts.length),topics:topTerms(text).slice(0,12),dates,numbers,risks:facts.filter(f=>/risk|urgent|alert|emergency|must|deadline|suspended|closed/i.test(f.claim)).slice(0,8).map(f=>f.claim)}};}
function isUsableClaim(s){const t=String(s).replace(/\s+/g," ").trim();return t.length>=20&&t.length<=1200&&!/^[\d\s.,:;\-–—]+$/.test(t)&&!/^\s*(?:table of contents|contents|page|chapter)\b/i.test(t)&&!/\.\.\.\s*\d+$/i.test(t);}
function rankClaims(sentences){const seen=new Set();return sentences.map((s,i)=>({s,i,score:claimScore(s)})).sort((a,b)=>b.score-a.score||a.i-b.i).filter(x=>{const k=normalizeText(x.s);if(seen.has(k))return false;seen.add(k);return true;}).map(x=>x.s);}
function claimScore(s){let n=5;if(/\b(?:19|20)\d{2}\b|\d[/-]\d|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(s))n+=5;if(/INR|USD|EUR|GBP|₹|\$|€|£|crore|lakh|%|amount|budget|benefit|fund|revenue|sales|profit|price|cost|rating|score/i.test(s))n+=5;if(/must|shall|required|eligible|apply|submit|deadline|budget|launched|released|sold|purchased/i.test(s))n+=5;if(/\.\.\.|·|•/.test(s))n-=20;return n;}
function factConfidence(s){return /\d|must|shall|eligible|deadline|budget|launched|released|sold|price|rating/i.test(s)?0.95:0.88;}
function findBestChunk(claim,chunks){const terms=tokenize(claim);let best=chunks[0],bestScore=-1;for(const chunk of chunks){const ct=tokenize(chunk.text);const n=[...terms].reduce((sum,t)=>sum+(ct.has(t)?1:0),0);if(n>bestScore){bestScore=n;best=chunk;}}return best;}
function extractEntities(text,documentId){const m=[...text.matchAll(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,})){0,5}\b/g)].map(x=>x[0]).filter(x=>x.length>2&&!/^(The|This|That|When|What|Where|Which|Issued|Section|Source|Table|Contents)$/.test(x));return[...new Set(m)].slice(0,40).map(name=>({id:id("entity"),documentId,name,type:classifyEntity(name),createdAt:now()}));}
function classifyEntity(name){if(/Department|Ministry|Authority|Organisation|Organization|Company|Inc|Ltd/i.test(name))return"Organization";if(/India|District|Block|State|City|Country|Coastal/i.test(name))return"Location";return"Entity";}
function tokenize(text){return new Set((String(text).toLowerCase().match(/[a-z0-9]+/g)||[]).filter(x=>x.length>1&&!STOP.has(x)));}
function topTerms(text){const c={};for(const w of String(text).toLowerCase().match(/[a-z]{4,}/g)||[])if(!STOP.has(w))c[w]=(c[w]||0)+1;return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([w])=>w);}
function uniqueMatches(text,re){re.lastIndex=0;return[...new Set(String(text).match(re)||[])];}
function unique(a){return[...new Set(a)];}

export function retrieve(chunks,question,limit=10){const q=tokenize(question);const raw=String(question).toLowerCase();const intent=/\bhow many\b|\bnumber of\b|\bcount of\b|\btotal number\b/.test(raw)?"count":/\b(?:total|sum|combined|altogether|aggregate)\b/.test(raw)?"sum":/\b(?:when|date|year|released|release|launched|started|introduced|announced|premiered)\b/.test(raw)?"date":/\b(?:how much|amount|budget|revenue|sales|profit|income|price|cost|value)\b/.test(raw)?"amount":/\b(?:deadline|last date|closing|close|due|apply|submit)\b/.test(raw)?"deadline":/\b(?:eligible|eligibility|qualif|beneficiar|audience|customer|buyer|who can)\b/.test(raw)?"eligibility":"general";const scored=chunks.map(chunk=>{const hay=chunk.text.toLowerCase();const terms=tokenize(hay);let score=0;for(const t of q){if(terms.has(t))score+=5;else if(hay.includes(t))score+=1;}if(intent==="count"&&/\b(?:total|number|count|there are|consists|comprises|includes)\b/i.test(hay))score+=18;if(intent==="sum"&&/\b(?:total|sum|combined|altogether|aggregate)\b/i.test(hay))score+=15;if(intent==="date"&&/\b(?:19|20)\d{2}\b|January|February|March|April|May|June|July|August|September|October|November|December|released|launched|introduced|premiered/i.test(hay))score+=15;if(intent==="amount"&&/INR|USD|EUR|GBP|₹|\$|€|£|revenue|sales|profit|income|amount|budget|price|cost|value/i.test(hay))score+=15;if(intent==="deadline"&&/deadline|close|last date|apply|submit|due|by\b/i.test(hay))score+=15;if(intent==="eligibility"&&/eligible|eligibility|qualif|beneficiar|audience|customer|buyer/i.test(hay))score+=15;return{...chunk,score};}).sort((a,b)=>b.score-a.score||a.index-b.index);return scored.filter(x=>x.score>0).slice(0,limit);}
