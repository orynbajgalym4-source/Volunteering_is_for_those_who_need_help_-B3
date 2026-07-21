import { isValidTelegramWebhook, telegramBotCall } from "../../../../lib/telegram-bot.server";
import { createTelegramLaunch } from "../../../../lib/telegram-session.server";

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    text?: string;
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
  };
};

export async function POST(request: Request) {
  if (!isValidTelegramWebhook(request)) return Response.json({ ok: false }, { status: 401 });
  const update = await request.json() as TelegramUpdate;
  const message = update.message;
  if (!message?.chat.id || !message.text?.startsWith("/start")) return Response.json({ ok: true });

  const startParam = message.text.split(/\s+/, 2)[1] ?? "";
  const origin = new URL(request.url).origin;
  const isInvite = startParam.startsWith("join_");
  const sender = message.from;
  if (!sender?.id) return Response.json({ ok: true });
  const launchToken = await createTelegramLaunch({
    id: sender.id,
    ownerKey: `telegram:${sender.id}`,
    displayName: [sender.first_name, sender.last_name].filter(Boolean).join(" ") || "Пользователь Telegram",
    username: sender.username ?? null,
  });
  const menuUrl = new URL(origin);
  menuUrl.searchParams.set("launch", launchToken);
  const webAppUrl = new URL(menuUrl);
  if (isInvite) webAppUrl.searchParams.set("startapp", startParam);
  const firstName = message.from?.first_name ? `, ${message.from.first_name}` : "";
  const text = isInvite
    ? "Вас пригласили в асар. Откройте карточку, выберите конкретный вклад и подтвердите участие — аккаунт создавать не нужно."
    : `Сәлем${firstName}! Asar помогает собрать людей и ресурсы вокруг одного общего дела и заранее увидеть риск срыва.`;

  try {
    await telegramBotCall("setChatMenuButton", {
      chat_id: message.chat.id,
      menu_button: { type: "web_app", text: "Открыть Asar", web_app: { url: menuUrl.toString() } },
    });
  } catch { /* The inline launch button below remains available. */ }

  await telegramBotCall("sendMessage", {
    chat_id: message.chat.id,
    text,
    reply_markup: { inline_keyboard: [[{ text: isInvite ? "Открыть приглашение" : "Открыть Asar", web_app: { url: webAppUrl.toString() } }]] },
  });
  return Response.json({ ok: true });
}
