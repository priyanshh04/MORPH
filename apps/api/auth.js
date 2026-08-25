import crypto from "node:crypto";
import { CONFIG } from "../../packages/shared/config.js";

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const candidate = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

export function signToken(payload) {
  const header = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 8 });
  const sig = crypto.createHmac("sha256", CONFIG.jwtSecret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const [header, body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", CONFIG.jwtSecret).update(`${header}.${body}`).digest("base64url");
  if (sig !== expected) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return payload.exp > Date.now() ? payload : null;
}

function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
