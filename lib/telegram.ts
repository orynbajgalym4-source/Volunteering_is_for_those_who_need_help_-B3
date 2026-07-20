export type TelegramProfile = {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
};

export function getTelegramWebApp() {
  return typeof window === "undefined" ? null : window.Telegram?.WebApp ?? null;
}

const INIT_DATA_KEY = "asar.telegram.initData";

function initDataFromUrl() {
  if (typeof window === "undefined") return "";
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return hash.get("tgWebAppData") ?? search.get("tgWebAppData") ?? "";
}

export function getTelegramInitData() {
  if (typeof window === "undefined") return "";
  const current = getTelegramWebApp()?.initData || initDataFromUrl();
  if (current) {
    try { window.sessionStorage.setItem(INIT_DATA_KEY, current); } catch { /* Storage may be disabled. */ }
    return current;
  }
  try { return window.sessionStorage.getItem(INIT_DATA_KEY) ?? ""; } catch { return ""; }
}

export async function waitForTelegramInitData(timeoutMs = 2_000) {
  const started = Date.now();
  let value = getTelegramInitData();
  while (!value && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    value = getTelegramInitData();
  }
  return value;
}

let telegramSessionPromise: Promise<boolean> | null = null;

export function ensureTelegramSession(initData = getTelegramInitData()) {
  if (!initData) return Promise.resolve(false);
  if (!telegramSessionPromise) {
    telegramSessionPromise = fetch("/api/telegram/session", {
      method: "POST",
      credentials: "include",
      headers: { "X-Telegram-Init-Data": initData },
    }).then((response) => {
      if (!response.ok) throw new Error("Не удалось открыть Telegram-сессию");
      return true;
    }).catch((error) => {
      telegramSessionPromise = null;
      throw error;
    });
  }
  return telegramSessionPromise;
}

export function getTelegramProfile(): TelegramProfile | null {
  const user = getTelegramWebApp()?.initDataUnsafe.user;
  if (!user) return null;
  return { id: user.id, firstName: user.first_name, lastName: user.last_name, username: user.username, photoUrl: user.photo_url };
}

export function initTelegram() {
  const app = getTelegramWebApp();
  if (!app) return null;
  getTelegramInitData();
  app.ready();
  app.expand();
  app.setHeaderColor("#f5f0e6");
  app.setBackgroundColor("#f5f0e6");
  try { app.setBottomBarColor("#f5f0e6"); } catch { /* Older clients do not support it. */ }
  document.documentElement.classList.add("telegram-miniapp");
  document.documentElement.dataset.telegramTheme = app.colorScheme;
  return app;
}

export function telegramStartParam() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return getTelegramWebApp()?.initDataUnsafe.start_param ?? params.get("tgWebAppStartParam") ?? params.get("startapp") ?? "";
}

export function telegramHaptic(type: "success" | "error" | "light") {
  const feedback = getTelegramWebApp()?.HapticFeedback;
  if (type === "light") feedback?.impactOccurred("light");
  else feedback?.notificationOccurred(type);
}

export function shareInTelegram(url: string, text: string) {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const app = getTelegramWebApp();
  if (app) app.openTelegramLink(shareUrl);
  else window.open(shareUrl, "_blank", "noopener,noreferrer");
}
