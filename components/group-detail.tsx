"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/client";
import type { AsarView, GroupView } from "../lib/types";
import { AppHeader, EmptyState, formatDate, LoadingCard, StatusBadge } from "./asar-ui";
import { GroupAvatar } from "./group-ui";
import { OfferChips } from "./member-offers";

function invitedAgo(value?: string) {
  if (!value) return "Ещё не приглашали";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Приглашали сегодня";
  if (days === 1) return "Приглашали вчера";
  return `Приглашали ${days} дн. назад`;
}

function AsarHistoryCard({ asar }: { asar: AsarView }) {
  const outcome = asar.outcome === "PARTIAL" ? "Выполнено частично" : asar.outcome === "FULL" ? "Выполнено полностью" : "";
  return <Link className="asar-card circle-asar-card" href={`/app/asars/${asar.id}`}><div className="asar-card-top"><StatusBadge state={asar.lifecycleStatus} /><span className="muted">{formatDate(asar.startsAt)}</span></div><h2>{asar.title}</h2><p>{asar.publicLocation || "Место уточняется"}</p>{outcome && <small className="history-outcome">{outcome}</small>}</Link>;
}

export function GroupDetail({ id }: { id: string }) {
  const [group, setGroup] = useState<GroupView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { api<{ group: GroupView }>(`/api/groups/${id}`).then((data) => setGroup(data.group)).catch((caught) => setError(caught instanceof Error ? caught.message : "Не удалось открыть круг")).finally(() => setLoading(false)); }, [id]);
  if (loading) return <div className="app-page"><AppHeader /><main className="app-main"><LoadingCard text="Открываем круг…" /></main></div>;
  if (!group) return <div className="app-page"><AppHeader /><main className="app-main"><EmptyState title="Круг недоступен" text={error} action={<Link className="button button-secondary" href="/app/profile">Вернуться в профиль</Link>} /></main></div>;

  const active = group.asars.filter((asar) => ["DRAFT", "PUBLISHED", "IN_PROGRESS", "EXPIRED"].includes(asar.lifecycleStatus));
  const history = group.asars.filter((asar) => asar.lifecycleStatus === "COMPLETED" && asar.outcome !== "CANCELLED");
  const archive = group.asars.filter((asar) => asar.lifecycleStatus === "CANCELLED" || (asar.lifecycleStatus === "COMPLETED" && asar.outcome === "CANCELLED"));

  return <div className="app-page"><AppHeader title="Круг" /><main className="app-main"><div className="page-heading compact-heading"><Link className="text-link" href="/app/profile">← Профиль</Link></div><section className="group-hero"><GroupAvatar group={group} size="large" /><div><span className="section-kicker">{group.role === "OWNER" ? "Вы организатор" : "Вы участник"}</span><h1>{group.name}</h1><p>{group.description || "Постоянный круг людей для общих дел."}</p><div className="group-stats"><span><strong>{group.memberCount}</strong> участников</span><span><strong>{group.asarCount}</strong> дел</span></div></div></section><div className="group-primary-action"><Link className="button button-primary" href={`/app/asars/new?group=${group.id}`}>+ Создать асар в круге</Link></div>
    <section className="section-block"><div className="section-heading"><div><span className="section-kicker">Люди</span><h2>Участники круга</h2></div></div><div className="group-members">{group.members.map((member) => <Link href={`/app/groups/${id}/members/${member.id}`} className="group-member-card member-profile-card" key={member.id}><span className="member-avatar">{member.displayName.slice(0, 1).toUpperCase()}</span><span className="member-card-main"><strong>{member.displayName}</strong><small>{member.role === "OWNER" ? "Организатор" : "Участник"} · {member.completedAsarCount} дел</small><OfferChips offers={member.offers} limit={2} /><em>{invitedAgo(member.lastInvitedAt)}</em></span><i>›</i></Link>)}</div></section>
    <section className="section-block"><div className="section-heading"><div><span className="section-kicker">Сейчас</span><h2>Текущие асары</h2></div></div>{active.length ? <div className="asar-grid">{active.map((asar) => <AsarHistoryCard asar={asar} key={asar.id} />)}</div> : <EmptyState title="Активных асаров нет" text="Когда кругу понадобится общее дело, создайте новый асар." />}</section>
    <section className="section-block"><div className="section-heading"><div><span className="section-kicker">История круга</span><h2>Состоявшиеся асары</h2></div></div>{history.length ? <div className="asar-grid">{history.map((asar) => <AsarHistoryCard asar={asar} key={asar.id} />)}</div> : <EmptyState title="История пока пуста" text="Здесь появятся только фактически завершённые общие дела." />}</section>
    {archive.length > 0 && <details className="other-actions circle-archive"><summary>Отменённые асары ({archive.length})</summary><div className="asar-grid">{archive.map((asar) => <AsarHistoryCard asar={asar} key={asar.id} />)}</div></details>}
  </main></div>;
}
