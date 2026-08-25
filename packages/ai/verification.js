export function extractGeneratedClaims(content) {
  return String(content)
    .split(/\n|(?<=[.!?])\s+/)
    .map((x) => x.replace(/^[-•*\d. QASlide:]+/i, "").trim())
    .filter((x) => x.length > 24 && !/^recommended|speaker note|source|title|key blocks/i.test(x));
}

export function verifyOutput(content, sourceFacts) {
  const generated = extractGeneratedClaims(content);
  const verified = generated.map((claim) => {
    const best = bestSupport(claim, sourceFacts);
    const status = best.score >= 0.42 ? "Supported" : best.score >= 0.22 ? "Partially supported" : "Unsupported";
    return { claim, status, supportScore: Math.round(best.score * 100), evidence: best.fact?.claim || null, citation: best.fact ? { page: best.fact.page, section: best.fact.section } : null };
  });
  const supported = verified.filter((x) => x.status === "Supported").length;
  const partial = verified.filter((x) => x.status === "Partially supported").length;
  const unsupported = verified.filter((x) => x.status === "Unsupported").length;
  const factualityScore = generated.length ? Math.round(((supported + partial * 0.5) / generated.length) * 100) : 100;
  const citationCoverage = generated.length ? Math.round(((content.match(/\[\d+\]/g) || []).length / generated.length) * 100) : 100;
  return { factualityScore, citationCoverage: Math.min(100, citationCoverage), supported, partial, unsupported, claims: verified };
}

function bestSupport(claim, facts) {
  const terms = new Set((claim.toLowerCase().match(/[a-z0-9]+/g) || []).filter((x) => x.length > 3));
  let best = { score: 0, fact: null };
  for (const fact of facts) {
    const hay = fact.claim.toLowerCase();
    const hits = [...terms].filter((t) => hay.includes(t)).length;
    const score = terms.size ? hits / terms.size : 0;
    if (score > best.score) best = { score, fact };
  }
  return best;
}
