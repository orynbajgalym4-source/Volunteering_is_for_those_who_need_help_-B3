"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ensureTelegramSession, initTelegram } from "../lib/telegram";

export function TelegramBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    void ensureTelegramSession().catch(() => undefined);
    let attempts = 0;
    const connect = () => {
      const app = initTelegram();
      if (app?.initData) void ensureTelegramSession(app.initData).catch(() => undefined);
      if (!app && attempts < 30) {
        attempts += 1;
        window.setTimeout(connect, 100);
      }
    };
    connect();
  }, []);

  useEffect(() => {
    const app = window.Telegram?.WebApp;
    if (!app) return;
    const goBack = () => router.back();
    if (pathname === "/" || pathname === "/app/asars") app.BackButton.hide();
    else { app.BackButton.show(); app.BackButton.onClick(goBack); }
    return () => app.BackButton.offClick(goBack);
  }, [pathname, router]);

  return null;
}
