"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "./asar-ui";
import { getTelegramProfile, getTelegramWebApp, type TelegramProfile as Profile } from "../lib/telegram";
import { api } from "../lib/client";

export function TelegramProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [writeAccess, setWriteAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const current = getTelegramProfile();
    queueMicrotask(() => setProfile(current));
    api<{ allowed: boolean }>("/api/telegram/notifications")
      .then((data) => setWriteAccess(data.allowed || Boolean(current?.allowsWriteToPm)))
      .catch(() => setWriteAccess(Boolean(current?.allowsWriteToPm)))
      .finally(() => setLoading(false));
  }, []);
  const saveAccess = async (allowed: boolean) => {
    setWriteAccess(allowed);
    setMessage(allowed ? "Готово — бот сможет предупреждать о рисках." : "Telegram не дал разрешение на сообщения.");
    if (allowed) await api("/api/telegram/notifications", { method: "POST", body: JSON.stringify({ allowed: true }) }).catch(() => undefined);
  };
  const requestMessages = () => {
    const app = getTelegramWebApp();
    if (!app) return setMessage("Откройте профиль внутри Telegram, чтобы дать разрешение боту.");
    app.requestWriteAccess((allowed) => { void saveAccess(allowed); });
  };
  return <div className="app-page"><AppHeader title="Профиль" /><main className="app-main wizard-shell"><div className="page-heading"><div><span className="section-kicker">Telegram‑профиль</span><h1>{profile ? `${profile.firstName}${profile.lastName ? ` ${profile.lastName}` : ""}` : "Инициатор"}</h1><p>{profile?.username ? `@${profile.username}` : profile ? `Telegram ID ${profile.id}` : "Данные появятся внутри Telegram"}</p></div></div><section className="panel"><div className="tg-profile-card"><div className="tg-profile-avatar">{profile?.firstName?.[0] ?? "А"}</div><div><h2>Уведомления о рисках</h2><p className="panel-lead">Бот предупредит, если критический участник отменил участие или снова появилась нехватка.</p></div></div>{message && <div className={writeAccess ? "success-banner" : "error-banner"}>{message}</div>}{loading ? <div className="loading-inline">Проверяем разрешение…</div> : writeAccess ? <div className="success-banner notification-enabled">✓ Уведомления включены</div> : <button className="button button-primary button-block" onClick={requestMessages}>Включить уведомления</button>}<div className="privacy-card">Asar хранит только данные, необходимые для координации. Медицинские, финансовые и семейные сведения получателя не собираются.</div></section></main></div>;
}
