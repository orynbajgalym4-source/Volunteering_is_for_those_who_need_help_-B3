"use client";

import { useEffect, useState } from "react";
import { JoinAsar } from "./join-asar";
import { ManageCommitment } from "./manage-commitment";
import { OrganizerDashboard } from "./organizer-dashboard";
import { Brand } from "./asar-ui";
import { getTelegramLaunchToken, getTelegramProfile, getTelegramWebApp, initTelegram, telegramStartParam } from "../lib/telegram";

export function TelegramEntry() {
  const [ready, setReady] = useState(false);
  const [startParam, setStartParam] = useState("");
  const [inTelegram, setInTelegram] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const boot = () => {
      const app = initTelegram();
      if (app) {
        setInTelegram(Boolean(app.initData || getTelegramLaunchToken()));
        setStartParam(telegramStartParam());
        setReady(true);
        return;
      }
      if (attempts < 25) { attempts += 1; window.setTimeout(boot, 100); }
      else setReady(true);
    };
    boot();
  }, []);

  if (!ready) return <main className="tg-boot"><span className="spinner" /><p>Открываем Asar…</p></main>;
  if (startParam.startsWith("join_")) return <JoinAsar token={startParam.slice(5)} />;
  if (startParam.startsWith("commit_")) return <ManageCommitment token={startParam.slice(7)} />;
  if (!inTelegram && !getTelegramWebApp()?.initData && !getTelegramLaunchToken() && location.hostname !== "localhost") {
    return <main className="tg-outside"><Brand /><div className="tg-outside-mark">A</div><h1>Asar живёт внутри Telegram.</h1><p>Откройте мини‑приложение через бота, чтобы создавать асары и получать приглашения.</p><a className="button button-primary button-large" href="https://t.me/asar_ops_bot">Открыть @asar_ops_bot</a></main>;
  }
  return <OrganizerDashboard embedded profile={getTelegramProfile()} />;
}
