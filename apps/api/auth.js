import crypto from "node:crypto";
import { CONFIG } from "../../packages/shared/config.js";

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  if (typeof password !== "string") throw new Error("Password must be a string");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored || "").split(":");
    if (!salt || !hash || hash.length !== 128) return false;
    const candidate = hashPassword(String(password || ""), salt).split(":")[1];
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
  } catch { return false; }
}

export function signToken(payload) {
  const header = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 8 });
  const sig = crypto.createHmac("sha256", CONFIG.jwtSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  try {
    if (!token) return null;
    const [header, body, sig] = String(token).split(".");
    if (!header || !body || !sig) return null;
    const expected = crypto.createHmac("sha256", CONFIG.jwtSecret).update(`${header}.${body}`).digest("base64url");
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

function b64(obj) { return Buffer.from(JSON.stringify(obj)).toString("base64url"); }
