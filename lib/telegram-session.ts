import type { TelegramIdentity } from "./telegram-validation";

type SessionPayload = TelegramIdentity & { expiresAt: number; version: 1 };

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`AsarTelegramSession:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createTelegramSession(identity: TelegramIdentity, secret: string, ttlSeconds = 86_400, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload: SessionPayload = { ...identity, expiresAt: nowSeconds + ttlSeconds, version: 1 };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${await sign(encoded, secret)}`;
}

export async function validateTelegramSession(session: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<TelegramIdentity | null> {
  if (!session || !secret) return null;
  const separator = session.lastIndexOf(".");
  if (separator <= 0) return null;
  const encoded = session.slice(0, separator);
  const receivedSignature = session.slice(separator + 1);
  const expectedSignature = await sign(encoded, secret);
  if (!timingSafeEqual(receivedSignature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as SessionPayload;
    if (payload.version !== 1 || payload.expiresAt < nowSeconds || !payload.id || !payload.ownerKey || !payload.displayName) return null;
    return { id: payload.id, ownerKey: payload.ownerKey, displayName: payload.displayName, username: payload.username ?? null };
  } catch {
    return null;
  }
}
