const isProduction = process.env.NODE_ENV === "production";
const explicitDemoMode = String(process.env.DEMO_MODE || "").toLowerCase() === "true";

export const CONFIG = {
  port: Number(process.env.PORT || 4321),
  isProduction,
  demoMode: explicitDemoMode,
  // MORPH is source-grounded and fully usable without a paid external LLM.
  // External LLM usage is opt-in only via LLM_PROVIDER=openai.
  llmProvider: String(process.env.LLM_PROVIDER || "demo").toLowerCase(),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  modelName: process.env.MODEL_NAME || "gpt-5.6-luna",
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 60000),
  maxFactsForPrompt: Number(process.env.MAX_FACTS_FOR_PROMPT || 30),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 100),
  jwtSecret: process.env.JWT_SECRET || (isProduction ? "" : "dev-transformai-secret"),
  databaseUrl: process.env.DATABASE_URL || "",
  dbSsl: String(process.env.DATABASE_SSL || (isProduction ? "true" : "false")).toLowerCase() === "true"
};

if (CONFIG.llmProvider === "openai" && !CONFIG.openaiApiKey) {
  throw new Error("LLM_PROVIDER=openai requires OPENAI_API_KEY. Add it to .env locally or your deployment environment.");
}

if (CONFIG.isProduction) {
  if (!CONFIG.jwtSecret || CONFIG.jwtSecret.length < 32) throw new Error("JWT_SECRET must be set to a random value of at least 32 characters in production.");
  if (!CONFIG.databaseUrl) throw new Error("DATABASE_URL is required in production.");
}

export const OUTPUT_TYPES = [
  "Citizen Simplifier", "Officer Brief", "Executive Summary", "FAQ Generator", "WhatsApp Generator",
  "Social Media Generator", "Presentation Generator", "Voice Script", "Press Release", "SMS / Alert",
  "Infographic Content", "Detailed Report", "Key Facts / Statistics", "Action Checklist"
];

export const LANGUAGES = [
  "English", "Hindi", "Hinglish", "Tamil", "Telugu", "Bengali", "Marathi", "Gujarati",
  "Kannada", "Malayalam", "Punjabi", "Odia"
];
