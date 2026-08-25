export const CONFIG = {
  port: Number(process.env.PORT || 4321),
  jwtSecret: process.env.JWT_SECRET || "dev-transformai-secret",
  llmProvider: process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "demo"),
  modelName: process.env.MODEL_NAME || "demo-grounded-transformer",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 12)
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
