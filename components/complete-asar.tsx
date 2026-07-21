"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/client";
import { useAsar } from "../lib/use-asar";
import { AppHeader, EmptyState, LoadingCard } from "./asar-ui";
import { OfferSelector } from "./member-offers";
import type { MemberOffer } from "../lib/member-offers";

export function CompleteAsar({ id }: { id: string }) {
  const router = useRouter(); const { asar, loading, error } = useAsar(id); const [outcome, setOutcome] = useState("FULL"); const [note, setNote] = useState(""); const [offers, setOffers] = useState<MemberOffer[] | undefined>(undefined); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const complete = async () => { setBusy(true); setMessage(""); try { await api(`/api/asars/${id}/actions`, { method: "POST", body: JSON.stringify({ action: "complete", outcome, note, ...(offers !== undefined ? { offers } : {}) }) }); router.push(`/app/asars/${id}`); } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Не удалось завершить асар"); setBusy(false); } };
  if (loading) return <div className="app-page"><AppHeader /><main className="app-main"><LoadingCard /></main></div>;
  if (!asar || error) return <div className="app-page"><AppHeader /><main className="app-main"><EmptyState title="Асар не найден" text={error} /></main></div>;
  const attended = asar.requirements.flatMap((item) => item.commitments ?? []).filter((item) => item.status === "ATTENDED").length;
  return <div className="app-page"><AppHeader title="Завершение" /><main className="app-main wizard-shell"><div className="page-heading"><div><Link className="text-link" href={`/app/asars/${id}`}>← Вернуться к асару</Link><h1>Зафиксируйте результат.</h1><p>Асар закрывается только после фактического итога — не по количеству обещаний.</p></div></div>{message && <div className="error-banner">{message}</div>}<section className="panel"><h2>{asar.title}</h2><p className="panel-lead">Фактически прибыло: {attended}. Выберите честный итог общего дела.</p><div className="shortage-list">{[["FULL","Выполнено полностью","Все основные задачи завершены"],["PARTIAL","Выполнено частично","Удалось сделать часть задуманного"]].map(([value,title,copy]) => <button className={`shortage-option ${outcome === value ? "active" : ""}`} onClick={() => setOutcome(value)} key={value}><span><strong>{title}</strong><small>{copy}</small></span><span>{outcome === value ? "●" : "○"}</span></button>)}</div><div className="field" style={{ marginTop: 20 }}><label htmlFor="note">Короткий итог</label><textarea id="note" className="textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Что получилось и что осталось сделать?" /></div></section>
    <section className="panel follow-up-panel"><span className="section-kicker">После этого асара</span><h2>С чем к вам можно обратиться снова?</h2><p className="panel-lead">Это относится к вашему профилю человека, а не к отдельному кругу. Выбор можно изменить позже.</p><OfferSelector value={offers ?? []} onChange={setOffers} />{offers !== undefined && <button type="button" className="text-action" onClick={() => setOffers(undefined)}>Не менять мой профиль</button>}</section>
    <button className="button button-primary button-large button-block" disabled={busy} onClick={complete}>{busy ? "Закрываем…" : "Завершить асар"}</button>
  </main></div>;
}
