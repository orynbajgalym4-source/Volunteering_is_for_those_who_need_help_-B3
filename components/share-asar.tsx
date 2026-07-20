"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "../lib/client";
import { shareInTelegram, telegramHaptic } from "../lib/telegram";
import { useAsar } from "../lib/use-asar";
import { AppHeader, EmptyState, LoadingCard } from "./asar-ui";
import { isTerminalLifecycle } from "../lib/domain";

export function ShareAsar({ id }: { id: string }) {
  const { asar, loading, error } = useAsar(id);
  const [selected, setSelected] = useState("");
  const [fullLink, setFullLink] = useState("");
  const [shortageLink, setShortageLink] = useState("");
  const [message, setMessage] = useState("");
  const make = async (scope: "FULL_ASAR" | "SINGLE_REQUIREMENT", requirementId?: string) => {
    setMessage("");
    try {
      const data = await api<{ invite: { token: string; shareUrl: string } }>(`/api/asars/${id}/invites`, { method: "POST", body: JSON.stringify({ scope, requirementId }) });
      const url = data.invite.shareUrl;
      if (scope === "FULL_ASAR") setFullLink(url); else setShortageLink(url);
      telegramHaptic("success");
      setMessage("Приглашение готово");
      shareInTelegram(url, scope === "FULL_ASAR" ? `Присоединяйтесь к асару «${asar?.title ?? "общее дело"}»` : `Срочно нужна помощь для асара «${asar?.title ?? "общее дело"}»`);
    } catch (caught) { telegramHaptic("error"); setMessage(caught instanceof Error ? caught.message : "Не удалось создать ссылку"); }
  };
  if (loading) return <div className="app-page"><AppHeader /><main className="app-main"><LoadingCard /></main></div>;
  if (!asar || error) return <div className="app-page"><AppHeader /><main className="app-main"><EmptyState title="Асар не найден" text={error} /></main></div>;
  if (isTerminalLifecycle(asar.lifecycleStatus)) return <div className="app-page"><AppHeader /><main className="app-main"><EmptyState title="Асар сохранён в истории" text="Завершённые и отменённые события больше нельзя распространять как живые объявления." action={<Link className="button button-secondary" href={`/app/asars/${id}`}>Вернуться к карточке</Link>} /></main></div>;
  const missing = asar.requirements.filter((item) => item.claimedQuantity < item.requiredQuantity);
  return <div className="app-page"><AppHeader title="Поделиться" /><main className="app-main">
    <div className="page-heading"><div><Link className="text-link" href={`/app/asars/${id}`}>← Вернуться к асару</Link><h1>Позовите только тех,<br />кто сейчас нужен.</h1><p>{asar.title}</p></div></div>
    {message && <div className={message.includes("готово") ? "success-banner" : "error-banner"}>{message}</div>}
    <div className="share-grid">
      <section className="share-card"><span className="share-icon">↗</span><h2>Пригласить в Telegram</h2><p>Откроет чат с ботом, а затем гостевую карточку со всеми свободными ролями.</p>{fullLink && <div className="link-box"><input className="input" readOnly value={fullLink} /></div>}<button className="button button-primary button-block" onClick={() => make("FULL_ASAR")}>{fullLink ? "Отправить ещё раз" : "Отправить приглашение"}</button></section>
      <section className="share-card accent"><span className="share-icon">!</span><h2>Ссылка только на нехватку</h2><p>Новый круг увидит минимум контекста и одну конкретную потребность — без лишних данных.</p>
        <div className="shortage-list">{missing.length ? missing.map((item) => <button className={`shortage-option ${selected === item.id ? "active" : ""}`} onClick={() => setSelected(item.id)} key={item.id}><span><strong>{item.customTitle}</strong><small>Нужно ещё {item.requiredQuantity - item.claimedQuantity}</small></span><span>{item.isCritical ? "Критично" : "Доп."}</span></button>) : <p className="success-banner">Все позиции уже заняты. Ссылка понадобится, если кто-то отменит участие.</p>}</div>
        {shortageLink && <div className="link-box"><input className="input" readOnly value={shortageLink} /></div>}<button className="button button-danger button-block" disabled={!selected} onClick={() => make("SINGLE_REQUIREMENT", selected)}>Создать ссылку нехватки</button>
      </section>
    </div>
  </main></div>;
}
