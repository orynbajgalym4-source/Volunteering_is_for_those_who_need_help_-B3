import { getTelegramWebApp } from "./telegram";

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const initData = getTelegramWebApp()?.initData;
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(initData ? { "X-Telegram-Init-Data": initData } : {}), ...(options?.headers ?? {}) } });
  const data = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(data.message || "Не удалось выполнить действие");
  return data;
}

export async function copyLink(path: string) {
  const url = new URL(path, window.location.origin).toString();
  await navigator.clipboard.writeText(url);
  return url;
}
