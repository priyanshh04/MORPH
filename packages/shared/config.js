const isProduction = process.env.NODE_ENV === "production";

export const CONFIG = {
  port: Number(process.env.PORT || 4321),
  isProduction,
  demoMode: String(process.env.DEMO_MODE || (isProduction ? "false" : "true")).toLowerCase() === "true",
  llmProvider: String(process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "demo")).toLowerCase(),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  modelName: process.env.MODEL_NAME || "gpt-5.5",
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 60000),
  maxFactsForPrompt: Number(process.env.MAX_FACTS_FOR_PROMPT || 30),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 12),
  jwtSecret: process.env.JWT_SECRET || (isProduction ? "" : "dev-transformai-secret"),
  databaseUrl: process.env.DATABASE_URL || "",
  dbSsl: String(process.env.DATABASE_SSL || (isProduction ? "true" : "false")).toLowerCase() === "true"
};

if (CONFIG.isProduction) {
  if (!CONFIG.jwtSecret || CONFIG.jwtSecret.length < 32) throw new Error("JWT_SECRET must be set to a random value of at least 32 characters in production.");
  if (!CONFIG.databaseUrl) throw new Error("DATABASE_URL is required in production.");
  if (CONFIG.llmProvider === "demo" && !CONFIG.demoMode) throw new Error("Production requires LLM_PROVIDER=openai unless DEMO_MODE=true.");
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
