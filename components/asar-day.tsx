"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "../lib/client";
import type { AsarView } from "../lib/types";
import { useAsar } from "../lib/use-asar";
import { AppHeader, EmptyState, formatDate, LoadingCard, StatusBadge } from "./asar-ui";

export function AsarDay({ id }: { id: string }) {
  const { asar, setAsar, loading, error } = useAsar(id); const [message, setMessage] = useState("");
  const mark = async (commitmentId: string, action: "attended" | "no-show") => { setMessage(""); try { const data = await api<{ asar: AsarView }>(`/api/asars/${id}/commitments/${commitmentId}`, { method: "POST", body: JSON.stringify({ action }) }); setAsar(data.asar); } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Не удалось обновить прибытие"); } };
  if (loading) return <div className="app-page"><AppHeader /><main className="app-main"><LoadingCard /></main></div>;
  if (!asar || error) return <div className="app-page"><AppHeader /><main className="app-main"><EmptyState title="Асар не найден" text={error} /></main></div>;
  const commitments = asar.requirements.flatMap((requirement) => (requirement.commitments ?? []).map((commitment) => ({ ...commitment, requirementTitle: requirement.customTitle })));
  return <div className="app-page"><AppHeader title="День асара" /><main className="app-main"><div className="page-heading"><div><Link className="text-link" href={`/app/asars/${id}`}>← Панель асара</Link><h1>Сегодня делаем вместе.</h1><p>{formatDate(asar.startsAt, true)} · {asar.exactAddress || asar.publicLocation}</p></div><Link className="button button-primary" href={`/app/asars/${id}/complete`}>Завершить асар</Link></div>{message && <div className="error-banner">{message}</div>}
    <section className="panel"><div className="section-heading"><h2>Чек‑лист прибытия</h2><StatusBadge state={asar.lifecycleStatus} /></div><p className="panel-lead">Отмечайте факт, а не обещание. Только прибывшие участники замыкают контур исполнения.</p><div className="day-list">{commitments.length ? commitments.map((item) => <div className="day-row" key={item.id}><div><h3>{item.participantName} · {item.requirementTitle}</h3><p>{item.contactValue} {item.comment && `· ${item.comment}`}</p></div><div className="day-actions"><button className={`small-button ${item.status === "ATTENDED" ? "arrived" : ""}`} onClick={() => mark(item.id, "attended")} disabled={["CANCELLED", "NO_SHOW"].includes(item.status)}>✓ Прибыл</button><button className={`small-button ${item.status === "NO_SHOW" ? "absent" : ""}`} onClick={() => mark(item.id, "no-show")} disabled={["CANCELLED", "ATTENDED"].includes(item.status)}>Не пришёл</button></div></div>) : <EmptyState title="Пока никто не записался" text="Вернитесь к панели и отправьте гостевую ссылку." />}</div></section>
  </main></div>;
}
