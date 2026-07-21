"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/client";
import type { AsarTimeMode, AsarView, GroupSummary } from "../lib/types";
import { ASAR_CATEGORIES, REQUIREMENT_TYPES, requirementTypeInfo, type AsarCategory, type RequirementType } from "../lib/catalog";
import { telegramHaptic } from "../lib/telegram";
import { AppHeader } from "./asar-ui";
import { GroupCreator } from "./group-creator";
import { GroupCard } from "./group-ui";
import { ASAR_TIME_MODES, buildScheduleStart, formatAsarSchedule, scheduleIsFuture } from "../lib/schedule";

type RequirementDraft = { type: RequirementType; customTitle: string; description: string; requiredQuantity: number; isCritical: boolean };
const initialRequirements: RequirementDraft[] = [
  { type: "GENERAL_HELP", customTitle: "Помощники", description: "Помочь с основной работой", requiredQuantity: 2, isCritical: true },
];
const TIME_OPTIONS = Array.from({ length: 72 }, (_, index) => {
  const minutes = 6 * 60 + index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export function CreateAsar({ initialGroupId = "" }: { initialGroupId?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const minimumDate = useMemo(() => {
    const current = new Date(now);
    const offset = current.getTimezoneOffset() * 60_000;
    return new Date(current.getTime() - offset).toISOString().slice(0, 10);
  }, [now]);
  const [form, setForm] = useState<{ groupId: string; category: AsarCategory; title: string; description: string; startsAt: string; timeMode: AsarTimeMode; exactTime: string; publicLocation: string; exactAddress: string; beneficiaryConsentConfirmed: boolean }>({ groupId: initialGroupId, category: "MOVE_TRANSPORT", title: "", description: "", startsAt: "", timeMode: "EXACT", exactTime: "", publicLocation: "", exactAddress: "", beneficiaryConsentConfirmed: false });
  const [requirements, setRequirements] = useState<RequirementDraft[]>(initialRequirements);
  const update = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const updateRequirement = (index: number, patch: Partial<RequirementDraft>) => setRequirements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  useEffect(() => {
    api<{ groups: GroupSummary[] }>("/api/groups").then((data) => {
      setGroups(data.groups);
      setForm((current) => ({ ...current, groupId: data.groups.some((group) => group.id === current.groupId) ? current.groupId : "" }));
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "Не удалось загрузить круги")).finally(() => setGroupsLoading(false));
  }, [initialGroupId]);
  const changeQuantity = (index: number, delta: number) => updateRequirement(index, { requiredQuantity: Math.max(1, requirements[index].requiredQuantity + delta) });
  const next = () => {
    setError("");
    if (step === 1 && !form.groupId) return setError("Выберите или создайте круг для асара.");
    if (step === 2 && (!form.title.trim() || !form.startsAt || (form.timeMode === "EXACT" && !form.exactTime) || !form.beneficiaryConsentConfirmed)) return setError("Укажите название, дату, подходящий период и подтвердите согласие получателя.");
    if (step === 2 && !scheduleIsFuture(form.startsAt, form.timeMode, form.exactTime, now)) return setError("Выбранный период уже прошёл. Укажите будущую дату или время.");
    if (step === 3 && (!requirements.length || requirements.some((item) => !item.customTitle.trim() || item.requiredQuantity < 1) || !requirements.some((item) => item.isCritical))) return setError("Добавьте хотя бы одну корректную критическую потребность.");
    setStep((value) => Math.min(4, value + 1));
  };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const startsAt = buildScheduleStart(form.startsAt, form.timeMode, form.exactTime);
      const data = await api<{ asar: AsarView }>("/api/asars", { method: "POST", body: JSON.stringify({ ...form, startsAt, requirements }) });
      telegramHaptic("success");
      router.push(`/app/asars/${data.asar.id}`);
    } catch (caught) { telegramHaptic("error"); setError(caught instanceof Error ? caught.message : "Не удалось создать асар"); setBusy(false); }
  };

  return <div className="app-page"><AppHeader title="Новый асар" /><main className="app-main wizard-shell">
    <div className="page-heading"><div><span className="section-kicker">Создание асара</span><h1>{step === 1 ? "В каком круге?" : step === 2 ? "Какое дело соберём?" : step === 3 ? "Что необходимо?" : "Проверьте всё важное"}</h1></div></div>
    <div className="wizard-progress wizard-progress-four"><i className="done" /><i className={step >= 2 ? "done" : ""} /><i className={step >= 3 ? "done" : ""} /><i className={step >= 4 ? "done" : ""} /><div className="wizard-step-labels" style={{ gridColumn: "1 / -1" }}><span>Круг</span><span>Дело</span><span>Потребности</span><span>Проверка</span></div></div>
    {error && <div className="error-banner"><span>{error}</span>{error.includes("старой кнопкой") && <a href="https://t.me/asar_ops_bot?start=app">Получить новую кнопку</a>}</div>}
    {step === 1 && <section className="panel"><h2>{creatingGroup ? "Новый круг" : "Выберите свой круг"}</h2><p className="panel-lead">Каждый асар проходит внутри круга. Так участники видят людей, связанные дела и общую историю.</p>{creatingGroup ? <GroupCreator onCreated={(group) => { setGroups((current) => [group, ...current]); setForm((current) => ({ ...current, groupId: group.id })); setCreatingGroup(false); }} onCancel={() => setCreatingGroup(false)} /> : <>{groupsLoading ? <div className="loading-inline">Загружаем круги…</div> : groups.length ? <div className="group-choice-list">{groups.map((group) => <GroupCard group={group} selected={form.groupId === group.id} onSelect={() => setForm((current) => ({ ...current, groupId: group.id }))} key={group.id} />)}</div> : <div className="group-empty"><span>А</span><h3>Сначала создайте круг</h3><p>Например: семья, соседи дома, волонтёрская команда или сообщество района.</p></div>}<button type="button" className="add-row" onClick={() => setCreatingGroup(true)}>+ Создать новый круг</button></>}</section>}
    {step === 2 && <section className="panel"><h2>Расскажите о деле</h2><p className="panel-lead">Гостям покажем только безопасный публичный контекст. Точный адрес откроется после подтверждения.</p><div className="field-grid">
      <div className="field full"><span className="field-label">Ближайший сценарий *</span><div className="category-grid">{ASAR_CATEGORIES.map((item) => <button type="button" className={`category-option ${form.category === item.value ? "selected" : ""}`} aria-pressed={form.category === item.value} onClick={() => setForm((current) => ({ ...current, category: item.value }))} key={item.value}><span>{item.icon}</span><strong>{item.label}</strong><small>{item.hint}</small></button>)}</div><small className="field-hint">Сценарий помогает начать, но не ограничивает описание асара.</small></div>
      <div className="field full"><label htmlFor="title">Название асара *</label><input id="title" className="input" value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Например: подготовить двор апай к зиме" /></div>
      <div className="field full"><label htmlFor="description">Что нужно сделать</label><textarea id="description" className="textarea" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Коротко и конкретно опишите задачу" /></div>
      <div className="field full schedule-builder"><label htmlFor="startsAt">Когда состоится асар? *</label><input id="startsAt" className="input" type="date" min={minimumDate} value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /><div className="time-mode-grid" role="radiogroup" aria-label="Точность времени">{ASAR_TIME_MODES.map((mode) => <button type="button" role="radio" aria-checked={form.timeMode === mode.value} className={form.timeMode === mode.value ? "selected" : ""} onClick={() => setForm((current) => ({ ...current, timeMode: mode.value }))} key={mode.value}><strong>{mode.label}</strong><small>{mode.hint}</small></button>)}</div>{form.timeMode === "EXACT" && <label className="exact-time-field"><span>Время начала</span><select className="input" value={form.exactTime} onChange={(event) => update("exactTime", event.target.value)}><option value="">Выберите время</option>{TIME_OPTIONS.map((time) => { const expired = form.startsAt === minimumDate && !scheduleIsFuture(form.startsAt, "EXACT", time, now); return <option value={time} disabled={expired} key={time}>{time}</option>; })}</select></label>}<small className="field-hint">Дата проверяется в реальном времени. Для гибкого режима участники увидят период, а не искусственно точные минуты.</small></div>
      <div className="field"><label htmlFor="location">Район для гостей</label><input id="location" className="input" value={form.publicLocation} onChange={(event) => update("publicLocation", event.target.value)} placeholder="Алмалинский район" /></div>
      <div className="field full"><label htmlFor="address">Точный адрес</label><input id="address" className="input" value={form.exactAddress} onChange={(event) => update("exactAddress", event.target.value)} placeholder="Откроется только подтверждённым участникам" /></div>
      <label className="checkbox-row field full"><input type="checkbox" checked={form.beneficiaryConsentConfirmed} onChange={(event) => update("beneficiaryConsentConfirmed", event.target.checked)} /><span>Получатель помощи согласен на проведение асара и публикацию минимального описания.</span></label>
    </div></section>}
    {step === 3 && <section className="panel"><h2>Что понадобится?</h2><p className="panel-lead">Каждая карточка — один понятный вклад. Сначала выберите тип, затем напишите конкретно, кого или что ищете.</p>
      {requirements.map((item, index) => <div className="requirement-editor-v2" key={index}>
        <div className="requirement-editor-top"><strong>Потребность {index + 1}</strong><button className="icon-button" type="button" onClick={() => setRequirements((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Удалить потребность">×</button></div>
        <div className="field full"><span>Тип вклада *</span><div className="type-choice" role="group" aria-label={`Тип потребности ${index + 1}`}>{REQUIREMENT_TYPES.map((type) => <button type="button" className={item.type === type.value ? "selected" : ""} aria-pressed={item.type === type.value} onClick={() => updateRequirement(index, { type: type.value })} key={type.value}><span>{type.icon}</span>{type.label}</button>)}</div></div>
        <div className="requirement-fields"><div className="field"><label htmlFor={`requirement-title-${index}`}>Кого или что ищем? *</label><input id={`requirement-title-${index}`} className="input" value={item.customTitle} onChange={(event) => updateRequirement(index, { customTitle: event.target.value })} placeholder="Например: электрик" /><small className="field-hint">Это название увидят участники в карточке.</small></div>
        <div className="field"><label htmlFor={`requirement-description-${index}`}>Что именно нужно?</label><input id={`requirement-description-${index}`} className="input" value={item.description} onChange={(event) => updateRequirement(index, { description: event.target.value })} placeholder="Например: подключить уличный свет" /><small className="field-hint">Коротко уточните задачу или характеристики.</small></div></div>
        <div className="requirement-controls"><div className="field"><span>{item.type === "GENERAL_HELP" || item.type === "SPECIALIST" ? "Сколько человек нужно?" : "Сколько единиц нужно?"}</span><div className="quantity-stepper"><button type="button" onClick={() => changeQuantity(index, -1)} disabled={item.requiredQuantity <= 1} aria-label="Уменьшить количество">−</button><strong>{item.requiredQuantity}</strong><button type="button" onClick={() => changeQuantity(index, 1)} aria-label="Увеличить количество">+</button></div></div><label className="checkbox-card"><input type="checkbox" checked={item.isCritical} onChange={(event) => updateRequirement(index, { isCritical: event.target.checked })} /><span><strong>Без этого асар не состоится</strong><small>Отметьте только действительно критичный вклад.</small></span></label></div>
      </div>)}
      <button className="add-row" onClick={() => setRequirements((current) => [...current, { type: "GENERAL_HELP", customTitle: "", description: "", requiredQuantity: 1, isCritical: false }])}>+ Добавить потребность</button>
    </section>}
    {step === 4 && <section className="panel"><span className="eyebrow"><i /> Будет создан черновик</span>{groups.find((group) => group.id === form.groupId) && <div className="preview-group"><GroupCard group={groups.find((group) => group.id === form.groupId)!} selected onSelect={() => undefined} /></div>}<h2 style={{ marginTop: 18 }}>{form.title}</h2><p className="panel-lead">{form.description || "Без дополнительного описания"}</p><div className="preview-summary"><div><small>Дата и время</small><strong>{formatAsarSchedule(buildScheduleStart(form.startsAt, form.timeMode, form.exactTime), form.timeMode, true)}</strong></div><div><small>Место</small><strong>{form.publicLocation || "Не указано"}</strong></div><div><small>Потребности</small><strong>{requirements.length} позиций</strong></div><div><small>Критические опоры</small><strong>{requirements.filter((item) => item.isCritical).length}</strong></div></div>
      <div className="requirement-list">{requirements.map((item, index) => { const info = requirementTypeInfo(item.type); return <div className="requirement-card" key={index}><div className="requirement-head"><span className="requirement-icon">{info.icon}</span><div className="requirement-copy"><h3>{item.customTitle}</h3><p>{info.label}{item.isCritical ? " · критически важно" : " · дополнительно"}</p></div><div className="requirement-numbers"><strong>{item.requiredQuantity}</strong><small>нужно</small></div></div></div>; })}</div>
    </section>}
    {!creatingGroup && <div className="wizard-actions"><button className="button button-secondary" onClick={() => step === 1 ? router.push("/app/asars") : setStep((value) => value - 1)}>{step === 1 ? "Отмена" : "← Назад"}</button><div className="right">{step < 4 ? <button className="button button-primary" onClick={next}>Продолжить →</button> : <button className="button button-primary" disabled={busy} onClick={submit}>{busy ? "Создаём…" : "Создать асар"}</button>}</div></div>}
  </main></div>;
}
