import { validateTelegramInitData } from "../../../../lib/telegram-auth.server";
import { createTelegramSessionCookie, telegramSessionIdentityFromRequest } from "../../../../lib/telegram-session.server";

export async function GET(request: Request) {
  const identity = await telegramSessionIdentityFromRequest(request);
  return Response.json({ authenticated: Boolean(identity) }, { status: identity ? 200 : 401 });
}

export async function POST(request: Request) {
  const initData = request.headers.get("x-telegram-init-data") ?? "";
  const identity = await validateTelegramInitData(initData);
  if (!identity) return Response.json({ code: "INVALID_TELEGRAM_SESSION", message: "Telegram-сессия недействительна" }, { status: 401 });
  return Response.json(
    { authenticated: true, user: { id: identity.id, displayName: identity.displayName } },
    { headers: { "Set-Cookie": await createTelegramSessionCookie(identity), "Cache-Control": "no-store" } },
  );
}
