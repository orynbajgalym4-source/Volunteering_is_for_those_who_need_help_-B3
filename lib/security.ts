export function randomToken(bytes = 24) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function hashToken(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeContact(value: string) {
  return value.trim().toLowerCase().replace(/[\s()+-]/g, "");
}
