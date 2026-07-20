import { getChatGPTUser } from "../app/chatgpt-auth";

export type OrganizerIdentity = { email: string; displayName: string };

export async function organizerFromRequest(request: Request): Promise<OrganizerIdentity | null> {
  const user = await getChatGPTUser();
  if (user) return { email: user.email, displayName: user.displayName };

  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return { email: "demo@asar.local", displayName: "Аружан" };
  }
  return null;
}

export function unauthorized() {
  return Response.json({ code: "UNAUTHORIZED", message: "Войдите как инициатор" }, { status: 401 });
}
