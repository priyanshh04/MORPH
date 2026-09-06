import { id, now } from "../database/store.js";

const NUMBER_RE = /(?:INR|₹)?\s?\d[\d,]*(?:\.\d+)?\s?(?:crore|lakh|%|days|casualties|PM|AM)?/gi;
const DATE_RE = /\b\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}\b|\b20\d{2}\b/g;

export function detectConflicts(docs, facts) {
  const conflicts = [];
  const byKeyword = new Map();
  for (const fact of facts) {
    const key = topicKey(fact.claim);
    if (!byKeyword.has(key)) byKeyword.set(key, []);
    byKeyword.get(key).push(fact);
  }
  for (const [topic, group] of byKeyword.entries()) {
    const numbers = [...new Set(group.flatMap((f) => f.claim.match(NUMBER_RE) || []).map((x) => x.trim()))];
    const dates = [...new Set(group.flatMap((f) => f.claim.match(DATE_RE) || []))];
    if (group.length > 1 && (numbers.length > 1 || dates.length > 1)) {
      conflicts.push({
        id: id("conflict"),
        topic,
        status: "CONFLICT DETECTED",
        values: [...numbers, ...dates],
        sources: group.map((f) => ({ documentId: f.documentId, claim: f.claim, page: f.page, section: f.section })),
        confidence: "LOW",
        reason: "Source facts with similar topic mention different dates or numbers.",
        createdAt: now()
      });
    }
  }
  return conflicts;
}

export function confidenceForClaim(claim, evidence = []) {
  const directness = evidence[0]?.score ? Math.min(1, evidence[0].score / 4) : 0.35;
  const agreement = evidence.length > 1 ? 0.8 : 0.55;
  const authority = /department|ministry|authority|notification|order/i.test(evidence.map((e) => e.text).join(" ")) ? 0.8 : 0.55;
  const score = Math.round(((directness * 0.45) + (agreement * 0.25) + (authority * 0.2) + 0.1) * 100);
  return {
    id: id("conf"),
    claim,
    score,
    level: score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW",
    formula: "45% retrieval directness + 25% source agreement + 20% source authority signal + 10% baseline traceability",
    inputs: { directness, agreement, authority },
    createdAt: now()
  };
}

export function historicalEchoes(document, allDocs) {
  const current = terms(document.text);
  return allDocs
    .filter((d) => d.id !== document.id)
    .map((d) => {
      const shared = [...current].filter((t) => terms(d.text).has(t));
      return {
        id: id("echo"),
        documentId: document.id,
        relatedDocumentId: d.id,
        title: d.title,
        sharedSignals: shared.slice(0, 8),
        confidence: shared.length >= 5 ? "MEDIUM" : "LOW",
        relationship: "Potential historical relationship",
        evidence: `Shared terms: ${shared.slice(0, 5).join(", ")}`,
        createdAt: now()
      };
    })
    .filter((e) => e.sharedSignals.length >= 2)
    .slice(0, 6);
}

export function biasNeutralize(text) {
  const loaded = ["shocking", "massive", "disastrous", "reckless", "unbelievable", "obviously", "clearly"];
  let neutral = String(text || "");
  const removed = [];
  for (const word of loaded) {
    const re = new RegExp(`\\b${word}\\b`, "gi");
    if (re.test(neutral)) removed.push(word);
    neutral = neutral.replace(re, "");
  }
  return {
    factualClaims: neutral.split(/[.!?]\s+/).filter((x) => x.length > 20).slice(0, 8),
    attributedOpinions: (text.match(/(?:said|claimed|alleged|stated)[^.]+/gi) || []).slice(0, 5),
    loadedLanguage: removed,
    speculation: (text.match(/(?:may|might|could|possibly|likely)[^.]+/gi) || []).slice(0, 5),
    neutralized: neutral.replace(/\s{2,}/g, " ").trim(),
    caveat: "Neutralization reduces loaded framing; it is not a claim of objective truth."
  };
}

export function oracleScenario(document, assumptions = "") {
  const base = (document.intelligence?.risks || [document.text]).slice(0, 3).join(" ");
  return {
    label: "SCENARIO ANALYSIS - NOT FACTUAL PREDICTION",
    assumptions: assumptions || "Assumes source document remains the authorized evidence base and no external situation change is introduced.",
    scenarios: [
      { name: "Best case", confidence: "MEDIUM", development: "Stakeholders act within the stated timelines and communication reduces ambiguity.", evidence: base, preparation: "Publish concise guidance and monitor acknowledgements." },
      { name: "Baseline case", confidence: "MEDIUM", development: "Most users follow the guidance, with some clarification requests.", evidence: base, preparation: "Prepare FAQ, helpline response, and officer brief." },
      { name: "Worst case", confidence: "LOW", development: "Confusion or delayed action increases operational load.", evidence: base, preparation: "Escalate alerts, redacted public notices, and review cadence." }
    ]
  };
}

function topicKey(text) {
  return [...terms(text)].slice(0, 3).join("-");
}

function terms(text) {
  return new Set((String(text || "").toLowerCase().match(/[a-z]{5,}/g) || []).filter((x) => !["department", "section", "source", "document"].includes(x)));
}
