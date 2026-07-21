export type TelegramIdentity = {
  id: number;
  ownerKey: string;
  displayName: string;
  username: string | null;
};

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function hmac(key: ArrayBuffer | Uint8Array | string, value: string) {
  const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function validateTelegramInitDataWithToken(initData: string, botToken: string, maxAgeSeconds = 86_400): Promise<TelegramIdentity | null> {
  if (!botToken || !initData) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") ?? "";
  const authDate = Number(params.get("auth_date"));
  const userValue = params.get("user");
  if (!receivedHash || !authDate || !userValue) return null;
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 60 || now - authDate > maxAgeSeconds) return null;

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash" && key !== "signature")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = await hmac("WebAppData", botToken);
  const calculatedHash = hex(await hmac(secretKey, dataCheckString));
  if (!timingSafeEqual(calculatedHash, receivedHash.toLowerCase())) return null;

  try {
    const user = JSON.parse(userValue) as { id?: number; first_name?: string; last_name?: string; username?: string };
    if (!user.id || !user.first_name) return null;
    return {
      id: user.id,
      ownerKey: `telegram:${user.id}`,
      displayName: [user.first_name, user.last_name].filter(Boolean).join(" "),
      username: user.username ?? null,
    };
  } catch {
    return null;
  }
}
