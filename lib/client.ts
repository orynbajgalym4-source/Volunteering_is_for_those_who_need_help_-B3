import { ensureTelegramSession, getTelegramInitData, getTelegramLaunchToken, waitForTelegramInitData } from "./telegram";

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const protectedRequest = url.startsWith("/api/asars") || url.startsWith("/api/groups") || url.startsWith("/api/telegram");
  const initData = getTelegramInitData() || (protectedRequest ? await waitForTelegramInitData() : "");
  const launchToken = getTelegramLaunchToken();
  if (protectedRequest && (initData || launchToken)) await ensureTelegramSession(initData, launchToken).catch(() => undefined);
  const isFormData = options?.body instanceof FormData;
  const response = await fetch(url, { ...options, credentials: "include", headers: { ...(!isFormData ? { "Content-Type": "application/json" } : {}), ...(initData ? { "X-Telegram-Init-Data": initData } : {}), ...(options?.headers ?? {}) } });
  const data = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(data.message || "Не удалось выполнить действие");
  return data;
}

export async function copyLink(path: string) {
  const url = new URL(path, window.location.origin).toString();
  await navigator.clipboard.writeText(url);
  return url;
}
