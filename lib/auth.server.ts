import { telegramIdentityFromRequest } from "./telegram-auth.server";
import { telegramSessionIdentityFromRequest } from "./telegram-session.server";

export type OrganizerIdentity = { email: string; displayName: string };

export async function organizerFromRequest(request: Request): Promise<OrganizerIdentity | null> {
  const user = await telegramIdentityFromRequest(request) ?? await telegramSessionIdentityFromRequest(request);
  if (user) return { email: user.ownerKey, displayName: user.displayName };

  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return { email: "telegram:demo", displayName: "Аружан" };
  }
  return null;
}

export function unauthorized() {
  return Response.json({ code: "UNAUTHORIZED", message: "Откройте Asar через Telegram-бота" }, { status: 401 });
}
