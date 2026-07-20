import { env } from "cloudflare:workers";
import { validateTelegramInitDataWithToken, type TelegramIdentity } from "./telegram-validation";

export type { TelegramIdentity } from "./telegram-validation";

export async function validateTelegramInitData(initData: string, maxAgeSeconds = 86_400): Promise<TelegramIdentity | null> {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  return validateTelegramInitDataWithToken(initData, String(botToken ?? ""), maxAgeSeconds);
}

export async function telegramIdentityFromRequest(request: Request) {
  return validateTelegramInitData(request.headers.get("x-telegram-init-data") ?? "");
}
