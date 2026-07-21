"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/client";
import type { GroupMemberProfile as MemberProfile } from "../lib/types";
import type { MemberOffer } from "../lib/member-offers";
import { AppHeader, EmptyState, formatDate, LoadingCard, StatusBadge } from "./asar-ui";
import { OfferChips, OfferSelector } from "./member-offers";

function invitedCopy(value?: string) {
  if (!value) return "Через Asar ещё не приглашали";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Последнее приглашение — сегодня";
  if (days === 1) return "Последнее приглашение — вчера";
  return `Последнее приглашение — ${days} дн. назад`;
}

export function GroupMemberProfile({ groupId, memberId }: { groupId: string; memberId: string }) {
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftOffers, setDraftOffers] = useState<MemberOffer[]>([]);
  const [selectedAsar, setSelectedAsar] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api<{ member: MemberProfile }>(`/api/groups/${groupId}/members/${memberId}`)
      .then((data) => { setMember(data.member); setDraftOffers(data.member.offers); setSelectedAsar(data.member.invitableAsars[0]?.id ?? ""); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Не удалось открыть профиль"))
      .finally(() => setLoading(false));
  }, [groupId, memberId]);

  const save = async () => {
    setBusy("save"); setMessage("");
    try {
      const data = await api<{ offers: MemberOffer[] }>(`/api/groups/${groupId}/members/${memberId}`, { method: "PATCH", body: JSON.stringify({ offers: draftOffers }) });
      setMember((current) => current ? { ...current, offers: data.offers } : current);
      setEditing(false); setMessage("Профиль круга обновлён.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Не удалось сохранить выбор"); }
    finally { setBusy(""); }
  };

  const invite = async () => {
    if (!selectedAsar) return;
    setBusy("invite"); setMessage("");
    try {
      const data = await api<{ invitedAt: string }>(`/api/groups/${groupId}/members/${memberId}/invites`, { method: "POST", body: JSON.stringify({ asarId: selectedAsar }) });
      setMember((current) => current ? { ...current, lastInvitedAt: data.invitedAt } : current);
      setMessage("Приглашение отправлено через бота.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Не удалось отправить приглашение"); }
    finally { setBusy(""); }
  };

  if (loading) return <div className="app-page"><AppHeader /><main className="app-main"><LoadingCard text="Открываем профиль…" /></main></div>;
  if (!member) return <div className="app-page"><AppHeader /><main className="app-main"><EmptyState title="Профиль недоступен" text={error} action={<Link className="button button-secondary" href={`/app/groups/${groupId}`}>Вернуться в круг</Link>} /></main></div>;

  return <div className="app-page"><AppHeader title="Участник круга" /><main className="app-main member-profile-page"><div className="page-heading compact-heading"><Link className="text-link" href={`/app/groups/${groupId}`}>← Вернуться в круг</Link></div>
    <section className="member-profile-hero"><div className="member-profile-avatar">{member.displayName.slice(0, 1).toUpperCase()}</div><div><span className="section-kicker">{member.role === "OWNER" ? "Организатор круга" : "Участник круга"}</span><h1>{member.displayName}</h1><p>{member.completedAsarCount} состоявшихся дел · {invitedCopy(member.lastInvitedAt)}</p>{member.username && <a className="text-link" href={`https://t.me/${member.username}`} target="_blank" rel="noreferrer">@{member.username} в Telegram ↗</a>}</div></section>
    {message && <div className={message.includes("обновлён") || message.includes("отправлено") ? "success-banner" : "error-banner"}>{message}</div>}
    <section className="panel profile-offers-panel"><div className="section-heading"><div><span className="section-kicker">В этом круге</span><h2>С чем можно обратиться</h2></div>{member.isSelf && !editing && <button className="button button-secondary" onClick={() => { setDraftOffers(member.offers); setEditing(true); }}>Изменить</button>}</div>{editing ? <><OfferSelector value={draftOffers} onChange={setDraftOffers} /><div className="profile-edit-actions"><button className="button button-secondary" onClick={() => setEditing(false)}>Отмена</button><button className="button button-primary" disabled={busy === "save"} onClick={() => void save()}>{busy === "save" ? "Сохраняем…" : "Сохранить"}</button></div></> : <OfferChips offers={member.offers} />}</section>
    {!member.isSelf && <section className="panel invite-member-panel"><span className="section-kicker">Личное приглашение</span><h2>Позвать в асар</h2><p className="panel-lead">Asar учитывает только приглашения, которые бот действительно смог отправить.</p>{member.invitableAsars.length ? <><label className="field"><span className="field-label">Выберите асар</span><select className="input" value={selectedAsar} onChange={(event) => setSelectedAsar(event.target.value)}>{member.invitableAsars.map((asar) => <option value={asar.id} key={asar.id}>{asar.title} · {formatDate(asar.startsAt)}</option>)}</select></label><button className="button button-primary button-block" disabled={!member.canReceiveBotInvite || busy === "invite"} onClick={() => void invite()}>{busy === "invite" ? "Отправляем…" : "Пригласить через бота"}</button>{!member.canReceiveBotInvite && <small className="field-hint">Участник ещё не подключил свой Telegram-профиль к Asar.</small>}</> : <EmptyState title="Нет активного асара для приглашения" text="Сначала опубликуйте асар в этом круге." />}</section>}
    <section className="section-block"><div className="section-heading"><div><span className="section-kicker">История участия</span><h2>Состоявшиеся асары</h2></div></div>{member.history.length ? <div className="asar-grid">{member.history.map((asar) => <Link className="asar-card" href={`/app/asars/${asar.id}`} key={asar.id}><div className="asar-card-top"><StatusBadge state="COMPLETED" /><span className="muted">{formatDate(asar.startsAt)}</span></div><h2>{asar.title}</h2><p>{asar.outcome === "PARTIAL" ? "Выполнено частично" : "Выполнено полностью"}</p></Link>)}</div> : <EmptyState title="История пока пуста" text="Здесь учитываются только дела, в которых человек действительно участвовал или был организатором." />}</section>
  </main></div>;
}
