"use client";

import { useEffect } from "react";

export function InviteRedirect({ telegramUrl, title, role }: { telegramUrl: string; title: string; role?: string }) {
  useEffect(() => { window.location.replace(telegramUrl); }, [telegramUrl]);
  return <main className="invite-redirect"><div className="invite-redirect-card"><span className="brand-mark">A</span><small>Приглашение в асар</small><h1>{title}</h1>{role && <p>Нужен вклад: <strong>{role}</strong></p>}<p>Открываем Telegram-бота. Там останется выбрать обязанность и подтвердить участие.</p><a className="button button-primary button-large" href={telegramUrl}>Открыть в Telegram</a></div></main>;
}
