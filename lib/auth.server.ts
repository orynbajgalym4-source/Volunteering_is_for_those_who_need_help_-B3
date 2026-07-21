import { telegramIdentityFromRequest } from "./telegram-auth.server";
import { telegramSessionIdentityFromRequest } from "./telegram-session.server";

export type OrganizerIdentity = { email: string; displayName: string; username?: string | null };

export async function telegramUserFromRequest(request: Request) {
  return await telegramIdentityFromRequest(request) ?? await telegramSessionIdentityFromRequest(request);
}

export async function organizerFromRequest(request: Request): Promise<OrganizerIdentity | null> {
  const user = await telegramUserFromRequest(request);
  if (user) return { email: user.ownerKey, displayName: user.displayName, username: user.username };

  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return { email: "telegram:demo", displayName: "Аружан", username: "aruzhan" };
  }
  return null;
}

export function unauthorized() {
  return Response.json({ code: "UNAUTHORIZED", message: "Это окно открыто старой кнопкой. Закройте его, отправьте /start боту и нажмите новую кнопку «Открыть Asar»." }, { status: 401 });
}
