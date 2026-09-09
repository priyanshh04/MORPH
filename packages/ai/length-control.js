import { DemoAIProvider } from "./provider.js";

// Enforce meaningful separation between Short / Medium / Detailed outputs.
// The existing provider changes how many facts are selected, but some documents
// contain too few facts for that alone to create a visible length difference.
const originalTransform = DemoAIProvider.prototype.transform;

const PROFILES = {
  Short: { min: 70, max: 140 },
  Medium: { min: 160, max: 260 },
  Detailed: { min: 300, max: 430 }
};

DemoAIProvider.prototype.transform = async function (args) {
  const result = await originalTransform.call(this, args);
  if (!result?.content) return result;

  const facts = args.facts || [];
  let text = String(result.content).trim();

  // FAQ output must contain an answer for every generated question.
  // If the base generator leaves a question unanswered, select the most
  // relevant source-backed fact instead of inventing an answer.
  if (args.outputType === "FAQ Generator") {
    text = repairFaqAnswers(text, facts);
  }

  // Audience, tone and channel are transformation controls, not decorative
  // UI fields. Adapt the source-grounded result so each choice has a visible
  // and relevant effect while keeping every factual claim tied to the source.
  text = adaptOutput(text, args, facts);

  const profile = PROFILES[args.length] || PROFILES.Medium;
  result.content = enforceLength(text, facts, profile);
  result.title = `${args.outputType} for ${args.audience || "Citizen"}`;
  return result;
};

function repairFaqAnswers(content, facts) {
  const lines = String(content).split(/\n/);
  const out = [];
  let pendingQuestion = null;
  let answerSeen = false;
  const usedFacts = new Set();

  const flushQuestion = () => {
    if (pendingQuestion && !answerSeen) {
      out.push(answerForQuestion(pendingQuestion, facts, usedFacts));
    }
    pendingQuestion = null;
    answerSeen = false;
  };

  for (const line of lines) {
    const q = line.match(/^\s*Q\d+\.\s*(.+?)\s*$/i);
    const a = line.match(/^\s*A(?:\d+)?[.:]\s*(.+?)\s*$/i);

    if (q) {
      flushQuestion();
      pendingQuestion = q[1];
      out.push(line);
      continue;
    }

    if (a) {
      answerSeen = true;
      markFactCitations(a[1], facts, usedFacts);
      out.push(line);
      continue;
    }

    out.push(line);
  }

  flushQuestion();
  return out.join("\n");
}

function answerForQuestion(question, facts, usedFacts) {
  const qTerms = meaningfulTerms(question);
  let best = null;
  let bestScore = 0;

  facts.forEach((fact, index) => {
    const claim = String(fact?.claim || "").trim();
    if (!claim || claim.length < 8) return;

    const terms = meaningfulTerms(claim);
    let score = 0;
    for (const term of qTerms) {
      if (terms.includes(term)) score += 4;
      else if (terms.some(t => t.includes(term) || term.includes(t))) score += 1;
    }

    if (!usedFacts.has(index)) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = { claim, index };
    }
  });

  if (!best || bestScore <= 0) {
    return "A. The source does not explicitly state this.";
  }

  usedFacts.add(best.index);
  return `A. ${best.claim} [${best.index + 1}]`;
}

function markFactCitations(answer, facts, usedFacts) {
  const matches = [...String(answer).matchAll(/\[(\d+)\]/g)];
  for (const match of matches) {
    const index = Number(match[1]) - 1;
    if (index >= 0 && index < facts.length) usedFacts.add(index);
  }
}

function meaningfulTerms(text) {
  const stop = new Set([
    "the", "and", "for", "with", "from", "this", "that", "what", "when",
    "where", "which", "who", "whom", "how", "does", "did", "are", "is",
    "was", "were", "has", "have", "had", "can", "could", "would", "should",
    "about", "into", "their", "there", "here", "your", "they", "them", "our",
    "you", "not", "its", "also", "than", "then", "these", "those", "source",
    "described", "describe", "provided", "mentioned", "question", "answer"
  ]);

  return [...new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 2 && !stop.has(word))
  )];
}

function adaptOutput(content, args, facts) {
  const audience = String(args.audience || "Citizen");
  const tone = String(args.tone || "Professional");
  const channel = String(args.channel || "Website");
  const outputType = String(args.outputType || "Output");

  const ranked = rankFactsForAudience(facts, audience);
  const selected = ranked.slice(0, audienceFactLimit(audience));
  const sourceFacts = selected.length
    ? selected.map((fact, index) => `• ${fact.claim} [${fact.index + 1}]`).join("\n")
    : "• The source does not explicitly state additional audience-specific details.";

  const toneLead = toneIntroduction(tone, audience, outputType);
  const audienceSection = audienceHeading(audience);

  // Keep the original generator output intact as the core artifact. The
  // controlled additions below change emphasis and presentation using only
  // facts already extracted from the source.
  let adapted = `${toneLead}\n\n${audienceSection}\n${sourceFacts}\n\n${content}`;

  if (channel === "WhatsApp") {
    adapted = `MORPH UPDATE — ${audience}\n${toneLead}\n\n${compactForChannel(adapted)}`;
  } else if (channel === "Email") {
    adapted = `SUBJECT: ${emailSubject(outputType, audience)}\n\nHello,\n\n${adapted}\n\nRegards,\nMORPH`;
  } else if (channel === "Social Media") {
    adapted = `SOCIAL MEDIA BRIEF\n${toneLead}\n\n${sourceFacts}\n\n${content}`;
  } else if (channel === "SMS") {
    adapted = `MORPH ALERT — ${shortChannelText(toneLead, sourceFacts, content)}`;
  } else if (channel === "Presentation") {
    adapted = `SLIDE CONTENT — ${audience}\n\n${audienceSection}\n${sourceFacts}\n\n${content}`;
  } else if (channel === "Report") {
    adapted = `REPORTING VIEW — ${audience}\n\n${audienceSection}\n${sourceFacts}\n\n${content}`;
  } else if (channel === "Voice") {
    adapted = `VOICE BRIEF — ${audience}\n\n${toneLead}\n\n${spoken(adapted)}`;
  }

  return adapted;
}

function rankFactsForAudience(facts, audience) {
  const rules = {
    Citizen: ["benefit", "eligible", "beneficiar", "apply", "support", "receive", "deadline", "what"],
    Officer: ["require", "must", "shall", "deadline", "implement", "verify", "submit", "report"],
    Executive: ["revenue", "sales", "profit", "budget", "amount", "result", "impact", "total", "growth"],
    Student: ["education", "learn", "definition", "meaning", "example", "concept", "class", "student"],
    Media: ["launch", "released", "announced", "headline", "date", "event", "company", "result"],
    "General Public": ["overview", "benefit", "impact", "support", "public", "result", "important", "deadline"]
  };
  const terms = rules[audience] || rules.Citizen;

  return facts
    .map((fact, index) => {
      const claim = String(fact?.claim || "");
      const lower = claim.toLowerCase();
      let score = 0;
      for (const term of terms) if (lower.includes(term)) score += 3;
      score += Math.max(0, 2 - index * 0.02);
      return { fact, index, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => ({ ...x.fact, index: x.index }));
}

function audienceFactLimit(audience) {
  return {
    Citizen: 5,
    Officer: 6,
    Executive: 5,
    Student: 5,
    Media: 5,
    "General Public": 5
  }[audience] || 5;
}

function audienceHeading(audience) {
  return {
    Citizen: "CITIZEN FOCUS — practical benefits, eligibility and next steps",
    Officer: "OFFICER FOCUS — requirements, implementation and deadlines",
    Executive: "EXECUTIVE FOCUS — outcomes, metrics and material figures",
    Student: "STUDENT FOCUS — concepts, facts and learning points",
    Media: "MEDIA FOCUS — notable facts, events, dates and results",
    "General Public": "PUBLIC FOCUS — what it means, why it matters and key facts"
  }[audience] || `AUDIENCE FOCUS — ${audience}`;
}

function toneIntroduction(tone, audience, outputType) {
  return {
    Formal: `Formal ${outputType} prepared for ${audience}, using source-grounded language and precise wording.`,
    Simple: `Here is a simple, easy-to-follow ${outputType.toLowerCase()} for ${audience}.`,
    Professional: `Professional ${outputType.toLowerCase()} tailored for ${audience}, with the source facts kept clear and actionable.`,
    Friendly: `Here is a friendly, approachable ${outputType.toLowerCase()} for ${audience}, while keeping the source facts unchanged.`,
    Urgent: `Important ${outputType.toLowerCase()} for ${audience}: review the source-backed points and any stated deadlines promptly.`,
    Educational: `Educational ${outputType.toLowerCase()} for ${audience}, highlighting the source-backed information most useful for understanding the topic.`
  }[tone] || `Source-grounded ${outputType.toLowerCase()} for ${audience}.`;
}

function compactForChannel(text) {
  return text
    .split(/\n+/)
    .filter(Boolean)
    .map(line => line.replace(/^\s+/, "").trim())
    .join("\n");
}

function emailSubject(outputType, audience) {
  return `${outputType} — ${audience} source update`;
}

function shortChannelText(lead, sourceFacts, content) {
  const combined = `${lead} ${sourceFacts} ${content}`;
  return combined.split(/\s+/).slice(0, 75).join(" ") + (combined.split(/\s+/).length > 75 ? " …" : "");
}

function spoken(text) {
  return String(text)
    .replace(/\b[A-Z][A-Z /—-]{3,}\b/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function enforceLength(content, facts, profile) {
  let text = String(content).trim();
  const words = countWords(text);

  if (words > profile.max) return trimAtWords(text, profile.max);
  if (words >= profile.min) return text;

  const existing = text.toLowerCase();
  const additions = [];
  for (let i = 0; i < facts.length && countWords(text + "\n" + additions.join("\n")) < profile.min; i++) {
    const claim = String(facts[i]?.claim || "").trim();
    if (!claim || claim.length < 8 || existing.includes(claim.toLowerCase())) continue;
    additions.push(`• ${claim} [${i + 1}]`);
  }

  if (additions.length) {
    const heading = "\n\nADDITIONAL SOURCE DETAILS\n";
    text += heading + additions.join("\n");
  }

  return countWords(text) > profile.max ? trimAtWords(text, profile.max) : text;
}

function countWords(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function trimAtWords(text, maxWords) {
  const lines = String(text).trim().split(/\n+/);
  const kept = [];
  let total = 0;

  for (const line of lines) {
    const n = countWords(line);
    if (!n) continue;
    if (total + n <= maxWords) {
      kept.push(line);
      total += n;
      continue;
    }
    if (!kept.length) return String(text).trim().split(/\s+/).slice(0, maxWords).join(" ") + " …";
    break;
  }

  return kept.join("\n").trim();
}
