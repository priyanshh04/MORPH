import crypto from "node:crypto";
import { id, now } from "../database/store.js";

export function artifactRecord({ userId, output, format, content }) {
  return {
    id: id("artifact"),
    artifactId: `MORPH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    generatingUserId: userId,
    timestamp: now(),
    sourceDocumentIds: output.documentIds,
    transformationType: output.outputType,
    model: output.model,
    provider: output.provider,
    approvalStatus: output.reviewStatus || "PENDING_REVIEW",
    format,
    hash: crypto.createHash("sha256").update(content).digest("hex")
  };
}

export function verifyArtifact(content, records) {
  const hash = crypto.createHash("sha256").update(String(content || "")).digest("hex");
  const exact = records.find((r) => r.hash === hash);
  return exact
    ? { status: "POSSIBLE MATCH", confidence: "HIGH", record: exact }
    : { status: "NO EXACT MATCH", confidence: "LOW", record: null };
}
