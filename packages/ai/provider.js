import { OUTPUT_TYPES } from "../shared/config.js";

const FALLBACK = "MORPH could not verify this information in the selected source.";
const STOP = new Set("the and for with from this that have will are was were has into shall should would could about above below where which when what who whom your their there here been being through using under over such not its also than then them they our out use can may per via a an as is of to in on at by or be it if how why does did do these those whose scheme schemes document source information government department ministry table contents news".split(" "));
const DATE_RE = /\b(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]20\d{2}\b/gi;
const YEAR_RE = /\b20\d{2}\b/g;
const AMOUNT_RE = /(?:(?:INR|₹)\s?[\d,]+(?:\.\d+)?(?:\s?(?:crore|lakh|million|thousand))?|\b\d[\d,]*(?:\.\d+)?\s?(?:crore|lakh|million|thousand|%)\b)/gi;

export class DemoAIProvider {
  constructor() { this.name = "local-source-engine"; this.model = "morph-grounded-v3"; }

  async transform({ document, facts = [], outputType, audience, tone, length, channel, language }) {
    const usable = uniqueFacts(facts).filter(f => usableFact(f.claim));
    if (!usable.length) return { title: `${outputType} for ${audience}`, content: FALLBACK, provider: this.name, model: this.model, citationMap: [] };
    const context = buildContext(document, usable);
    const content = renderArtifact(outputType, context, { audience, tone, length, channel, language });
    const used = usedFacts(content, usable);
    return { title: `${outputType} for ${audience}`, content, provider: this.name, model: this.model, citationMap: used.map((f, i) => ({ marker: `[${i + 1}]`, factId: f.id, page: f.page || 1, section: f.section || "Source", source: f.claim })) };
  }

  async chat({ question = "", evidence = [] }) {
    const q = normalize(question);
    if (!q || !evidence.length) return { answer: FALLBACK, citations: [] };
    const candidates = evidence.flatMap((chunk, ci) => splitSentences(chunk.text).map((text, si) => ({ text: cleanSentence(text), chunk, ci, si })));
    const intent = detectIntent(q);
    const candidate = answerCandidate(candidates, q, intent);
    if (!candidate) return { answer: FALLBACK, citations: [] };
    return { answer: `${candidate.text} [1]`, citations: [{ marker: "[1]", page: candidate.chunk.page || 1, section: candidate.chunk.section || "Source", source: candidate.text }] };
  }
}

function buildContext(document, facts) {
  const all = facts.map((f, i) => ({ ...f, marker: `[${i + 1}]`, text: cleanSentence(f.claim) }));
  return {
    title: cleanTitle(document.title || "Source document"),
    facts: all,
    dates: unique(all.flatMap(f => [...matches(f.text, DATE_RE), ...matches(f.text, YEAR_RE)])),
    amounts: unique(all.flatMap(f => matches(f.text, AMOUNT_RE))),
    launch: all.filter(f => /\b(?:launched|launch|introduced|started|began|commenced|announced|issued|rolled out|implemented)\b/i.test(f.text)),
    deadlines: all.filter(f => /\b(?:deadline|closing|close|last date|submit|apply|due|within\s+\d+\s+days|by)\b/i.test(f.text)),
    eligibility: all.filter(f => /\b(?:eligible|eligibility|qualif|beneficiar|applicant|household|student|farmer|resident|who can)\b/i.test(f.text)),
    benefits: all.filter(f => /\b(?:benefit|provides?|support|grant|assistance|fund|allocation|subsid|receive|financial|market|reduced)\b/i.test(f.text)),
    actions: all.filter(f => /\b(?:must|shall|required|apply|submit|register|contact|publish|complete|verify|move|remain|suspend|report)\b/i.test(f.text)),
    risks: all.filter(f => /\b(?:risk|alert|warning|emergency|urgent|hazard|suspend|closed|closure)\b/i.test(f.text))
  };
}

function renderArtifact(type, c, opts) {
  const list = (items, n = 5, prefix = "• ") => items.length ? items.slice(0, n).map(f => `${prefix}${f.text} ${f.marker}`).join("\n") : "• Not explicitly stated in the analyzed source.";
  const dates = c.dates.length ? c.dates.slice(0, 8).map(x => `• ${x}`).join("\n") : "• No explicit date found in the analyzed evidence.";
  const amounts = c.amounts.length ? c.amounts.slice(0, 8).map(x => `• ${x}`).join("\n") : "• No explicit amount found in the analyzed evidence.";
  const primary = c.facts.slice(0, opts.length === "Detailed" ? 10 : opts.length === "Short" ? 4 : 7);
  switch (type) {
    case "Citizen Simplifier": return `WHAT THIS MEANS\n${c.title}\n\nIN SIMPLE LANGUAGE\n${list(primary)}\n\nWHO IT IS FOR\n${list(c.eligibility, 4)}\n\nWHAT PEOPLE MAY RECEIVE\n${list(c.benefits, 4)}\n\nIMPORTANT DATES\n${dates}\n\nWHAT TO DO\n${list(c.actions, 4)}\n\nSOURCE BOUNDARY\nThis summary uses only the supplied source.`;
    case "Officer Brief": return `OFFICER BRIEF\n${c.title}\n\nSITUATION / LAUNCH\n${list(c.launch.length ? c.launch : primary, 2)}\n\nKEY FACTS\n${list(primary, 7)}\n\nOPERATIONAL REQUIREMENTS\n${list(c.actions, 6)}\n\nDEADLINES / EFFECTIVE DATES\n${dates}\n\nREVIEW SIGNALS\n${list(c.risks, 4)}`;
    case "Executive Summary": return `EXECUTIVE SUMMARY\n${c.title}\n\nPURPOSE / CONTEXT\n${list(primary, 3, "") }\n\nDECISION-RELEVANT FACTS\n${list(c.facts.filter(f => c.actions.includes(f) || c.benefits.includes(f)), 6)}\n\nFINANCIAL FIGURES\n${amounts}\n\nKEY DATES\n${dates}\n\nSOURCE LIMIT\nNo information outside the supplied source has been added.`;
    case "FAQ Generator": return buildFaq(c);
    case "WhatsApp Generator": return `MORPH SOURCE UPDATE — ${c.title}\n\nKEY POINTS\n${list(primary, 4)}\n\nWHO IS AFFECTED / ELIGIBLE\n${list(c.eligibility, 2)}\n\nIMPORTANT DATES\n${dates}\n\nPlease refer to the cited source before acting.`;
    case "Social Media Generator": return `SOCIAL MEDIA DRAFT\n\n${c.title}\n\nUPDATE\n${list(primary, 3)}\n\nWHY IT MATTERS\n${list(c.benefits.length ? c.benefits : primary, 2)}\n\nDATE / DEADLINE\n${c.deadlines.length ? list(c.deadlines, 2) : dates}\n\nSource-grounded draft — human review required.`;
    case "Presentation Generator": return buildSlides(c);
    case "Voice Script": return `VOICE SCRIPT\n\nOPENING\nThis briefing covers ${c.title}.\n\nMAIN MESSAGE\n${list(primary, 3, "") }\n\nWHO / BENEFIT\n${list(c.eligibility.length ? c.eligibility : c.benefits, 2, "") }\n\nIMPORTANT DATE\n${c.dates[0] || "No explicit date stated."}\n\nCLOSING\nThis script contains only information identified in the supplied source.`;
    case "Press Release": return `PRESS RELEASE DRAFT\n${c.title}\n\nHEADLINE\n${headline(c)}\n\nLEAD\n${list(primary, 2, "") }\n\nKEY DETAILS\n${list(primary, 5)}\n\nDATES / IMPLEMENTATION\n${dates}\n\nREVIEW NOTE\nSource-grounded draft for human approval before publication.`;
    case "SMS / Alert": return buildSms(c);
    case "Infographic Content": return `INFOGRAPHIC CONTENT\n\nTITLE\n${c.title}\n\nAT A GLANCE\n${list(primary, 4)}\n\nWHO\n${list(c.eligibility, 3)}\n\nBENEFIT / MONEY\n${amounts}\n${list(c.benefits, 3)}\n\nDATES\n${dates}`;
    case "Detailed Report": return `DETAILED SOURCE REPORT\n${c.title}\n\n1. OVERVIEW\n${list(primary, 7)}\n\n2. ELIGIBILITY / AUDIENCE\n${list(c.eligibility.length ? c.eligibility : primary, 6)}\n\n3. BENEFITS / FINANCIAL DETAILS\n${list(c.benefits.length ? c.benefits : primary, 6)}\n${amounts}\n\n4. DATES / DEADLINES\n${dates}\n\n5. ACTIONS / REQUIREMENTS\n${list(c.actions.length ? c.actions : primary, 6)}\n\n6. RISKS / REVIEW SIGNALS\n${list(c.risks, 5)}\n\n7. SOURCE LIMITATION\nNo absent facts are inferred.`;
    case "Key Facts / Statistics": return `KEY FACTS & STATISTICS\n${c.title}\n\nNUMBERS / AMOUNTS\n${amounts}\n\nDATES / YEARS\n${dates}\n\nKEY FACTS\n${list(primary, 8)}`;
    case "Action Checklist": return `ACTION CHECKLIST\n${c.title}\n\n${(c.actions.length ? c.actions : primary).slice(0, 8).map(f => `☐ ${f.text} ${f.marker}`).join("\n")}\n\nDATES TO TRACK\n${dates}`;
    default: return `SOURCE-GROUNDED OUTPUT\n${c.title}\n\n${list(primary, 7)}`;
  }
}

function buildFaq(c) {
  const out = [];
  const add = (q, f) => { if (f && !out.some(x => x.id === f.id) && out.length < 6) out.push({ q, f, id: f.id }); };
  add("When was it launched or introduced?", c.launch.find(f => hasDate(f.text)));
  add("Who is eligible or affected?", c.eligibility[0]);
  add("What benefit or support is described?", c.benefits[0]);
  add("What deadline or application requirement is stated?", c.deadlines.find(f => hasDate(f.text)) || c.deadlines[0]);
  for (const f of c.facts) add(`What does the source say about ${subject(f.text)}?`, f);
  return `FREQUENTLY ASKED QUESTIONS\n${c.title}\n\n${out.length ? out.map((x,i) => `Q${i+1}. ${x.q}\nA. ${x.f.text} ${x.f.marker}`).join("\n\n") : FALLBACK}`;
}

function buildSlides(c) {
  const slides = [`Slide 1 — ${c.title}\nPurpose: source-grounded overview.`];
  const groups = [["Key facts", c.facts.slice(0,3)], ["Eligibility / audience", c.eligibility.slice(0,3)], ["Benefits / financial details", c.benefits.slice(0,3)], ["Dates / deadlines", c.deadlines.length ? c.deadlines.slice(0,3) : c.launch.slice(0,3)], ["Actions / requirements", c.actions.slice(0,3)]];
  for (const [name, items] of groups) if (items.length) slides.push(`Slide ${slides.length+1} — ${name}\n${items.map(f => `• ${f.text} ${f.marker}`).join("\n")}`);
  return `PRESENTATION OUTLINE\n\n${slides.join("\n\n")}`;
}
function buildSms(c) { const f = c.deadlines[0] || c.actions[0] || c.launch[0] || c.facts[0]; return f ? `SMS / ALERT\n${shorten(f.text, 150)} ${f.marker}` : FALLBACK; }

function answerCandidate(candidates, q, intent) {
  const ranked = candidates.map(x => ({ ...x, score: sentenceScore(x.text, q, intent) })).sort((a,b) => b.score-a.score || a.ci-b.ci || a.si-b.si);
  const min = intent === "general" ? 7 : 9;
  if (intent === "date") return ranked.find(x => x.score >= min && hasDate(x.text) && /launched|launch|introduced|started|began|commenced|announced|issued|rolled out|implemented/i.test(x.text)) || null;
  if (intent === "count") return ranked.find(x => x.score >= min && /\b\d+\b/.test(x.text) && /scheme|schemes|total|number|covered|listed/i.test(x.text)) || null;
  if (intent === "amount") return ranked.find(x => x.score >= min && /INR|₹|crore|lakh|amount|benefit|budget|cost|price|value/i.test(x.text)) || null;
  if (intent === "deadline") return ranked.find(x => x.score >= min && /deadline|closing|close|last date|submit|apply|due|by\b/i.test(x.text)) || null;
  if (intent === "eligibility") return ranked.find(x => x.score >= min && /eligible|eligibility|qualif|beneficiar|applicant|household|student|farmer|resident/i.test(x.text)) || null;
  if (intent === "owner") return ranked.find(x => x.score >= min && /department|ministry|authority|issued by|government|organisation|organization/i.test(x.text)) || null;
  return ranked.find(x => x.score >= min) || null;
}

function sentenceScore(text, q, intent) {
  const t = normalize(text); const terms = tokenize(q); let score = 0;
  for (const term of terms) if (t.includes(term)) score += 3;
  if (intent === "date") { if (hasDate(text)) score += 8; if (/launched|launch|introduced|started|began|commenced|announced|issued|rolled out|implemented/i.test(text)) score += 14; }
  if (intent === "count") { if (/scheme|schemes|total|number|covered|listed/i.test(text)) score += 10; if (/\b\d+\b/.test(text)) score += 8; }
  if (intent === "amount" && /INR|₹|crore|lakh|amount|benefit|budget|cost|price|value/i.test(text)) score += 13;
  if (intent === "deadline" && /deadline|closing|close|last date|submit|apply|due|by\b/i.test(text)) score += 12;
  if (intent === "eligibility" && /eligible|eligibility|qualif|beneficiar|applicant|household|student|farmer|resident/i.test(text)) score += 12;
  if (intent === "owner" && /department|ministry|authority|issued by|government|organisation|organization/i.test(text)) score += 11;
  if (/table of contents|contents|news\s+table|\.\.\.\s*\d+|^page\s*\d/i.test(text)) score -= 30;
  return score;
}
function detectIntent(q) {
  if (/\bhow many\b|\btotal number\b|\bnumber of\b|\bcount of\b/.test(q)) return "count";
  if (/\bwhen\b|\blaunched\b|\blaunch\b|\bstarted\b|\bbegan\b|\bintroduced\b|\bannounced\b|\bissued\b|\beffective\b|\bdate\b|\byear\b/.test(q)) return "date";
  if (/\bhow much\b|\bamount\b|\bbudget\b|\bbenefit\b|\bcost\b|\bprice\b|\bvalue\b/.test(q)) return "amount";
  if (/\bdeadline\b|\blast date\b|\bclose\b|\bclosing\b|\bapply\b|\bsubmit\b|\bdue\b|\bby when\b/.test(q)) return "deadline";
  if (/\beligib|\bqualification\b|\bqualify\b|\bbeneficiar\b|\bwho can apply\b/.test(q)) return "eligibility";
  if (/\bwho\b|\bdepartment\b|\bministry\b|\bauthority\b|\bissued by\b|\borganisation\b|\borganization\b/.test(q)) return "owner";
  return "general";
}
function uniqueFacts(facts) { const seen = new Set(); return facts.filter(f => { const k = normalize(f.claim || ""); if (!k || seen.has(k)) return false; seen.add(k); return true; }); }
function usedFacts(content, facts) { const c = normalize(content); return facts.filter(f => c.includes(normalize(f.claim).slice(0, Math.min(70, normalize(f.claim).length)))).slice(0, 20); }
function usableFact(s) { const t = cleanSentence(s); return t.length >= 28 && t.length <= 900 && !/table of contents|^contents\b|^page\s*\d|\.\.\.\s*\d+$/i.test(t) && !/^[\d\s.,:;\-–—]+$/.test(t); }
function cleanSentence(s) { return String(s || "").replace(/\s+/g, " ").replace(/\.{3,}/g, " ").trim(); }
function normalize(s) { return cleanSentence(s).toLowerCase(); }
function tokenize(s) { return new Set((normalize(s).match(/[a-z0-9]+/g) || []).filter(x => x.length > 1 && !STOP.has(x))); }
function splitSentences(s) { return cleanSentence(s).split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean); }
function matches(s, re) { re.lastIndex = 0; return [...new Set(String(s).match(re) || [])]; }
function hasDate(s) { return matches(s, DATE_RE).length > 0 || matches(s, YEAR_RE).length > 0; }
function unique(a) { return [...new Set(a)]; }
function shorten(s,n) { const t = cleanSentence(s); return t.length <= n ? t : `${t.slice(0,n-1).trim()}…`; }
function subject(s) { const words = cleanSentence(s).split(" ").filter(w => !STOP.has(w.toLowerCase())); return words.slice(0,5).join(" ") || "this point"; }
function cleanTitle(s) { return cleanSentence(s).replace(/^#+\s*/, "").slice(0,180); }
function headline(c) { return shorten((c.launch[0] || c.benefits[0] || c.facts[0] || { text: c.title }).text, 110); }

export function createProvider() { return new DemoAIProvider(); }
export function listTemplates() { return OUTPUT_TYPES.map(name => ({ name, description: templateDescription(name) })); }
function templateDescription(name) { return ({
  "Citizen Simplifier":"Plain-language explanation organized around meaning, eligibility, dates and benefits.",
  "Officer Brief":"Operational brief with actions, deadlines and review signals.",
  "Executive Summary":"Decision-oriented summary of the source.",
  "FAQ Generator":"Questions derived from actual source facts.",
  "WhatsApp Generator":"Concise mobile-first public message.",
  "Social Media Generator":"Publication-oriented social draft.",
  "Presentation Generator":"Slide-by-slide briefing outline.",
  "Voice Script":"Natural spoken briefing based on source facts.",
  "Press Release":"Formal release structure using source evidence.",
  "SMS / Alert":"Short actionable alert from source evidence.",
  "Infographic Content":"Visual content blocks for dates, amounts and audience.",
  "Detailed Report":"Structured source report.",
  "Key Facts / Statistics":"Separated dates, numbers and key facts.",
  "Action Checklist":"Action items and dates derived from explicit source language."
})[name] || "Source-grounded transformation format."; }
