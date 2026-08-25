import { OUTPUT_TYPES } from "../shared/config.js";

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
    const relevant = evidence.filter((x) => x.score > 0);
    if (!relevant.length) return { answer: "I couldn't find this information in the provided source.", citations: [] };
    return {
      answer: `${plain(relevant[0].text)} [1]`,
      citations: relevant.slice(0, 3).map((x, i) => ({ marker: `[${i + 1}]`, page: x.page, section: x.section, source: x.text }))
    };
  }
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
