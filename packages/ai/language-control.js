import { DemoAIProvider } from "./provider.js";

// MORPH supports every language exposed by Transformation Controls.
// The source-grounded artifact is generated first, then translated while
// preserving citations, numbers and document-specific facts.
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
const MAX_CHUNK = 300;

DemoAIProvider.prototype.transform = async function (args) {
  const result = await originalTransform.call(this, args);
  const language = String(args?.language || "English");
  if (!result?.content || language === "English") return result;
  if (!LANG[language] && language !== HINGLISH) return result;

  try {
    result.content = await translateArtifact(result.content, language);
    if (result.title) result.title = await translateShort(result.title, language);
    result.language = language;
    result.translationFallback = false;
  } catch (error) {
    // A translation failure must never replace grounded output with an error.
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
  const protectedText = protectTokens(String(text));
  return restoreTokens(await translateChunk(protectedText, language));
}

async function translateChunk(text, language) {
  if (!text.trim()) return text;

  if (language === HINGLISH) {
    // Translate to Hindi first, then convert Hindi script to Roman script.
    const hindi = await translateWithProviders(text, "hi");
    return transliterateHindi(hindi);
  }

  return translateWithProviders(text, LANG[language]);
}

async function translateWithProviders(text, target) {
  // Google Translate's public translation endpoint supports all languages
  // used by MORPH and is more reliable for Indian-language coverage.
  try {
    return await googleTranslate(text, target);
  } catch (googleError) {
    console.warn(`MORPH Google translation fallback (${target}):`, googleError.message);
  }

  // Keep MyMemory as a secondary provider for resilience.
  try {
    return await myMemoryTranslate(text, target);
  } catch (memoryError) {
    throw new Error(`all translation providers failed for ${target}: ${memoryError.message}`);
  }
}

async function googleTranslate(text, target) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MORPH/1.0" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Google translation HTTP ${response.status}`);

  const data = await response.json();
  const translated = Array.isArray(data?.[0])
    ? data[0].map(part => Array.isArray(part) ? part[0] : "").join("")
    : "";

  if (!translated.trim()) throw new Error("Google translation returned empty text");
  if (/QUERY LENGTH LIMIT EXCEEDED|MYMEMORY WARNING/i.test(translated)) {
    throw new Error("translation provider returned an unusable response");
  }
  return translated.trim();
}

async function myMemoryTranslate(text, target) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `en|${target}`);
  url.searchParams.set("mt", "1");

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MORPH/1.0" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`MyMemory HTTP ${response.status}`);

  const data = await response.json();
  const translated = String(data?.responseData?.translatedText || "").trim();
  if (!translated || /MYMEMORY WARNING|QUERY LENGTH LIMIT EXCEEDED/i.test(translated)) {
    throw new Error("MyMemory returned an unusable response");
  }
  return translated;
}

async function transliterateHindi(text) {
  const pieces = splitTextSafely(text, 250);
  const result = [];

  for (const piece of pieces) {
    const url = new URL("https://inputtools.google.com/request");
    url.searchParams.set("text", piece);
    url.searchParams.set("itc", "hi-t-i0-und");
    url.searchParams.set("num", "1");
    url.searchParams.set("cp", "0");
    url.searchParams.set("cs", "1");
    url.searchParams.set("ie", "utf-8");
    url.searchParams.set("oe", "utf-8");

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`transliteration HTTP ${response.status}`);
      const data = await response.json();
      const value = data?.[1]?.[0]?.[1]?.[0];
      result.push(Array.isArray(value) ? value[0] : String(value || piece));
    } catch {
      // If transliteration is unavailable, retain the valid Hindi translation.
      result.push(piece);
    }
  }

  return result.join(" ");
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
    } else {
      chunks.push(...splitTextSafely(line, MAX_CHUNK));
      current = "";
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitTextSafely(text, maxLength) {
  const chunks = [];
  let remaining = String(text);

  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf(" ", maxLength);
    if (cut < Math.floor(maxLength * 0.55)) cut = maxLength;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function protectTokens(text) {
  return String(text)
    .replace(/\[(\d+)\]/g, " MORPHCITE$1MORPHEND ")
    .replace(/(₹|\$|€|£)\s?[\d,.]+/g, match => ` MORPHNUM${Buffer.from(match).toString("base64url")}MORPHEND `)
    .replace(/\b\d+(?:[,.]\d+)*%/g, match => ` MORPHPCT${match.replace(/[^0-9.,]/g, "")}MORPHEND `);
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
