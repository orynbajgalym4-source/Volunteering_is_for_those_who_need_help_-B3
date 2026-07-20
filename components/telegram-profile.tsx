"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "./asar-ui";
import { getTelegramProfile, getTelegramWebApp, type TelegramProfile as Profile } from "../lib/telegram";

export function TelegramProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [writeAccess, setWriteAccess] = useState(false);
  useEffect(() => { queueMicrotask(() => setProfile(getTelegramProfile())); }, []);
  const requestMessages = () => getTelegramWebApp()?.requestWriteAccess((allowed) => setWriteAccess(allowed));
  return <div className="app-page"><AppHeader title="Профиль" /><main className="app-main wizard-shell"><div className="page-heading"><div><span className="section-kicker">Telegram‑профиль</span><h1>{profile ? `${profile.firstName}${profile.lastName ? ` ${profile.lastName}` : ""}` : "Инициатор"}</h1><p>{profile?.username ? `@${profile.username}` : profile ? `Telegram ID ${profile.id}` : "Данные появятся внутри Telegram"}</p></div></div><section className="panel"><div className="tg-profile-card"><div className="tg-profile-avatar">{profile?.firstName?.[0] ?? "А"}</div><div><h2>Уведомления о рисках</h2><p className="panel-lead">Разрешите боту сообщать, когда критический участник отменил участие или появилась нехватка.</p></div></div>{writeAccess ? <div className="success-banner">Уведомления разрешены.</div> : <button className="button button-primary button-block" onClick={requestMessages}>Разрешить сообщения от бота</button>}<div className="success-banner" style={{ marginTop: 18 }}>Asar хранит только данные, необходимые для координации. Медицинские, финансовые и семейные сведения получателя не собираются.</div></section></main></div>;
}
