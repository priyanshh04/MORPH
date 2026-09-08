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

  const profile = PROFILES[args.length] || PROFILES.Medium;
  result.content = enforceLength(result.content, args.facts || [], profile);
  return result;
};

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
