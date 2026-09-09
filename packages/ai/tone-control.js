import { DemoAIProvider } from "./provider.js";

// Apply tone to the actual generated body, not only the opening sentence.
// This layer intentionally keeps source facts unchanged and only changes
// phrasing, framing, headings, and presentation markers.
const originalTransform = DemoAIProvider.prototype.transform;

const TONES = {
  Formal: {
    intro: (audience, type) => `Formal ${type.toLowerCase()} for ${audience}, presenting the source in precise and official language.`,
    bullet: "According to the source,",
    answer: "According to the source,",
    headings: {
      "CITIZEN FOCUS": "CITIZEN BRIEF — OFFICIAL INFORMATION",
      "KEY POINTS": "KEY FACTS",
      "BENEFITS / RESULTS": "BENEFITS / OUTCOMES",
      "WHAT TO DO": "REQUIRED ACTIONS",
      "NEXT ACTIONS": "REQUIRED ACTIONS",
      "DATES": "DATES / TIMELINES"
    }
  },
  Simple: {
    intro: (audience, type) => `Simple ${type.toLowerCase()} for ${audience}, explained in easy-to-understand language.`,
    bullet: "In simple terms,",
    answer: "Simply put,",
    headings: {
      "CITIZEN FOCUS": "MAIN THINGS TO KNOW",
      "KEY POINTS": "MAIN POINTS",
      "BENEFITS / RESULTS": "WHAT THIS MEANS",
      "WHAT TO DO": "WHAT YOU NEED TO DO",
      "NEXT ACTIONS": "WHAT YOU NEED TO DO",
      "DATES": "IMPORTANT DATES"
    }
  },
  Professional: {
    intro: (audience, type) => `Professional ${type.toLowerCase()} for ${audience}, structured for clear and actionable use.`,
    bullet: "Key point:",
    answer: "The source states that",
    headings: {
      "CITIZEN FOCUS": "CITIZEN FOCUS — ACTIONABLE INFORMATION",
      "KEY POINTS": "KEY POINTS",
      "BENEFITS / RESULTS": "BENEFITS / RESULTS",
      "WHAT TO DO": "NEXT ACTIONS",
      "DATES": "DATES / TIMELINES"
    }
  },
  Friendly: {
    intro: (audience, type) => `Friendly ${type.toLowerCase()} for ${audience}, with a more approachable and conversational presentation.`,
    bullet: "Good to know:",
    answer: "The useful takeaway is that",
    headings: {
      "CITIZEN FOCUS": "GOOD TO KNOW — CITIZEN VIEW",
      "KEY POINTS": "THINGS TO KNOW",
      "BENEFITS / RESULTS": "WHY IT MATTERS",
      "WHAT TO DO": "WHAT YOU CAN DO",
      "DATES": "DATES TO KEEP IN MIND"
    }
  },
  Urgent: {
    intro: (audience, type) => `Urgent ${type.toLowerCase()} for ${audience}, highlighting time-sensitive source-backed information first.`,
    bullet: "IMPORTANT:",
    answer: "IMPORTANT: the source states that",
    headings: {
      "CITIZEN FOCUS": "CITIZEN FOCUS — PRIORITY INFORMATION",
      "KEY POINTS": "CRITICAL POINTS",
      "BENEFITS / RESULTS": "IMPACT / RESULTS",
      "WHAT TO DO": "ACTIONS TO TAKE NOW",
      "DATES": "IMPORTANT DATES / DEADLINES"
    }
  },
  Educational: {
    intro: (audience, type) => `Educational ${type.toLowerCase()} for ${audience}, presenting the source as clear learning points.`,
    bullet: "Key learning:",
    answer: "The key idea is that",
    headings: {
      "CITIZEN FOCUS": "LEARNING VIEW — CITIZEN CONTEXT",
      "KEY POINTS": "CORE CONCEPTS",
      "BENEFITS / RESULTS": "EFFECTS / RESULTS",
      "WHAT TO DO": "STEPS / ACTIONS",
      "DATES": "KEY DATES"
    }
  }
};

DemoAIProvider.prototype.transform = async function (args) {
  const result = await originalTransform.call(this, args);
  if (!result?.content) return result;

  const tone = TONES[String(args.tone || "Professional")] || TONES.Professional;
  let text = String(result.content).trim();

  // Remove only prior tone framing markers so repeated generations do not
  // accumulate prefixes. Source facts themselves are never altered.
  text = stripToneMarkers(text);

  const lines = text.split("\n").map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    const heading = mapHeading(trimmed, tone.headings);
    if (heading) return heading;

    if (/^Q\d+\.\s+/i.test(trimmed)) return line;

    const answerMatch = trimmed.match(/^A(?:\d+)?[.:]\s+(.+)$/i);
    if (answerMatch) {
      return `A. ${tone.answer} ${answerMatch[1]}`;
    }

    const bulletMatch = trimmed.match(/^([•☐-])\s+(.+)$/);
    if (bulletMatch) {
      return `${bulletMatch[1]} ${tone.bullet} ${bulletMatch[2]}`;
    }

    return line;
  });

  result.content = `${tone.intro(args.audience || "Citizen", args.outputType || "output")}\n\n${lines.join("\n")}`.trim();
  return result;
};

function mapHeading(line, headings) {
  if (headings[line]) return headings[line];
  for (const [from, to] of Object.entries(headings)) {
    if (line.startsWith(`${from} —`)) return line.replace(from, to);
  }
  return null;
}

function stripToneMarkers(text) {
  return String(text)
    .replace(/^((?:Formal|Simple|Professional|Friendly|Urgent|Educational) .*?)\n\n/i, "")
    .split("\n")
    .map(line => line
      .replace(/^(\s*[•☐-]\s+)(?:According to the source,|In simple terms,|Key point:|Good to know:|IMPORTANT:|Key learning:)\s+/i, "$1")
      .replace(/^(\s*A\.\s+)(?:According to the source,|Simply put,|The source states that|The useful takeaway is that|IMPORTANT:\s+the source states that|The key idea is that)\s+/i, "$1")
    )
    .join("\n");
}
