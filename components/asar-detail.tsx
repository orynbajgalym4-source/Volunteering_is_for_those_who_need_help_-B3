"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "../lib/client";
import type { AsarView } from "../lib/types";
import { useAsar } from "../lib/use-asar";
import { AppHeader, EmptyState, formatDate, LoadingCard, ReadinessOrb, StatusBadge } from "./asar-ui";
import { ASAR_CATEGORIES, requirementTypeInfo } from "../lib/catalog";

export function AsarDetail({ id }: { id: string }) {
  const { asar, setAsar, loading, error } = useAsar(id);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const act = async (action: string) => {
    setBusy(action); setMessage("");
    try { const data = await api<{ asar: AsarView }>(`/api/asars/${id}/actions`, { method: "POST", body: JSON.stringify({ action }) }); setAsar(data.asar); }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : "Не удалось выполнить действие"); }
    finally { setBusy(""); }
  };
  if (loading) return <div className="app-page"><AppHeader /><main className="app-main"><LoadingCard /></main></div>;
  if (!asar || error) return <div className="app-page"><AppHeader /><main className="app-main"><EmptyState title="Асар не найден" text={error || "Проверьте ссылку"} /></main></div>;
  const missing = [...asar.readiness.missingCritical, ...asar.readiness.unconfirmedCritical];
  const participants = asar.requirements.reduce((sum, item) => sum + (item.commitments?.filter((commitment) => commitment.status !== "CANCELLED").length ?? 0), 0);
  const readinessTitle = asar.readiness.state === "READY" ? "Все критические опоры подтверждены" : asar.readiness.state === "PROVISIONAL" ? "Роли заняты, ждём подтверждений" : "Асар пока не готов";
  const categoryLabel = ASAR_CATEGORIES.find((item) => item.value === asar.category)?.label ?? "Другое";

  return <div className="app-page"><AppHeader title="Панель асара" /><main className="app-main">
    <div className="page-heading"><div><Link className="text-link" href="/app/asars">← Все асары</Link></div><div className="page-heading-actions"><Link className="button button-secondary" href={`/app/asars/${id}/share`}>Поделиться</Link>{asar.lifecycleStatus === "PUBLISHED" && <Link className="button button-primary" href={`/app/asars/${id}/day`}>Режим дня</Link>}</div></div>
    {message && <div className="error-banner">{message}</div>}
    <div className="detail-grid">
      <section className="hero-panel"><div className="hero-panel-top"><StatusBadge state={asar.lifecycleStatus} /><span className="muted">{formatDate(asar.startsAt)}</span></div><span className="section-kicker">{categoryLabel}</span><h1>{asar.title}</h1><p className="location">{asar.publicLocation} · организатор: {asar.ownerName}</p>
        <div className="readiness-row"><ReadinessOrb state={asar.readiness.state} percent={asar.readiness.percentage} /><div className="readiness-text"><h3>{readinessTitle}</h3><p>{asar.readiness.state === "READY" ? "Система проверила подтверждённые обязательства по всем критическим потребностям." : "Статус изменится автоматически после каждого отклика, подтверждения или отказа."}</p>{missing.length > 0 && <div className="risk-list">Критично: {missing.join(", ")}</div>}</div></div>
      </section>
      <aside className="side-panel"><h3>Управление</h3><div className="action-stack">
        {asar.lifecycleStatus === "DRAFT" && <button className="button button-primary button-block" disabled={Boolean(busy)} onClick={() => act("publish")}>Открыть набор</button>}
        {asar.lifecycleStatus === "PUBLISHED" && <button className="button button-secondary button-block" disabled={Boolean(busy)} onClick={() => act("start")}>Начать асар</button>}
        {asar.lifecycleStatus === "IN_PROGRESS" && <Link className="button button-primary button-block" href={`/app/asars/${id}/complete`}>Завершить дело</Link>}
        {!["COMPLETED", "CANCELLED"].includes(asar.lifecycleStatus) && <button className="button button-plain button-block danger-text" disabled={Boolean(busy)} onClick={() => act("cancel")}>Отменить асар</button>}
      </div><div className="stat-list"><div><span>Потребностей</span><strong>{asar.requirements.length}</strong></div><div><span>Участников</span><strong>{participants}</strong></div><div><span>Критических пробелов</span><strong>{asar.readiness.missingCritical.length}</strong></div></div></aside>
    </div>
    <section className="section-block"><div className="section-heading"><h2>Люди и ресурсы</h2>{missing.length > 0 && asar.lifecycleStatus !== "DRAFT" && <Link className="button button-danger" href={`/app/asars/${id}/share`}>Поделиться нехваткой</Link>}</div>
      <div className="requirement-list">{asar.requirements.map((item) => { const info = requirementTypeInfo(item.type); return <article className="requirement-card" key={item.id}><div className="requirement-head"><span className="requirement-icon">{info.icon}</span><div className="requirement-copy"><h3>{item.customTitle} {item.isCritical && <span className="danger-text">*</span>}</h3><p>{item.description || info.label}</p></div><div className="requirement-numbers"><strong>{item.confirmedQuantity} / {item.requiredQuantity}</strong><small>подтверждено</small></div></div><div className="bar"><i style={{ width: `${Math.min(100, item.confirmedQuantity / item.requiredQuantity * 100)}%` }} /></div>
        {(item.commitments?.length ?? 0) > 0 && <div className="commitment-list">{item.commitments!.map((commitment) => <div className="commitment-row" key={commitment.id}><div className="commitment-person"><strong>{commitment.participantName}</strong><small>{commitment.contactValue} {commitment.comment && `· ${commitment.comment}`}</small></div><StatusBadge state={commitment.status} />{asar.lifecycleStatus === "IN_PROGRESS" && commitment.status === "CONFIRMED" && <Link className="small-button" href={`/app/asars/${id}/day`}>Отметить прибытие</Link>}</div>)}</div>}
      </article>; })}</div>
    </section>
  </main></div>;
}
