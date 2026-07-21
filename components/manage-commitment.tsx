"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/client";
import type { Readiness } from "../lib/domain";
import type { AsarTimeMode } from "../lib/types";
import { formatAsarSchedule } from "../lib/schedule";
import { telegramHaptic } from "../lib/telegram";
import { Brand, EmptyState, LoadingCard, StatusBadge } from "./asar-ui";

type Managed = {
  id: string;
  participantName: string;
  contactValue: string;
  quantity: number;
  comment: string;
  status: string;
  requirementTitle: string;
  asar: { id: string; title: string; startsAt: string; timeMode: AsarTimeMode; publicLocation: string; exactAddress?: string; lifecycleStatus: string };
};
type AsarStatus = { lifecycleStatus: string; readiness: Readiness };
type ManagedResponse = { commitment: Managed; asarStatus: AsarStatus | null };

function participationCopy(status: string) {
  if (status === "CONFIRMED") return { title: "Ваше участие подтверждено", text: "Организатор рассчитывает на ваш вклад.", tone: "success" };
  if (status === "ATTENDED") return { title: "Участие состоялось", text: "Ваш вклад сохранён в истории асара.", tone: "success" };
  if (status === "CANCELLED") return { title: "Вы отменили участие", text: "Организатор уже видит, что роль снова свободна.", tone: "danger" };
  if (status === "NO_SHOW") return { title: "Участие не состоялось", text: "В истории отмечено, что вы не смогли прийти.", tone: "danger" };
  return { title: "Ждём вашего подтверждения", text: "Подтвердите участие, чтобы организатор учитывал вас в готовности.", tone: "waiting" };
}

function asarStatusCopy(status: AsarStatus | null) {
  if (!status) return { label: "Статус уточняется", text: "Обновите страницу через несколько секунд.", badge: "DRAFT" };
  if (status.lifecycleStatus === "CANCELLED") return { label: "Асар отменён", text: "Дело не состоится. Новых действий от участников не требуется.", badge: "CANCELLED" };
  if (status.lifecycleStatus === "COMPLETED") return { label: "Асар завершён", text: "Дело состоялось и сохранено в истории.", badge: "COMPLETED" };
  if (status.lifecycleStatus === "EXPIRED") return { label: "Время прошло", text: "Организатор ещё фиксирует итог дела.", badge: "EXPIRED" };
  if (status.lifecycleStatus === "IN_PROGRESS") return { label: "Асар идёт сейчас", text: "Участники уже приступили к общему делу.", badge: "IN_PROGRESS" };
  if (status.lifecycleStatus === "DRAFT") return { label: "Асар готовится", text: "Организатор ещё не открыл набор.", badge: "DRAFT" };
  if (status.readiness.state === "READY") return { label: "Всё готово к старту", text: "Все критические роли подтверждены. Организатор может начать раньше.", badge: "READY" };
  if (status.readiness.state === "PROVISIONAL") return { label: "Ждём подтверждений", text: "Критические роли заняты, но не все участники подтвердились.", badge: "PROVISIONAL" };
  return { label: "Идёт набор", text: status.readiness.missingCritical.length ? `Ещё нужны: ${status.readiness.missingCritical.join(", ")}.` : "Организатор продолжает собирать людей и ресурсы.", badge: "PUBLISHED" };
}

export function ManageCommitment({ token }: { token: string }) {
  const [item, setItem] = useState<Managed | null>(null);
  const [asarStatus, setAsarStatus] = useState<AsarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    api<ManagedResponse>(`/api/public/commitments/${token}`)
      .then((data) => { setItem(data.commitment); setAsarStatus(data.asarStatus); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Ссылка недоступна"))
      .finally(() => setLoading(false));
  }, [token]);

  const act = async (action: string) => {
    setBusy(true); setError("");
    try {
      const data = await api<ManagedResponse>(`/api/public/commitments/${token}`, { method: "POST", body: JSON.stringify({ action }) });
      telegramHaptic(action === "confirm" ? "success" : "light");
      setItem(data.commitment); setAsarStatus(data.asarStatus);
      setToast(action === "confirm" ? "Участие подтверждено" : "Участие отменено — организатор уже видит изменение");
      window.setTimeout(() => setToast(""), 3500);
    } catch (caught) { telegramHaptic("error"); setError(caught instanceof Error ? caught.message : "Не удалось обновить участие"); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="guest-page"><div className="guest-shell"><div className="guest-top"><Brand compact /></div><LoadingCard /></div></div>;
  if (!item) return <div className="guest-page"><div className="guest-shell"><div className="guest-top"><Brand compact /></div><EmptyState title="Ссылка недоступна" text={error} /></div></div>;

  const participation = participationCopy(item.status);
  const event = asarStatusCopy(asarStatus);
  return <div className="guest-page"><div className="guest-shell"><div className="guest-top"><Brand compact /><small>Моё участие</small></div><section className="manage-card">
    <div className="manage-card-heading"><StatusBadge state={item.status} /><span>Вклад: {item.requirementTitle}</span></div><h1>{item.asar.title}</h1><p className="panel-lead">{item.participantName}, здесь собраны только ваши данные участия и актуальное состояние общего дела.</p>
    {error && <div className="error-banner">{error}</div>}
    <section className={`participation-state participation-state-${participation.tone}`}><span>{participation.tone === "success" ? "✓" : participation.tone === "danger" ? "!" : "○"}</span><div><small>Ваше участие</small><strong>{participation.title}</strong><p>{participation.text}</p></div></section>
    <div className="manage-facts"><div><small>Когда</small><strong>{formatAsarSchedule(item.asar.startsAt, item.asar.timeMode, true)}</strong></div><div><small>Где</small><strong>{item.asar.publicLocation}</strong></div><div><small>Ваш вклад</small><strong>{item.requirementTitle} · {item.quantity}</strong></div><div><small>Контакт</small><strong>{item.contactValue}</strong></div></div>
    <section className="asar-status-card"><div className="asar-status-heading"><div><small>Статус асара</small><strong>{event.label}</strong></div><StatusBadge state={event.badge} /></div><p>{event.text}</p>{asarStatus && <div className="asar-status-progress"><i style={{ width: `${asarStatus.readiness.percentage}%` }} /><span>{asarStatus.readiness.percentage}% готовности</span></div>}</section>
    {item.asar.exactAddress ? <div className="exact-address"><strong>Точный адрес:</strong> {item.asar.exactAddress}</div> : item.status === "CLAIMED" && <div className="error-banner">Точный адрес откроется после подтверждения участия.</div>}
    {item.status === "CLAIMED" && <button className="button button-success button-large button-block" disabled={busy} onClick={() => void act("confirm")}>{busy ? "Подтверждаем…" : "Подтвердить участие"}</button>}
    {["CLAIMED", "CONFIRMED"].includes(item.status) && !["COMPLETED", "CANCELLED", "EXPIRED"].includes(asarStatus?.lifecycleStatus ?? "") && <button className="button button-plain button-block danger-text" disabled={busy} onClick={() => void act("cancel")}>Не смогу участвовать</button>}
    <div className="manage-app-cta"><div><strong>Всё остальное — в Asar</strong><p>Откройте главную страницу, чтобы увидеть свои круги, асары и историю участия.</p></div><Link className="button button-primary button-large" href="/">Перейти в Asar →</Link></div>
  </section>{toast && <div className="toast">{toast}</div>}</div></div>;
}
