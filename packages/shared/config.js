export const CONFIG = {
  port: Number(process.env.PORT || 4321),
  jwtSecret: process.env.JWT_SECRET || "dev-transformai-secret",
  demoMode: String(process.env.DEMO_MODE || "true").toLowerCase() === "true",
  llmProvider: process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "demo"),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  modelName: process.env.OPENAI_MODEL || process.env.MODEL_NAME || "gpt-4.1-mini",
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL || "text-embedding-3-small",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 12),
  storagePath: process.env.STORAGE_PATH || "data",
  appUrl: process.env.APP_URL || "http://localhost:4321"
};

export const OUTPUT_TYPES = [
  "Citizen Simplifier",
  "Officer Brief",
  "Executive Summary",
  "FAQ Generator",
  "WhatsApp Generator",
  "Social Media Generator",
  "Presentation Generator",
  "Voice Script",
  "Press Release",
  "SMS / Alert",
  "Infographic Content",
  "Detailed Report",
  "Key Facts / Statistics",
  "Action Checklist"
];

export const LANGUAGES = [
  "English",
  "Hindi",
  "Hinglish",
  "Tamil",
  "Telugu",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Punjabi",
  "Odia"
];

export const APP_NAME = "MORPH";
export const APP_SUBTITLE = "Multiformat Output & Representation Processing Hub";
