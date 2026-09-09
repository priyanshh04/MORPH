import { DemoAIProvider } from "./provider.js";

// MORPH supports the languages exposed by the Transformation Controls.
// The local source engine creates the grounded artifact first; this layer
// translates that artifact while preserving source citations, numbers and
// document names. If the translation service is unavailable, MORPH returns
// the original grounded English artifact rather than fabricating a translation.
const originalTransform = DemoAIProvider.prototype.transform;

const LANG = {
  English: "en",
  Hindi: "hi",
  Tamil: "ta",
  Telugu: "te",
  Bengali: "bn",
  Marathi: "mr",
  Gujarati: "gu",
  Kannada: "kn",
  Malayalam: "ml",
  Punjabi: "pa",
  Odia: "or"
};

const HINGLISH = "Hinglish";
const MAX_CHUNK = 850;

DemoAIProvider.prototype.transform = async function (args) {
  const result = await originalTransform.call(this, args);
  const language = String(args?.language || "English");
  if (!result?.content || language === "English") return result;
  if (!LANG[language] && language !== HINGLISH) return result;

  try {
    result.content = await translateArtifact(result.content, language);
    result.title = await translateShort(result.title, language);
    result.language = language;
  } catch (error) {
    // Translation must never break generation or compromise source grounding.
    console.warn(`MORPH ${language} translation fallback:`, error.message);
    result.language = "English";
    result.translationFallback = true;
  }
  return result;
};

async function translateArtifact(text, language) {
  const protectedText = protectTokens(String(text));
  const chunks = splitForTranslation(protectedText);
  const translated = [];

  for (const chunk of chunks) {
    translated.push(await translateChunk(chunk, language));
  }

  return restoreTokens(translated.join("\n"));
}

async function translateShort(text, language) {
  if (!text) return text;
  const protectedText = protectTokens(String(text));
  return restoreTokens(await translateChunk(protectedText, language));
}

async function translateChunk(text, language) {
  if (!text.trim()) return text;
  if (language === HINGLISH) {
    // Hindi translation followed by Roman-script transliteration gives the
    // user Hinglish rather than Hindi Devanagari.
    const hindi = await memorySafeTranslate(text, "hi");
    return transliterateHindi(hindi);
  }
  return memorySafeTranslate(text, LANG[language]);
}

async function memorySafeTranslate(text, target) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `en|${target}`);
  url.searchParams.set("mt", "1");

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MORPH/1.0" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`translation service HTTP ${response.status}`);

  const data = await response.json();
  const translated = String(data?.responseData?.translatedText || "").trim();
  if (!translated || /MYMEMORY WARNING/i.test(translated)) {
    throw new Error("translation service returned no usable translation");
  }
  return translated;
}

async function transliterateHindi(text) {
  const url = new URL("https://inputtools.google.com/request");
  url.searchParams.set("text", text);
  url.searchParams.set("itc", "hi-t-i0-und");
  url.searchParams.set("num", "1");
  url.searchParams.set("cp", "0");
  url.searchParams.set("cs", "1");
  url.searchParams.set("ie", "utf-8");
  url.searchParams.set("oe", "utf-8");

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`transliteration service HTTP ${response.status}`);
  const data = await response.json();
  const result = data?.[1]?.[0]?.[1]?.[0];
  return Array.isArray(result) ? result[0] : String(result || text);
}

function splitForTranslation(text) {
  const lines = String(text).split("\n");
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= MAX_CHUNK) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (line.length <= MAX_CHUNK) {
      current = line;
      continue;
    }
    const sentences = line.match(/.{1,800}(?:\s+|$)/g) || [line];
    current = "";
    for (const part of sentences) {
      if (part.length <= MAX_CHUNK) chunks.push(part);
      else {
        for (let i = 0; i < part.length; i += MAX_CHUNK) chunks.push(part.slice(i, i + MAX_CHUNK));
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function protectTokens(text) {
  return String(text)
    .replace(/\[(\d+)\]/g, " MORPHCITE$1MORPHEND ")
    .replace(/(₹|\$|€|£)\s?[\d,.]+/g, match => ` MORPHNUM${Buffer.from(match).toString("base64url")}MORPHEND `)
    .replace(/\b\d+(?:[,.]\d+)*%\b/g, match => ` MORPHPCT${match.replace(/[^0-9.,]/g, "")}MORPHEND `);
}

function restoreTokens(text) {
  return String(text)
    .replace(/\s*MORPHCITE(\d+)MORPHEND\s*/g, " [$1] ")
    .replace(/\s*MORPHNUM([A-Za-z0-9_-]+)MORPHEND\s*/g, (_, value) => ` ${Buffer.from(value, "base64url").toString("utf8")} `)
    .replace(/\s*MORPHPCT([0-9.,]+)MORPHEND\s*/g, " $1% ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
