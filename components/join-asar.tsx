"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/client";
import type { AsarView } from "../lib/types";
import { Brand, EmptyState, LoadingCard, StatusBadge } from "./asar-ui";
import { getTelegramProfile, telegramHaptic } from "../lib/telegram";
import { isIndividualContribution, requirementTypeInfo } from "../lib/catalog";
import { isTerminalLifecycle } from "../lib/domain";
import { GroupAvatar } from "./group-ui";
import { formatAsarSchedule } from "../lib/schedule";

export function JoinAsar({ token }: { token: string }) {
  const [asar, setAsar] = useState<AsarView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState({ participantName: "", contactType: "TELEGRAM", contactValue: "", quantity: 1, comment: "", reminderOptIn: false });
  const [busy, setBusy] = useState(false);
  const [manageToken, setManageToken] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [telegramIdentity, setTelegramIdentity] = useState(false);
  useEffect(() => {
    const profile = getTelegramProfile();
    if (profile) queueMicrotask(() => { setTelegramIdentity(true); setForm((current) => ({
        ...current,
        participantName: [profile.firstName, profile.lastName].filter(Boolean).join(" "),
        contactType: "TELEGRAM",
        contactValue: profile.username ? `@${profile.username}` : `Telegram ID ${profile.id}`,
      })); });
    api<{ asar: AsarView }>(`/api/public/invites/${token}`).then((data) => { setAsar(data.asar); const first = [...data.asar.requirements].sort((a, b) => Number(b.isCritical) - Number(a.isCritical)).find((item) => item.claimedQuantity < item.requiredQuantity); if (first) setSelected(first.id); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Приглашение недоступно")).finally(() => setLoading(false));
  }, [token]);
  const requirement = useMemo(() => asar?.requirements.find((item) => item.id === selected), [asar, selected]);
  const historical = Boolean(asar && isTerminalLifecycle(asar.lifecycleStatus));
  const submit = async () => {
    setBusy(true); setError("");
    try { const data = await api<{ manageToken: string; commitment: { status: string } }>(`/api/public/invites/${token}`, { method: "POST", body: JSON.stringify({ ...form, requirementId: selected, quantity: isIndividualContribution(requirement?.type) ? 1 : form.quantity }) }); telegramHaptic("success"); setConfirmed(data.commitment.status === "CONFIRMED"); setManageToken(data.manageToken); }
    catch (caught) { telegramHaptic("error"); setError(caught instanceof Error ? caught.message : "Не удалось записаться"); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="guest-page"><div className="guest-shell"><div className="guest-top"><Brand compact /></div><LoadingCard /></div></div>;
  if (!asar) return <div className="guest-page"><div className="guest-shell"><div className="guest-top"><Brand compact /></div><EmptyState title="Ссылка недоступна" text={error} /></div></div>;
  if (manageToken) return <div className="guest-page"><div className="guest-shell"><div className="guest-top"><Brand compact /><small>{confirmed ? "Участие подтверждено" : "Ваш вклад сохранён"}</small></div><div className="guest-card confirmation-card"><div className="confirmation-check">✓</div><h2>{confirmed ? "Вы участвуете в асаре." : "Спасибо, вы взяли ответственность."}</h2><p>{confirmed ? "Telegram-профиль подтвердил вашу личность. Откройте детали, чтобы увидеть точный адрес и при необходимости отменить участие." : "Подтвердите участие по личной ссылке — после этого откроется точный адрес."}</p><Link className="button button-primary button-large" href={`/commitment/${manageToken}`}>{confirmed ? "Открыть детали участия" : "Перейти к подтверждению"}</Link><p className="privacy-note">Участие в асаре не добавляет вас в круг организатора.</p></div></div></div>;
  return <div className="guest-page"><div className="guest-shell"><div className="guest-top"><Brand compact /><small>Приглашение от {asar.ownerName}</small></div><article className="guest-card">
    <header className="guest-hero"><span className="eyebrow"><i /> {asar.inviteScope === "SINGLE_REQUIREMENT" ? "Срочно нужна одна опора" : "Локальный асар"}</span><h1>{asar.title}</h1>{asar.group && <div className="guest-group"><GroupAvatar group={asar.group} size="small" /><span><small>Круг</small><strong>{asar.group.name}</strong></span></div>}<div className="guest-meta"><span>◷ {formatAsarSchedule(asar.startsAt, asar.timeMode, true)}</span><span>⌖ {asar.publicLocation}</span><span>Инициатор: {asar.ownerName}</span></div>{asar.description && <p className="panel-lead" style={{ marginTop: 20, marginBottom: 0 }}>{asar.description}</p>}</header>
    <div className="guest-body">{historical ? <div className="history-notice"><StatusBadge state={asar.lifecycleStatus} /><h2>{asar.lifecycleStatus === "CANCELLED" ? "Этот асар не состоялся" : "Этот асар уже прошёл"}</h2><p>Карточка сохранена как история. Присоединение и отправка новых откликов отключены.</p></div> : <><h2>{asar.inviteScope === "SINGLE_REQUIREMENT" ? "Поможете закрыть нехватку?" : "Выберите конкретный вклад"}</h2><p>Нажмите на подходящую карточку. После отклика вы отдельно подтвердите участие.</p>{error && <div className="error-banner">{error}</div>}
      <div className="guest-requirements">{asar.requirements.map((item) => { const free = item.requiredQuantity - item.claimedQuantity; const info = requirementTypeInfo(item.type); return <button className={`guest-option ${selected === item.id ? "selected" : ""}`} disabled={free <= 0} onClick={() => setSelected(item.id)} key={item.id}><span>{info.icon}</span><div><strong>{item.customTitle} {item.isCritical && <span className="danger-text">*</span>}</strong><small>{item.description || info.label}</small></div>{free > 0 ? <b>{free} своб.</b> : <StatusBadge state="READY" />}</button>; })}</div>
      {requirement && <div className="claim-form"><h3>{telegramIdentity ? "Подтвердите участие" : "Как с вами связаться?"}</h3><p className="claim-explainer">{telegramIdentity ? `Вы входите как ${form.participantName}. Останется добавить необязательный комментарий и подтвердить выбранную обязанность.` : "Эти данные увидит только инициатор асара."}</p><div className="field-grid">{!telegramIdentity && <><div className="field full"><label>Ваше имя *</label><input className="input" value={form.participantName} onChange={(event) => setForm({ ...form, participantName: event.target.value })} placeholder="Айдос" /></div><div className="field full"><span>Способ связи</span><div className="segmented-choice"><button type="button" className={form.contactType === "TELEGRAM" ? "selected" : ""} onClick={() => setForm({ ...form, contactType: "TELEGRAM" })}>Telegram</button><button type="button" className={form.contactType === "PHONE" ? "selected" : ""} onClick={() => setForm({ ...form, contactType: "PHONE", reminderOptIn: false })}>Телефон</button></div></div><div className="field full"><label>Куда написать или позвонить? *</label><input className="input" value={form.contactValue} onChange={(event) => setForm({ ...form, contactValue: event.target.value })} placeholder={form.contactType === "TELEGRAM" ? "@username" : "+7 700 000 00 00"} /></div></>}{!isIndividualContribution(requirement.type) && requirement.requiredQuantity > 1 && <div className="field full"><span>Сколько единиц вы можете привезти?</span><div className="quantity-stepper"><button type="button" onClick={() => setForm({ ...form, quantity: Math.max(1, form.quantity - 1) })} disabled={form.quantity <= 1}>−</button><strong>{form.quantity}</strong><button type="button" onClick={() => setForm({ ...form, quantity: Math.min(requirement.requiredQuantity - requirement.claimedQuantity, form.quantity + 1) })} disabled={form.quantity >= requirement.requiredQuantity - requirement.claimedQuantity}>+</button></div></div>}<div className="field full"><label>Комментарий <small>(необязательно)</small></label><textarea className="textarea" value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} placeholder="Например: буду на минивэне" /></div>{telegramIdentity && <label className="checkbox-card reminder-consent field full"><input type="checkbox" checked={form.reminderOptIn} onChange={(event) => setForm({ ...form, reminderOptIn: event.target.checked })} /><span><strong>Можно один раз написать мне перед началом асара</strong><small>Инициатор сможет вручную запустить контрольную перекличку. По умолчанию сообщения выключены.</small></span></label>}</div><button className="button button-primary button-large button-block" disabled={busy || !form.participantName.trim() || !form.contactValue.trim()} onClick={submit}>{busy ? "Подтверждаем…" : telegramIdentity ? `Подтвердить роль «${requirement.customTitle}»` : `Взять роль «${requirement.customTitle}»`}</button><p className="privacy-note">Точный адрес увидят только подтверждённые участники. Членство в круге не создаётся автоматически.</p></div>}</>}
    </div>
  </article></div></div>;
}
