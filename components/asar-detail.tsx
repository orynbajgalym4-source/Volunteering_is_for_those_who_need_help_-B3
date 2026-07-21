"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "../lib/client";
import type { AsarView } from "../lib/types";
import { useAsar } from "../lib/use-asar";
import { AppHeader, EmptyState, formatDate, LoadingCard, ReadinessOrb, StatusBadge } from "./asar-ui";
import { ASAR_CATEGORIES, requirementTypeInfo } from "../lib/catalog";
import { isTerminalLifecycle } from "../lib/domain";
import { telegramHaptic } from "../lib/telegram";
import { GroupAvatar } from "./group-ui";

type InviteResponse = { invite: { publicUrl?: string; shareUrl: string; telegramUrl?: string } };

function telegramProfileUrl(value?: string) {
  const username = value?.trim().replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "");
  return username && /^[a-zA-Z0-9_]{5,}$/.test(username) ? `https://t.me/${username}` : "";
}

export function AsarDetail({ id }: { id: string }) {
  const { asar, setAsar, loading, error } = useAsar(id);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [renderedAt] = useState(() => Date.now());

  const act = async (action: string) => {
    const data = await api<{ asar: AsarView }>(`/api/asars/${id}/actions`, { method: "POST", body: JSON.stringify({ action }) });
    setAsar(data.asar);
    return data.asar;
  };

  const share = async (publishFirst = false) => {
    setBusy(publishFirst ? "publish" : "share");
    setMessage("");
    try {
      const current = publishFirst ? await act("publish") : asar;
      const data = await api<InviteResponse>(`/api/asars/${id}/invites`, { method: "POST", body: JSON.stringify({ scope: "FULL_ASAR" }) });
      const url = data.invite.publicUrl ?? data.invite.shareUrl;
      setShareUrl(url);
      telegramHaptic("success");
      const payload = { title: current?.title ?? "Асар", text: `Присоединяйтесь к асару «${current?.title ?? "общее дело"}»`, url };
      if (navigator.share) {
        try { await navigator.share(payload); } catch (caught) { if (!(caught instanceof DOMException && caught.name === "AbortError")) throw caught; }
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("Общая ссылка скопирована. Её можно отправить в любой мессенджер.");
      }
    } catch (caught) {
      telegramHaptic("error");
      setMessage(caught instanceof Error ? caught.message : "Не удалось подготовить ссылку");
    } finally { setBusy(""); }
  };

  const transition = async (action: string) => {
    setBusy(action);
    setMessage("");
    try { await act(action); telegramHaptic("success"); }
    catch (caught) { telegramHaptic("error"); setMessage(caught instanceof Error ? caught.message : "Не удалось выполнить действие"); }
    finally { setBusy(""); }
  };

  const cancel = () => {
    if (window.confirm("Отменить асар? Это означает, что дело не состоится. Все приглашения перестанут принимать отклики.")) void transition("cancel");
  };

  const toggleCard = (requirementId: string) => setFlipped((current) => {
    const next = new Set(current);
    if (next.has(requirementId)) next.delete(requirementId); else next.add(requirementId);
    return next;
  });

  if (loading) return <div className="app-page"><AppHeader /><main className="app-main"><LoadingCard /></main></div>;
  if (!asar || error) return <div className="app-page"><AppHeader /><main className="app-main"><EmptyState title="Асар не найден" text={error || "Проверьте ссылку"} /></main></div>;

  const missing = [...asar.readiness.missingCritical, ...asar.readiness.unconfirmedCritical];
  const participants = asar.requirements.reduce((sum, item) => sum + (item.commitments?.filter((commitment) => commitment.status !== "CANCELLED").length ?? 0), 0);
  const readinessTitle = asar.readiness.state === "READY" ? "Все критические опоры подтверждены" : asar.readiness.state === "PROVISIONAL" ? "Роли заняты, ждём подтверждений" : "Асар пока не готов";
  const categoryLabel = ASAR_CATEGORIES.find((item) => item.value === asar.category)?.label ?? "Другое";
  const terminal = isTerminalLifecycle(asar.lifecycleStatus);
  const timeToStart = new Date(asar.startsAt).getTime() <= renderedAt + 2 * 60 * 60 * 1000;

  return <div className="app-page"><AppHeader title="Асар" /><main className="app-main">
    <div className="page-heading compact-heading"><Link className="text-link" href="/app/asars">← Все асары</Link></div>
    {message && <div className={message.includes("скопирована") ? "success-banner" : "error-banner"}>{message}</div>}
    {terminal && <div className="history-banner"><StatusBadge state={asar.lifecycleStatus} /><div><strong>{asar.lifecycleStatus === "CANCELLED" ? "Асар отменён и не состоялся" : "Асар завершён и сохранён в истории"}</strong><span>Новые отклики, приглашения и другие действия отключены.</span></div></div>}
    <div className={`detail-grid ${terminal ? "detail-grid-history" : ""}`}>
      <section className="hero-panel"><div className="hero-panel-top"><StatusBadge state={asar.lifecycleStatus} /><span className="muted">{formatDate(asar.startsAt)}</span></div><span className="section-kicker">{categoryLabel}</span><h1>{asar.title}</h1>{asar.description && <p className="hero-description">{asar.description}</p>}{asar.group && <Link className="event-group-card" href={`/app/groups/${asar.group.id}`}><GroupAvatar group={asar.group} size="small" /><span><small>Группа</small><strong>{asar.group.name}</strong><em>{asar.group.memberCount} участников</em></span><i>›</i></Link>}
        <div className="event-attributes" aria-label="Атрибуты асара"><span>⌖ {asar.publicLocation || "Место уточняется"}</span><span>◷ {formatDate(asar.startsAt, true)}</span><span>◫ {asar.requirements.length} потребностей</span><span>● {participants} участников</span></div>
        <div className="readiness-row"><ReadinessOrb state={asar.readiness.state} percent={asar.readiness.percentage} /><div className="readiness-text"><h3>{readinessTitle}</h3><p>{asar.readiness.state === "READY" ? "Все критические обязательства подтверждены." : "Готовность меняется после откликов и подтверждений участников."}</p>{missing.length > 0 && <div className="risk-list">Критично: {missing.join(", ")}</div>}</div></div>
      </section>
      {!terminal && <aside className="side-panel next-step-panel"><span className="section-kicker">Следующий шаг</span>{asar.lifecycleStatus === "DRAFT" && <><h3>Позовите участников</h3><p>Сейчас это черновик. После публикации откроется общая ссылка для любого мессенджера.</p><button className="button button-primary button-block" disabled={Boolean(busy)} onClick={() => void share(true)}>{busy === "publish" ? "Публикуем…" : "Опубликовать и поделиться"}</button></>}{asar.lifecycleStatus === "PUBLISHED" && !timeToStart && <><h3>Продолжайте сбор</h3><p>Люди могут присоединяться по общей ссылке, пока есть свободные места.</p><button className="button button-primary button-block" disabled={Boolean(busy)} onClick={() => void share()}>{busy === "share" ? "Готовим ссылку…" : "Поделиться"}</button></>}{asar.lifecycleStatus === "PUBLISHED" && timeToStart && <><h3>Пора начинать</h3><p>После старта новые участники всё ещё смогут занять свободные места.</p><button className="button button-primary button-block" disabled={Boolean(busy)} onClick={() => void transition("start")}>{busy === "start" ? "Начинаем…" : "Начать дело"}</button></>}{asar.lifecycleStatus === "IN_PROGRESS" && <><h3>Асар идёт</h3><p>Завершайте только после того, как дело действительно состоялось.</p><Link className="button button-primary button-block" href={`/app/asars/${id}/complete`}>Завершить дело</Link></>}
        <div className="stat-list"><div><span>Потребностей</span><strong>{asar.requirements.length}</strong></div><div><span>Участников</span><strong>{participants}</strong></div><div><span>Критических пробелов</span><strong>{asar.readiness.missingCritical.length}</strong></div></div></aside>}
    </div>

    <section className="section-block"><div className="section-heading"><div><span className="section-kicker">Состав асара</span><h2>Люди и ресурсы</h2></div><small className="section-note">Нажмите «Участники», чтобы перевернуть карточку.</small></div>
      <div className="requirement-list">{asar.requirements.map((item) => { const info = requirementTypeInfo(item.type); const isFlipped = flipped.has(item.id); return <article className={`requirement-flip-card ${isFlipped ? "flipped" : ""}`} key={item.id}><div className="requirement-card-inner">
        <div className="requirement-card requirement-face requirement-front"><div className="requirement-head"><span className="requirement-icon">{info.icon}</span><div className="requirement-copy"><h3>{item.customTitle} {item.isCritical && <span className="danger-text">*</span>}</h3><p>{item.description || info.label}</p></div><div className="requirement-numbers"><strong>{item.confirmedQuantity} / {item.requiredQuantity}</strong><small>подтверждено</small></div></div><div className="bar"><i style={{ width: `${Math.min(100, item.confirmedQuantity / item.requiredQuantity * 100)}%` }} /></div><button className="card-flip-button" type="button" onClick={() => toggleCard(item.id)}>Участники ({item.commitments?.length ?? 0}) →</button></div>
        <div className="requirement-card requirement-face requirement-back"><div className="requirement-back-head"><div><span className="section-kicker">{item.customTitle}</span><h3>Участники</h3></div><button className="card-flip-button" type="button" onClick={() => toggleCard(item.id)}>← Назад</button></div>{item.commitments?.length ? <div className="commitment-list">{item.commitments.map((commitment) => { const profileUrl = commitment.contactType === "TELEGRAM" ? telegramProfileUrl(commitment.contactValue) : ""; return <div className="commitment-row" key={commitment.id}><div className="commitment-person"><strong>{commitment.participantName}</strong>{profileUrl ? <a href={profileUrl} target="_blank" rel="noreferrer">{commitment.contactValue} ↗</a> : <small>{commitment.contactValue}{commitment.comment && ` · ${commitment.comment}`}</small>}</div><StatusBadge state={commitment.status} /></div>; })}</div> : <div className="empty-participants">Пока никто не откликнулся.</div>}</div>
      </div></article>; })}</div>
    </section>

    {!terminal && asar.lifecycleStatus !== "DRAFT" && <section className="inline-share"><div><span className="section-kicker">Одна ссылка для всех</span><h2>Позовите тех, кто нужен</h2><p>Откроется обычная публичная карточка. Ссылку можно отправить в Telegram, WhatsApp или любой другой сервис.</p></div><button className="button button-primary" disabled={Boolean(busy)} onClick={() => void share()}>{busy === "share" ? "Готовим…" : "Поделиться"}</button>{shareUrl && <div className="share-link-row"><input className="input" readOnly value={shareUrl} /><button className="button button-secondary" onClick={() => { void navigator.clipboard.writeText(shareUrl); setMessage("Общая ссылка скопирована. Её можно отправить в любой мессенджер."); }}>Копировать</button></div>}</section>}

    {!terminal && <details className="other-actions"><summary>Другие действия</summary><div><p>{asar.lifecycleStatus === "PUBLISHED" ? "«Начать дело» переводит асар в этап проведения. «Отменить» означает, что дело не состоится." : "Отмена означает, что асар не состоится. Это отличается от завершения состоявшегося дела."}</p>{asar.lifecycleStatus === "PUBLISHED" && !timeToStart && <button className="text-action" disabled={Boolean(busy)} onClick={() => void transition("start")}>Начать раньше назначенного времени</button>}<button className="text-action danger-text" disabled={Boolean(busy)} onClick={cancel}>Отменить асар</button></div></details>}
  </main></div>;
}
