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

export function getTelegramProfile(): TelegramProfile | null {
  const user = getTelegramWebApp()?.initDataUnsafe.user;
  if (!user) return null;
  return { id: user.id, firstName: user.first_name, lastName: user.last_name, username: user.username, photoUrl: user.photo_url };
}

export function initTelegram() {
  const app = getTelegramWebApp();
  if (!app) return null;
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
