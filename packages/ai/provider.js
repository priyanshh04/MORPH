import { OUTPUT_TYPES, CONFIG } from "../shared/config.js";

const FALLBACK = "MORPH could not verify this information in the selected source.";
const STOP = new Set("the and for with from this that have will are was were has into shall should would could about above below where which when what who whom your their there here been being through using under over such not its also than then them they our out use can may per via a an as is of to in on at by or be it if how why does did do these those whose source information document table contents news".split(" "));
const DATE_RE = /\b(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:19|20)\d{2}\b/gi;
const MONEY_RE = /(?:(?:INR|USD|EUR|GBP|₹|\$|€|£)\s?[-+]?\d[\d,]*(?:\.\d+)?(?:\s?(?:crore|lakh|million|billion|thousand|mn|bn))?|\b[-+]?\d[\d,]*(?:\.\d+)?\s?(?:crore|lakh|million|billion|thousand|mn|bn|USD|EUR|GBP|INR|₹|\$|€|£|%)\b)/gi;

const LENGTH_PROFILES = {
  Short: { facts: 3, list: 2, dates: 3, amounts: 3, questions: 3, slides: 2, text: 160 },
  Medium: { facts: 7, list: 4, dates: 5, amounts: 5, questions: 5, slides: 3, text: 280 },
  Detailed: { facts: 12, list: 7, dates: 8, amounts: 8, questions: 8, slides: 5, text: 420 }
};

function lengthProfile(length) {
  return LENGTH_PROFILES[length] || LENGTH_PROFILES.Medium;
}

export class DemoAIProvider {
  constructor() { this.name = "local-source-engine"; this.model = "morph-grounded-v4"; }
  async transform({ document, facts = [], outputType, audience, tone, length, channel, language }) {
    const usable = uniqueFacts(facts).filter(f => usableFact(f.claim));
    if (!usable.length) return { title: `${outputType} for ${audience}`, content: FALLBACK, provider: this.name, model: this.model, citationMap: [] };
    const c = context(document, usable); const content = render(outputType, c, length); const used = usedFacts(content, usable);
    return { title: `${outputType} for ${audience}`, content, provider: this.name, model: this.model, citationMap: used.map((f,i)=>({marker:`[${i+1}]`,factId:f.id,page:f.page||1,section:f.section||"Source",source:f.claim})) };
  }
  async chat({ question = "", evidence = [] }) {
    const q = normalize(question); if (!q || !evidence.length) return { answer:FALLBACK, citations:[] };
    if (CONFIG.llmProvider === "openai" && CONFIG.openaiApiKey) { try { const a = await openaiAnswer(q,evidence); if(a) return a; } catch(e) { console.warn("OpenAI QA fallback:",e.message); } }
    return localAnswer(q,evidence);
  }
}

async function openaiAnswer(question,evidence){
  const source=evidence.map((c,i)=>`[${i+1}] page ${c.page||1}, ${c.section||"Source"}: ${clean(c.text)}`).join("\n");
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${CONFIG.openaiApiKey}`},body:JSON.stringify({model:CONFIG.modelName||"gpt-5.6-luna",instructions:"You are MORPH Ask. Answer strictly from SOURCE EVIDENCE. Never add outside facts. If unsupported, say: The source does not explicitly state this. Preserve names, numbers, units, dates and percentages. For calculations, use only values in the evidence and show the calculation. Cite factual statements with [n] evidence markers.",input:`SOURCE EVIDENCE:\n${source}\n\nQUESTION:\n${question}`,max_output_tokens:500})});
  if(!r.ok) throw new Error(`HTTP ${r.status}`); const d=await r.json(); const text=String(d.output_text||"").trim(); if(!text) return null;
  const nums=[...new Set([...text.matchAll(/\[(\d+)\]/g)].map(m=>+m[1]))].filter(n=>n>=1&&n<=evidence.length); if(!nums.length)return null;
  return {answer:text,citations:nums.map(n=>{const c=evidence[n-1];return{marker:`[${n}]`,page:c.page||1,section:c.section||"Source",source:clean(c.text)}})};
}

function localAnswer(q,evidence){
  const candidates=evidence.flatMap((chunk,ci)=>split(chunk.text).map((text,si)=>({text:clean(text),chunk,ci,si})));
  const intent=intentOf(q); const ranked=candidates.map(x=>({...x,score:score(x.text,q,intent)})).filter(x=>x.score>=7&&!noise(x.text)).sort((a,b)=>b.score-a.score||a.ci-b.ci||a.si-b.si);
  if(!ranked.length)return{answer:FALLBACK,citations:[]};
  if(intent==="count") { const direct=ranked.find(x=>explicitCount(x.text,q)); if(direct)return one(direct); }
  if(intent==="sum") { const calc=sumAnswer(ranked,q); if(calc)return calc; }
  return one(ranked[0]);
}
function one(x){return{answer:`${x.text} [${x.ci+1}]`,citations:[{marker:`[${x.ci+1}]`,page:x.chunk.page||1,section:x.chunk.section||"Source",source:x.text}]};}
function explicitCount(t,q){if(!/\b(?:how many|total number|number of|count of|count)\b/.test(q))return false;if(!/\b(?:there are|total(?:ly)?|number of|count(?:s)?|consists of|comprises|includes)\b/i.test(t))return false;const terms=subjectTerms(q);return !terms.length||terms.some(v=>normalize(t).includes(v));}
function sumAnswer(ranked,q){const terms=subjectTerms(q);const vals=[];for(const x of ranked.slice(0,10)){const t=normalize(x.text);if(terms.length&&!terms.some(v=>t.includes(v)))continue;for(const raw of x.text.match(MONEY_RE)||[]){const n=parseFloat(raw.replace(/[^0-9.-]/g,""));if(Number.isFinite(n))vals.push({n,raw,x});}}const seen=new Set(),u=vals.filter(v=>{const k=v.n+"|"+v.x.text;if(seen.has(k))return false;seen.add(k);return true;});if(u.length<2)return null;const total=u.reduce((s,v)=>s+v.n,0);return{answer:`Calculated total: ${total.toLocaleString("en-US")}. Values used: ${u.map(v=>v.raw).join(", ")}. ${u.map(v=>`[${v.x.ci+1}]`).join(" ")}`,citations:u.slice(0,6).map(v=>({marker:`[${v.x.ci+1}]`,page:v.x.chunk.page||1,section:v.x.chunk.section||"Source",source:v.x.text}))};}

function intentOf(q){
  if(/\bhow many\b|\btotal number\b|\bnumber of\b|\bcount of\b/.test(q))return"count";
  if(/\b(?:total|sum|combined|altogether|aggregate)\b/.test(q))return"sum";
  if(/\b(?:rating|score|stars?)\b/.test(q))return"rating";
  if(/\b(?:price|cost|selling price|unit price)\b/.test(q))return"price";
  if(/\b(?:revenue|sales|profit|income|amount|budget|value|spend|expense)\b/.test(q))return"amount";
  if(/\b(?:when|date|year|released|release|launched|started|introduced|announced|premiered)\b/.test(q))return"date";
  if(/\b(?:deadline|last date|closing|close|due|apply|submit)\b/.test(q))return"deadline";
  if(/\b(?:eligible|eligibility|qualif|beneficiar|audience|customer|buyer|who can)\b/.test(q))return"eligibility";
  if(/\b(?:who|director|author|creator|producer|seller|brand|company|department|ministry|owner)\b/.test(q))return"owner";
  return"general";
}
function score(text,q,intent){const t=normalize(text);const terms=subjectTerms(q);let s=0;for(const v of terms)s+=t.split(/\s+/).includes(v)?5:t.includes(v)?1:0;const k={date:/date|year|released|release|launched|launch|started|introduced|announced|premiered/i,amount:/revenue|sales|profit|income|amount|budget|value|spend|expense|money/i,price:/price|cost|selling|unit/i,rating:/rating|score|stars/i,deadline:/deadline|closing|close|last date|due|submit|apply/i,eligibility:/eligible|eligibility|qualif|beneficiar|audience|customer|buyer|who can/i,owner:/director|author|creator|producer|seller|brand|company|department|ministry|owner/i};if(k[intent]?.test(text))s+=14;if(intent==="count"&&/\b(?:total|number|count|there are|consists|comprises|includes)\b/i.test(text))s+=14;if(intent==="sum"&&/\b(?:total|sum|combined|altogether|aggregate)\b/i.test(text))s+=14;if(intent==="date"&&DATE_RE.test(text))s+=12;if((intent==="amount"||intent==="price")&&MONEY_RE.test(text))s+=10;DATE_RE.lastIndex=0;MONEY_RE.lastIndex=0;if(/table of contents|^contents\b|^page\s*\d/i.test(text))s-=30;return s;}
function subjectTerms(q){return [...tokens(q)].filter(x=>x.length>2&&!/^(how|many|much|total|number|count|what|is|are|the|of|for|in|on|from|with|does|did|do|can|could|would|please|give|tell|me)$/.test(x));}
function context(document,facts){const all=facts.map((f,i)=>({...f,marker:`[${i+1}]`,text:clean(f.claim)}));return{title:cleanTitle(document.title||"Source document"),facts:all,dates:unique(all.flatMap(f=>matches(f.text,DATE_RE))),amounts:unique(all.flatMap(f=>matches(f.text,MONEY_RE))),launch:all.filter(f=>/launched|released|premiered|introduced|started|announced/i.test(f.text)),deadlines:all.filter(f=>/deadline|closing|close|last date|submit|apply|due|by\b/i.test(f.text)),eligibility:all.filter(f=>/eligible|eligibility|qualif|beneficiar|applicant|customer|buyer|audience/i.test(f.text)),benefits:all.filter(f=>/benefit|support|grant|assistance|fund|allocation|subsid|receive|financial|revenue|sales|profit|rating|review|price|cost/i.test(f.text)),actions:all.filter(f=>/must|shall|required|apply|submit|register|contact|publish|complete|verify|report|buy|purchase|order|return/i.test(f.text))};}
function render(type,c,length){
  const profile=lengthProfile(length);
  const list=(a,n=profile.list,p="• ")=>a.length?a.slice(0,n).map(f=>`${p}${f.text} ${f.marker}`).join("\n"):"• Not explicitly stated in the analyzed source.";
  const dates=c.dates.length?c.dates.slice(0,profile.dates).map(x=>`• ${x}`).join("\n"):"• No explicit date found.";
  const amounts=c.amounts.length?c.amounts.slice(0,profile.amounts).map(x=>`• ${x}`).join("\n"):"• No explicit amount found.";
  const p=c.facts.slice(0,profile.facts);
  switch(type){
    case"Citizen Simplifier":return`WHAT THIS MEANS\n${c.title}\n\nKEY POINTS\n${list(p)}\n\nAUDIENCE\n${list(c.eligibility)}\n\nBENEFITS / RESULTS\n${list(c.benefits)}\n\nDATES\n${dates}\n\nWHAT TO DO\n${list(c.actions)}`;
    case"Officer Brief":return`OFFICER BRIEF\n${c.title}\n\nSITUATION / RELEASE\n${list(c.launch.length?c.launch:p,profile.list)}\n\nKEY FACTS\n${list(p)}\n\nREQUIREMENTS\n${list(c.actions)}\n\nDATES / DEADLINES\n${dates}`;
    case"Executive Summary":return`EXECUTIVE SUMMARY\n${c.title}\n\nCONTEXT\n${list(p)}\n\nKEY FACTS\n${list(p)}\n\nNUMERIC / FINANCIAL FIGURES\n${amounts}\n\nKEY DATES\n${dates}`;
    case"FAQ Generator":return faq(c,profile);
    case"WhatsApp Generator":return`SOURCE UPDATE — ${c.title}\n\n${list(p)}\n\nAUDIENCE\n${list(c.eligibility)}\n\nDATES\n${dates}`;
    case"Social Media Generator":return`SOCIAL MEDIA DRAFT\n${c.title}\n\n${list(p)}\n\nWHY IT MATTERS\n${list(c.benefits.length?c.benefits:p)}\n\nDATE / DEADLINE\n${dates}`;
    case"Presentation Generator":return slides(c,profile);
    case"Voice Script":return`VOICE SCRIPT\n\nThis briefing covers ${c.title}.\n\n${list(p,profile.list,"")}\n\nAUDIENCE / RESULT\n${list(c.eligibility.length?c.eligibility:c.benefits,profile.list,"")}\n\nIMPORTANT DATE\n${c.dates[0]||"No explicit date stated."}`;
    case"Press Release":return`PRESS RELEASE DRAFT\n${c.title}\n\nHEADLINE\n${shorten((c.launch[0]||c.facts[0]||{text:c.title}).text,profile.text)}\n\nDETAILS\n${list(p)}\n\nDATES\n${dates}`;
    case"SMS / Alert":return`SMS / ALERT\n${shorten((c.deadlines[0]||c.actions[0]||c.launch[0]||c.facts[0]||{text:FALLBACK}).text,profile.text)}`;
    case"Infographic Content":return`INFOGRAPHIC CONTENT\n${c.title}\n\nKEY FACTS\n${list(p)}\n\nNUMBERS / MONEY\n${amounts}\n\nDATES\n${dates}`;
    case"Detailed Report":return`DETAILED SOURCE REPORT\n${c.title}\n\nOVERVIEW\n${list(p)}\n\nAUDIENCE\n${list(c.eligibility)}\n\nRESULTS / FINANCIALS\n${list(c.benefits)}\n${amounts}\n\nDATES / DEADLINES\n${dates}\n\nACTIONS\n${list(c.actions)}\n\nSOURCE LIMITATION\nNo absent facts are inferred.`;
    case"Key Facts / Statistics":return`KEY FACTS & STATISTICS\n${c.title}\n\nNUMBERS / AMOUNTS\n${amounts}\n\nDATES / YEARS\n${dates}\n\nKEY FACTS\n${list(p)}`;
    case"Action Checklist":return`ACTION CHECKLIST\n${c.title}\n\n${list(c.actions.length?c.actions:p,profile.list,"☐ ")}\n\nDATES\n${dates}`;
    default:return`SOURCE-GROUNDED OUTPUT\n${c.title}\n\n${list(p)}`;
  }
}
function faq(c,profile){const a=[];const add=(q,f)=>f&&a.length<profile.questions&&a.push(`Q${a.length+1}. ${q}\nA. ${f.text} ${f.marker}`);add("When was it launched or released?",c.launch.find(f=>hasDate(f.text))||c.launch[0]);add("Who is the audience or affected group?",c.eligibility[0]);add("What result, benefit or feature is described?",c.benefits[0]);add("What price, amount, rating or metric is stated?",c.facts.find(f=>matches(f.text,MONEY_RE).length||/rating|score|price|sales|revenue|profit/i.test(f.text)));for(const f of c.facts)add(`What does the source say about ${subject(f.text)}?`,f);return`FREQUENTLY ASKED QUESTIONS\n${c.title}\n\n${a.length?a.join("\n\n"):FALLBACK}`;}
function slides(c,profile){const groups=[["Key facts",c.facts.slice(0,profile.slides)],["Audience",c.eligibility.slice(0,profile.slides)],["Results / figures",c.benefits.slice(0,profile.slides)],["Dates",c.deadlines.length?c.deadlines.slice(0,profile.slides):c.launch.slice(0,profile.slides)],["Actions",c.actions.slice(0,profile.slides)]];return`PRESENTATION OUTLINE\n\n${groups.filter(x=>x[1].length).map((x,i)=>`Slide ${i+1} — ${x[0]}\n${x[1].map(f=>`• ${f.text} ${f.marker}`).join("\n")}`).join("\n\n")}`;}
function uniqueFacts(a){const s=new Set();return a.filter(f=>{const k=normalize(f.claim||"");if(!k||s.has(k))return false;s.add(k);return true;});}
function usedFacts(content,facts){const c=normalize(content);return facts.filter(f=>c.includes(normalize(f.claim).slice(0,Math.min(70,normalize(f.claim).length)))).slice(0,20);}
function usableFact(s){const t=clean(s);return t.length>=20&&t.length<=1200&&!noise(t)&&!/^\d[\s.,:;\-–—]+$/.test(t);}
function clean(s){return String(s||"").replace(/\s+/g," ").replace(/\.{3,}/g," ").trim();}
function normalize(s){return clean(s).toLowerCase();}
function tokens(s){return new Set((normalize(s).match(/[a-z0-9]+/g)||[]).filter(x=>x.length>1&&!STOP.has(x)));}
function split(s){return clean(s).split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean);}
function matches(s,re){re.lastIndex=0;return[...new Set(String(s).match(re)||[])];}
function hasDate(s){return matches(s,DATE_RE).length>0;}
function unique(a){return[...new Set(a)];}
function noise(t){return /^(?:page|contents|table of contents)\b/i.test(t)||/^\d+[\s.]+(?:contents|page)\b/i.test(t);}
function shorten(s,n){const t=clean(s);return t.length<=n?t:`${t.slice(0,n-1).trim()}…`;}
function subject(s){return clean(s).split(" ").filter(w=>!STOP.has(w.toLowerCase())).slice(0,5).join(" ")||"this point";}
function cleanTitle(s){return clean(s).replace(/^#+\s*/,"").slice(0,180);}

export function createProvider(){return new DemoAIProvider();}
export function listTemplates(){return OUTPUT_TYPES.map(name=>({name,description:"Source-grounded transformation format."}));}
