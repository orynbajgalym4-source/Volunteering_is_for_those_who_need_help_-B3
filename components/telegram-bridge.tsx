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
    const goBack = () => {
      const nestedAsar = pathname.match(/^\/app\/asars\/([^/]+)\/(?:share|day|complete)$/);
      if (nestedAsar) return router.push(`/app/asars/${nestedAsar[1]}`);
      if (pathname === "/app/asars/new" || /^\/app\/asars\/[^/]+$/.test(pathname)) return router.push("/app/asars");
      if (pathname === "/app/profile") return router.push("/");
      return router.push("/");
    };
    if (pathname === "/" || pathname === "/app/asars") app.BackButton.hide();
    else { app.BackButton.show(); app.BackButton.onClick(goBack); }
    return () => app.BackButton.offClick(goBack);
  }, [pathname, router]);

  return null;
}
