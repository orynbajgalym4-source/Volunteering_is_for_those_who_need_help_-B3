import { telegramBotConfig } from "../../../../lib/telegram-bot.server";

export async function GET() {
  const { username } = telegramBotConfig();
  return Response.json({ username });
}
