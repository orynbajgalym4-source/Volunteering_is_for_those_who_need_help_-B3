import { env } from "cloudflare:workers";
import { createTelegramLaunchToken, createTelegramSession, validateTelegramLaunchToken, validateTelegramSession } from "./telegram-session";
import type { TelegramIdentity } from "./telegram-validation";

export const TELEGRAM_SESSION_COOKIE = "asar_tg_session";

function botToken() {
  return String(env.TELEGRAM_BOT_TOKEN ?? "");
}

export function telegramSessionCookie(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${TELEGRAM_SESSION_COOKIE}=`));
  return value ? decodeURIComponent(value.slice(TELEGRAM_SESSION_COOKIE.length + 1)) : "";
}

export async function createTelegramSessionCookie(identity: TelegramIdentity) {
  const token = await createTelegramSession(identity, botToken());
  return `${TELEGRAM_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
}

export function telegramSessionIdentityFromRequest(request: Request) {
  return validateTelegramSession(telegramSessionCookie(request), botToken());
}

export function createTelegramLaunch(identity: TelegramIdentity) {
  return createTelegramLaunchToken(identity, botToken());
}

export function validateTelegramLaunch(token: string) {
  return validateTelegramLaunchToken(token, botToken());
}
