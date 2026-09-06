import { id, now } from "../database/store.js";

const RULES = [
  { type: "email", label: "email addresses", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: "[REDACTED EMAIL]" },
  { type: "phone", label: "phone numbers", pattern: /\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g, replacement: "[REDACTED PHONE]" },
  { type: "ip", label: "IP addresses", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "[REDACTED IP]" },
  { type: "id", label: "identifiers", pattern: /\b(?:Aadhaar|PAN|ID|Ref)\s*[:#-]?\s*[A-Z0-9-]{6,}\b/gi, replacement: "[REDACTED ID]" }
];

export function redactText(text, clearance = "PUBLIC", customRules = []) {
  let output = String(text || "");
  const events = [];
  const rules = clearance === "ADMIN" || clearance === "FULL" ? [] : [...RULES, ...customRules];
  for (const rule of rules) {
    const matches = [...output.matchAll(rule.pattern)];
    if (!matches.length) continue;
    output = output.replace(rule.pattern, rule.replacement);
    events.push({ id: id("redact"), type: rule.type, label: rule.label, count: matches.length, replacement: rule.replacement, createdAt: now() });
  }
  return {
    redactedText: output,
    events,
    summary: events.length ? events.map((e) => `${e.count} ${e.label} redacted`).join(", ") : "No configured sensitive patterns found",
    clearance,
    createdAt: now()
  };
}

export function syntheticTestData(text) {
  const redacted = redactText(text, "PUBLIC");
  const synthetic = redacted.redactedText
    .replace(/\bDepartment of [A-Z][A-Za-z ]+/g, "Department of Synthetic Preparedness")
    .replace(/\bSuraksha Benefit Scheme\b/g, "Sample Benefit Simulation")
    .replace(/\b20 September 2026\b/g, "15 October 2026");
  return {
    content: synthetic,
    label: "SYNTHETIC TEST DATA - for authorized defensive simulation only",
    validation: synthetic === text ? "Review recommended: no substitutions were required" : "Sensitive configured patterns removed/replaced",
    provenance: { synthetic: true, sourceTransformed: true, createdAt: now() }
  };
}
