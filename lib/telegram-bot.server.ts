import { env } from "cloudflare:workers";

export function telegramBotConfig() {
  const token = String(env.TELEGRAM_BOT_TOKEN ?? "");
  const username = String(env.TELEGRAM_BOT_USERNAME ?? "asar_ops_bot").replace(/^@/, "");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is unavailable");
  return { token, username };
}

export async function telegramBotCall<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const { token } = telegramBotConfig();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { ok: boolean; result?: T; description?: string };
  if (!result.ok) throw new Error(result.description ?? `Telegram ${method} failed`);
  return result.result as T;
}

export function telegramInviteLink(token: string) {
  const username = String(env.TELEGRAM_BOT_USERNAME ?? "asar_ops_bot").replace(/^@/, "");
  return `https://t.me/${username}?start=join_${token}`;
}

export function telegramReconfirmationLink(token: string) {
  const username = String(env.TELEGRAM_BOT_USERNAME ?? "asar_ops_bot").replace(/^@/, "");
  return `https://t.me/${username}?start=reconfirm_${token}`;
}

export function isValidTelegramWebhook(request: Request) {
  const expected = String(env.TELEGRAM_WEBHOOK_SECRET ?? "");
  const received = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  return Boolean(expected) && expected === received;
}
