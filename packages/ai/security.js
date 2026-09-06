import crypto from "node:crypto";
import { id, now } from "../database/store.js";

const PROMPT_PATTERNS = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /system prompt/i,
  /developer message/i,
  /you are now/i,
  /act as (an?|the) (system|developer|administrator)/i,
  /reveal.*(secret|api key|prompt|instruction)/i,
  /tool call|execute command|run shell/i
];

export const ALLOWED_EXTENSIONS = new Set(["txt", "md", "markdown", "pdf", "docx", "csv", "png", "jpg", "jpeg", "webp", "wav", "mp3", "zip"]);

export function safeFilename(name = "source.txt") {
  return String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\.\.+/g, ".").slice(0, 140) || "source.txt";
}

export function validateUpload({ name = "", type = "", content = "" }, maxMb) {
  const filename = safeFilename(name);
  const ext = filename.split(".").pop()?.toLowerCase() || "txt";
  const sizeBytes = Buffer.byteLength(String(content || ""), "utf8");
  const errors = [];
  if (!ALLOWED_EXTENSIONS.has(ext)) errors.push(`Unsupported file type .${ext}`);
  if (sizeBytes > maxMb * 1024 * 1024) errors.push(`File exceeds ${maxMb} MB limit`);
  if (ext === "zip" && /(^|[\\/])\.\.([\\/]|$)/.test(filename)) errors.push("ZIP traversal pattern detected");
  if (type && /javascript|x-msdownload|html/i.test(type)) errors.push("Potentially executable MIME type rejected");
  return { ok: errors.length === 0, errors, filename, ext, sizeBytes };
}

export function scanContent({ documentId, filename, text }) {
  const findings = [];
  for (const pattern of PROMPT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push({
        id: id("finding"),
        documentId,
        filename,
        severity: /ignore|reveal|execute|tool/i.test(match[0]) ? "HIGH" : "MEDIUM",
        type: "Prompt Injection Pattern",
        evidence: sampleAround(text, match.index || 0),
        recommendation: "Treat this passage as untrusted document data and exclude it from instructions.",
        createdAt: now()
      });
    }
  }
  if (/[\u200B-\u200D\uFEFF]/.test(text)) {
    findings.push({
      id: id("finding"),
      documentId,
      filename,
      severity: "MEDIUM",
      type: "Hidden Unicode",
      evidence: "Zero-width or hidden Unicode characters were detected.",
      recommendation: "Review sanitized text before retrieval.",
      createdAt: now()
    });
  }
  const sanitizedText = text.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(PROMPT_PATTERNS[0], "[REMOVED PROMPT-INJECTION-LIKE TEXT]");
  return {
    id: id("scan"),
    documentId,
    filename,
    status: findings.length ? "Findings detected" : "No known prompt-injection patterns detected",
    severity: findings.some((f) => f.severity === "HIGH") ? "HIGH" : findings.length ? "MEDIUM" : "LOW",
    findings,
    sanitizedText,
    hash: crypto.createHash("sha256").update(text).digest("hex"),
    createdAt: now()
  };
}

export function assessAuthenticity(document) {
  const text = document.text || "";
  const signals = [
    { name: "Claimed issuer", value: issuer(text), status: issuer(text) ? "present" : "missing" },
    { name: "Reference marker", value: (text.match(/\b(?:Ref|No\.|Notification|Order)\s*[:#-]?\s*[\w/-]+/i) || [])[0] || "Not found", status: /Ref|No\.|Notification|Order/i.test(text) ? "present" : "missing" },
    { name: "Citation marker", value: (text.match(/\[\d+\]/g) || []).length, status: (text.match(/\[\d+\]/g) || []).length ? "present" : "missing" },
    { name: "Integrity hash", value: crypto.createHash("sha256").update(text).digest("hex").slice(0, 16), status: "calculated" }
  ];
  const score = signals.filter((s) => s.status !== "missing").length / signals.length;
  return {
    id: id("authenticity"),
    documentId: document.id,
    status: score >= 0.75 ? "HIGH CONFIDENCE" : score >= 0.5 ? "PARTIALLY VERIFIED" : "UNVERIFIED",
    explanation: "Assessment uses available file/text metadata and internal consistency signals. It is not universal proof of genuineness.",
    signals,
    createdAt: now()
  };
}

function issuer(text) {
  return (text.match(/\b(?:Department|Ministry|Authority|Organisation|Office)\s+of\s+[A-Z][A-Za-z ]+/) || text.match(/\b[A-Z][A-Za-z ]+(?:Department|Authority|Ministry)\b/) || [])[0] || "";
}

function sampleAround(text, index) {
  return text.slice(Math.max(0, index - 80), index + 140);
}
