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

  const profile = PROFILES[args.length] || PROFILES.Medium;
  result.content = enforceLength(text, facts, profile);
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

    // Preserve normal text/continuation lines exactly. They do not count as
    // an answer unless the FAQ explicitly labels them as one.
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

    // Prefer a fact that has not already been used by another repaired FAQ.
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

function enforceLength(content, facts, profile) {
  let text = String(content).trim();
  const words = countWords(text);

  if (words > profile.max) return trimAtWords(text, profile.max);
  if (words >= profile.min) return text;

  // Add only source-backed facts. No new facts are invented.
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
