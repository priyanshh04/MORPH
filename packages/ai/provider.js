import { OUTPUT_TYPES } from "../shared/config.js";
import { questionIntent } from "./document.js";

const HINDI_HINT = {
  "Citizen Simplifier": "Yeh suchna nagrikon ke liye saral bhasha mein hai.",
  "WhatsApp Generator": "Namaste, kripya is mahatvapurn suchna par dhyan dein.",
  "SMS / Alert": "Mahatvapurn suchna:"
};

export class DemoAIProvider {
  constructor() {
    this.name = "demo";
  }

  async transform({ document, facts, chunks, outputType, audience, tone, length, channel, language }) {
    const selectedFacts = facts.slice(0, length === "Short" ? 4 : length === "Detailed" ? 10 : 7);
    const cite = (i) => `[${(i % Math.max(1, selectedFacts.length)) + 1}]`;
    const heading = `${outputType} for ${audience}`;
    let body = "";
    if (outputType === "FAQ Generator") {
      body = selectedFacts.slice(0, 5).map((f, i) => `Q${i + 1}. What should the ${audience.toLowerCase()} know?\nA. ${plain(f.claim)} ${cite(i)}`).join("\n\n");
    } else if (outputType === "Officer Brief") {
      body = `Issue\n${plain(selectedFacts[0]?.claim || document.title)} ${cite(0)}\n\nKey facts\n${selectedFacts.map((f, i) => `- ${plain(f.claim)} ${cite(i)}`).join("\n")}\n\nDecisions required\n- Confirm department owner, approval timeline, and public communication channel.\n\nRisks\n- Delay or unclear eligibility communication may reduce compliance.`;
    } else if (outputType === "Presentation Generator") {
      body = selectedFacts.slice(0, 5).map((f, i) => `Slide ${i + 1}: ${shortTitle(f.claim)}\n- ${plain(f.claim)} ${cite(i)}\nSpeaker note: Explain the source-backed implication for ${audience.toLowerCase()}.`).join("\n\n");
    } else if (outputType === "WhatsApp Generator") {
      body = `*${document.title}*\n\n${selectedFacts.slice(0, 4).map((f, i) => `• ${plain(f.claim)} ${cite(i)}`).join("\n")}\n\nPlease verify details through the official department channel.`;
    } else if (outputType === "SMS / Alert") {
      body = `${document.title}: ${plain(selectedFacts[0]?.claim || "Important update available")} ${cite(0)}`.slice(0, 155);
    } else if (outputType === "Infographic Content") {
      body = `Title: ${document.title}\nPrimary message: ${plain(selectedFacts[0]?.claim || document.title)} ${cite(0)}\nKey blocks:\n${selectedFacts.slice(1, 5).map((f, i) => `- Block ${i + 1}: ${plain(f.claim)} ${cite(i + 1)}`).join("\n")}\nCall to action: Check eligibility, deadline, and required action before publishing.`;
    } else {
      body = `${heading}\n\n${selectedFacts.map((f, i) => `${i + 1}. ${plain(f.claim)} ${cite(i)}`).join("\n")}\n\nRecommended communication objective: deliver accurate, source-grounded information in a ${tone.toLowerCase()} tone for ${channel}.`;
    }
    if (language !== "English") {
      body = `${HINDI_HINT[outputType] || "Translated review draft."}\n\n[${language} review required]\n${body}`;
    }
    return {
      title: heading,
      content: body,
      provider: this.name,
      model: "deterministic-demo-provider",
      citationMap: selectedFacts.map((f, i) => ({ marker: `[${i + 1}]`, factId: f.id, page: f.page, section: f.section, source: f.claim }))
    };
  }

  async chat({ question, evidence }) {
    const intent = questionIntent(question);
    const candidates = evidence.flatMap((chunk) => splitSentences(chunk.text).map((text) => ({
      ...chunk,
      text,
      score: sentenceScore(text, chunk, question, intent)
    })));

    const ranked = candidates
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index);

    if (!ranked.length) {
      return {
        answer: "I couldn't find this information in the provided source. The source does not contain enough evidence to answer this question reliably.",
        citations: []
      };
    }

    const selected = selectAnswerSentences(ranked, intent);
    if (!selected.length) {
      return {
        answer: "I couldn't verify this information from the provided source.",
        citations: []
      };
    }

    const answer = selected.map((x, i) => `${plain(x.text)} [${i + 1}]`).join(" ");
    return {
      answer,
      citations: selected.map((x, i) => ({
        marker: `[${i + 1}]`,
        page: x.page,
        section: x.section,
        source: x.text
      }))
    };
  }
}

function splitSentences(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\s*[•·]\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

function sentenceScore(text, chunk, question, intent) {
  const q = String(question || "").toLowerCase();
  const hay = text.toLowerCase();
  let score = Number(chunk.score || 0);

  const intentPatterns = {
    launch: [/\blaunch(?:ed|es|ing)?\b/, /\bintroduc(?:ed|es|ing)?\b/, /\bstart(?:ed|s)?\b/, /\bcommenc(?:ed|es|ing)?\b/, /\b20\d{2}\b/, /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/],
    eligibility: [/\beligib(?:le|ility)\b/, /\bqualif(?:y|ied|ication)\b/, /\bapplicable\b/, /\bwho can\b/, /\bhouseholds?\b/, /\bfarmers?\b/, /\bstudents?\b/],
    benefits: [/\bbenefit(?:s)?\b/, /\bassistance\b/, /\bsupport\b/, /\bprovid(?:e|es|ed|ing)\b/, /\breceive\b/, /\bentitled\b/, /\bgrant\b/, /\bsubsidy\b/],
    count: [/\btotal\b/, /\bnumber\b/, /\bcount\b/, /\bhow many\b/, /\b\d+\s+(?:schemes?|program(?:me)?s?)\b/],
    deadline: [/\bdeadline\b/, /\bclos(?:e|es|ed|ing)\b/, /\blast date\b/, /\bby \d\b/, /\bexpires?\b/],
    amount: [/\bINR\b/, /₹/, /\bcrore\b/, /\blakh\b/, /\bbudget\b/, /\boutlay\b/, /\bamount\b/],
    location: [/\bdistrict\b/, /\bstate\b/, /\bthrough\b/, /\bavailable\b/, /\blocated\b/],
    requirement: [/\brequired\b/, /\brequirements?\b/, /\bdocuments?\b/, /\bmust\b/, /\bapply\b/],
    general: []
  };

  for (const pattern of intentPatterns[intent] || []) if (pattern.test(hay)) score += 10;
  if (chunk.section && intentSection(intent) === chunk.section) score += 18;
  if (q.length > 8 && hay.includes(q)) score += 25;

  const questionTerms = q.match(/[a-z0-9]+/g) || [];
  for (const term of questionTerms) {
    if (term.length > 2 && hay.includes(term)) score += 2;
  }
  return score;
}

function intentSection(intent) {
  return {
    eligibility: "Eligibility",
    benefits: "Benefits",
    deadline: "Deadlines",
    amount: "Financial Details"
  }[intent] || "";
}

function selectAnswerSentences(ranked, intent) {
  const top = ranked[0];
  if (!top) return [];

  // For factual lookup questions, return only the strongest source sentence(s).
  // This prevents an entire unrelated paragraph/chunk from becoming the answer.
  if (["launch", "eligibility", "benefits", "deadline", "amount", "location", "requirement"].includes(intent)) {
    const threshold = Math.max(12, top.score - 8);
    return ranked.filter((x) => x.score >= threshold).slice(0, 2);
  }

  if (intent === "count") {
    const explicit = ranked.filter((x) => /\b(total|number|count|how many)\b.*\b\d+\b|\b\d+\s+(?:schemes?|program(?:me)?s?)\b/i.test(x.text));
    if (explicit.length) return explicit.slice(0, 2);
    return ranked.filter((x) => /\b(total|number|count|how many)\b/i.test(x.text)).slice(0, 2);
  }

  return ranked.slice(0, 2);
}

export function createProvider() {
  return new DemoAIProvider();
}

export function listTemplates() {
  return OUTPUT_TYPES.map((name) => ({ name, description: templateDescription(name) }));
}

function templateDescription(name) {
  return {
    "Citizen Simplifier": "Plain-language public explanation with actions and deadlines.",
    "Officer Brief": "Issue, key facts, decisions, actions, deadlines, risks.",
    "Executive Summary": "Dense leadership-ready summary.",
    "FAQ Generator": "Grounded questions and answers.",
    "WhatsApp Generator": "Mobile-first short message.",
    "Social Media Generator": "Publication-ready social content.",
    "Presentation Generator": "Slide titles, bullets, speaker notes.",
    "Voice Script": "Natural narration script.",
    "Press Release": "Formal media release.",
    "SMS / Alert": "Extremely concise alert.",
    "Infographic Content": "Structured visual blocks and CTA."
  }[name] || "Source-grounded transformation format.";
}

function plain(s = "") {
  return s.replace(/\s*\[\d+\]\s*/g, "").trim();
}

function shortTitle(s = "") {
  return plain(s).split(" ").slice(0, 7).join(" ");
}
