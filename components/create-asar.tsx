"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/client";
import type { AsarView } from "../lib/types";
import { AppHeader, formatDate } from "./asar-ui";

type RequirementDraft = { kind: "PERSON" | "RESOURCE"; title: string; description: string; requiredQuantity: number; isCritical: boolean };
const initialRequirements: RequirementDraft[] = [
  { kind: "PERSON", title: "Помощники", description: "Помочь с основной работой", requiredQuantity: 2, isCritical: true },
  { kind: "PERSON", title: "Водитель", description: "Приехать к началу", requiredQuantity: 1, isCritical: true },
  { kind: "RESOURCE", title: "Грузовая машина", description: "Для перевозки вещей", requiredQuantity: 1, isCritical: true },
];

export function CreateAsar() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ title: "", description: "", startsAt: "", publicLocation: "", exactAddress: "", beneficiaryConsentConfirmed: false });
  const [requirements, setRequirements] = useState<RequirementDraft[]>(initialRequirements);
  const update = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const updateRequirement = (index: number, patch: Partial<RequirementDraft>) => setRequirements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const next = () => {
    setError("");
    if (step === 1 && (!form.title.trim() || !form.startsAt || !form.beneficiaryConsentConfirmed)) return setError("Укажите название, дату и подтвердите согласие получателя.");
    if (step === 2 && (!requirements.length || requirements.some((item) => !item.title.trim() || item.requiredQuantity < 1) || !requirements.some((item) => item.isCritical))) return setError("Добавьте хотя бы одну корректную критическую потребность.");
    setStep((value) => Math.min(3, value + 1));
  };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const data = await api<{ asar: AsarView }>("/api/asars", { method: "POST", body: JSON.stringify({ ...form, requirements }) });
      router.push(`/app/asars/${data.asar.id}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось создать асар"); setBusy(false); }
  };

  return <div className="app-page"><AppHeader title="Новый асар" /><main className="app-main wizard-shell">
    <div className="page-heading"><div><span className="section-kicker">Создание асара</span><h1>{step === 1 ? "Какое дело соберём?" : step === 2 ? "Что необходимо?" : "Проверьте всё важное"}</h1></div></div>
    <div className="wizard-progress"><i className="done" /><i className={step >= 2 ? "done" : ""} /><i className={step >= 3 ? "done" : ""} /><div className="wizard-step-labels" style={{ gridColumn: "1 / -1" }}><span>Дело</span><span>Потребности</span><span>Предпросмотр</span></div></div>
    {error && <div className="error-banner">{error}</div>}
    {step === 1 && <section className="panel"><h2>Расскажите о деле</h2><p className="panel-lead">Гостям покажем только безопасный публичный контекст. Точный адрес откроется после подтверждения.</p><div className="field-grid">
      <div className="field full"><label htmlFor="title">Название асара *</label><input id="title" className="input" value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Например: подготовить двор апай к зиме" /></div>
      <div className="field full"><label htmlFor="description">Что нужно сделать</label><textarea id="description" className="textarea" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Коротко и конкретно опишите задачу" /></div>
      <div className="field"><label htmlFor="startsAt">Дата и время *</label><input id="startsAt" className="input" type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /></div>
      <div className="field"><label htmlFor="location">Район для гостей</label><input id="location" className="input" value={form.publicLocation} onChange={(event) => update("publicLocation", event.target.value)} placeholder="Алмалинский район" /></div>
      <div className="field full"><label htmlFor="address">Точный адрес</label><input id="address" className="input" value={form.exactAddress} onChange={(event) => update("exactAddress", event.target.value)} placeholder="Откроется только подтверждённым участникам" /></div>
      <label className="checkbox-row field full"><input type="checkbox" checked={form.beneficiaryConsentConfirmed} onChange={(event) => update("beneficiaryConsentConfirmed", event.target.checked)} /><span>Получатель помощи согласен на проведение асара и публикацию минимального описания.</span></label>
    </div></section>}
    {step === 2 && <section className="panel"><h2>Люди и ресурсы</h2><p className="panel-lead">Отметьте критическими те опоры, без которых дело физически не состоится.</p>
      {requirements.map((item, index) => <div className="requirement-editor" key={index}>
        <select className="select" value={item.kind} onChange={(event) => updateRequirement(index, { kind: event.target.value as RequirementDraft["kind"] })}><option value="PERSON">Человек</option><option value="RESOURCE">Ресурс</option></select>
        <input className="input" value={item.title} onChange={(event) => updateRequirement(index, { title: event.target.value })} aria-label="Название потребности" />
        <input className="input" type="number" min="1" value={item.requiredQuantity} onChange={(event) => updateRequirement(index, { requiredQuantity: Number(event.target.value) })} aria-label="Количество" />
        <label className="checkbox-row critical-toggle"><input type="checkbox" checked={item.isCritical} onChange={(event) => updateRequirement(index, { isCritical: event.target.checked })} />Критично</label>
        <button className="icon-button" onClick={() => setRequirements((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Удалить потребность">×</button>
      </div>)}
      <button className="add-row" onClick={() => setRequirements((current) => [...current, { kind: "PERSON", title: "", description: "", requiredQuantity: 1, isCritical: false }])}>+ Добавить потребность</button>
    </section>}
    {step === 3 && <section className="panel"><span className="eyebrow"><i /> Будет создан черновик</span><h2 style={{ marginTop: 18 }}>{form.title}</h2><p className="panel-lead">{form.description || "Без дополнительного описания"}</p><div className="preview-summary"><div><small>Дата и время</small><strong>{formatDate(form.startsAt, true)}</strong></div><div><small>Место</small><strong>{form.publicLocation || "Не указано"}</strong></div><div><small>Потребности</small><strong>{requirements.length} позиций</strong></div><div><small>Критические опоры</small><strong>{requirements.filter((item) => item.isCritical).length}</strong></div></div>
      <div className="requirement-list">{requirements.map((item, index) => <div className="requirement-card" key={index}><div className="requirement-head"><span className="requirement-icon">{item.kind === "PERSON" ? "●" : "◆"}</span><div className="requirement-copy"><h3>{item.title}</h3><p>{item.kind === "PERSON" ? "Люди" : "Ресурс"}{item.isCritical ? " · критически важно" : " · дополнительно"}</p></div><div className="requirement-numbers"><strong>{item.requiredQuantity}</strong><small>нужно</small></div></div></div>)}</div>
    </section>}
    <div className="wizard-actions"><button className="button button-secondary" onClick={() => step === 1 ? router.push("/app/asars") : setStep((value) => value - 1)}>{step === 1 ? "Отмена" : "← Назад"}</button><div className="right">{step < 3 ? <button className="button button-primary" onClick={next}>Продолжить →</button> : <button className="button button-primary" disabled={busy} onClick={submit}>{busy ? "Создаём…" : "Создать асар"}</button>}</div></div>
  </main></div>;
}
