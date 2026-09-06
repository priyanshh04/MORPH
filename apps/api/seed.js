import { hashPassword } from "./auth.js";
import { analyzeDocument, chunkDocument, parseUploadedContent } from "../../packages/ai/document.js";
import { verifyOutput } from "../../packages/ai/verification.js";
import { createProvider } from "../../packages/ai/provider.js";
import { CONFIG } from "../../packages/shared/config.js";
import { id, now, readDb, writeDb } from "../../packages/database/store.js";

const samples = [
  { name: "Government welfare scheme notification.txt", department: "Social Welfare", content: "Government Welfare Scheme Notification 2026\nThe Department of Social Welfare launched the Suraksha Benefit Scheme on 1 August 2026. Eligible households with annual income below INR 2,50,000 may apply through district service centres. Applications close on 20 September 2026. The scheme provides a one-time benefit of INR 10,000 after verification. District officers must publish beneficiary lists within 30 days. [1] Section: Eligibility and Benefits." },
  { name: "District disaster weather alert.txt", department: "Disaster Management", content: "District Disaster Management Authority Cyclone Preparedness Alert\nIssued on 20 September 2026 for coastal blocks. Citizens in low-lying areas must move to shelters by 6 PM. Emergency helpline 1077 will operate continuously. Fishing activity is suspended until 22 September 2026. Schools in affected blocks remain closed on 21 September 2026. [1] Section: Public Safety Advisory." },
  { name: "Education policy document.txt", department: "Education", content: "Education Department Digital Learning Policy 2026\nThe policy provides tablets to students of classes 9 to 12 in government schools. Schools must complete beneficiary verification by 15 October 2026. District officers must submit implementation reports every month. Budget allocation is INR 10 crore for phase one. [1] Section: Implementation Guidelines." }
];

export async function ensureSeedData() {
  const db = await readDb();
  const seedDemo = String(process.env.SEED_DEMO || (!CONFIG.isProduction)).toLowerCase() === "true";

  if (seedDemo) {
    if (!db.users.some((u) => u.email.toLowerCase() === "admin@transformai.gov")) db.users.push({ id: "user_admin", name: "Admin Officer", email: "admin@transformai.gov", role: "ADMIN", passwordHash: hashPassword("Admin@123"), createdAt: now() });
    if (!db.users.some((u) => u.email.toLowerCase() === "officer@transformai.gov")) db.users.push({ id: "user_officer", name: "Demo Officer", email: "officer@transformai.gov", role: "OFFICER", passwordHash: hashPassword("Officer@123"), createdAt: now() });
  }

  if (seedDemo && !db.documents.length) {
    const provider = createProvider();
    for (const sample of samples) {
      const parsed = await parseUploadedContent({ name: sample.name, content: sample.content });
      const doc = { id: id("doc"), title: parsed.title, name: sample.name, text: parsed.text, fileType: parsed.fileType, pages: parsed.pages, department: sample.department, uploadedBy: "user_officer", metadata: parsed.metadata, createdAt: now() };
      const chunks = chunkDocument(doc.id, doc.text);
      const analysis = analyzeDocument(doc, chunks);
      db.documents.push({ ...doc, intelligence: analysis.intelligence, status: "Analyzed", demo: true });
      db.document_chunks.push(...chunks); db.document_facts.push(...analysis.facts); db.document_entities.push(...analysis.entities);
      const ai = await provider.transform({ document: doc, facts: analysis.facts, chunks, outputType: "Citizen Simplifier", audience: "Citizen", tone: "Simple", length: "Medium", channel: "Website", language: "English" });
      const output = { id: id("out"), transformationId: id("tr"), documentIds: [doc.id], title: ai.title, outputType: "Citizen Simplifier", audience: "Citizen", tone: "Simple", length: "Medium", language: "English", channel: "Website", content: ai.content, provider: ai.provider, model: ai.model, citationMap: ai.citationMap, createdBy: "user_officer", createdAt: now(), version: 1, demo: true };
      const verification = verifyOutput(output.content, analysis.facts);
      output.factualityScore = verification.factualityScore; output.citationCoverage = verification.citationCoverage;
      db.transformations.push({ id: output.transformationId, documentIds: output.documentIds, requestedBy: "user_officer", outputType: output.outputType, createdAt: now() });
      db.generated_outputs.push(output);
      db.transformation_versions.push({ id: id("ver"), outputId: output.id, version: 1, content: output.content, createdAt: now() });
      db.verification_results.push({ id: id("verify"), outputId: output.id, ...verification, createdAt: now() });
    }
  }

  db.templates = db.templates.length ? db.templates : [
    { id: "tpl_citizen", name: "Citizen Simplifier", category: "Public Communication" },
    { id: "tpl_officer", name: "Officer Brief", category: "Internal Briefing" },
    { id: "tpl_alert", name: "SMS / Alert", category: "Emergency" }
  ];
  await writeDb(db);
}
