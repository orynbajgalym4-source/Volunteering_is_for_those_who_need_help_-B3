"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/client";
import type { GroupView } from "../lib/types";
import { AppHeader, EmptyState, formatDate, LoadingCard, StatusBadge } from "./asar-ui";
import { GroupAvatar } from "./group-ui";

export function GroupDetail({ id }: { id: string }) {
  const [group, setGroup] = useState<GroupView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { api<{ group: GroupView }>(`/api/groups/${id}`).then((data) => setGroup(data.group)).catch((caught) => setError(caught instanceof Error ? caught.message : "Не удалось открыть группу")).finally(() => setLoading(false)); }, [id]);
  if (loading) return <div className="app-page"><AppHeader /><main className="app-main"><LoadingCard text="Открываем группу…" /></main></div>;
  if (!group) return <div className="app-page"><AppHeader /><main className="app-main"><EmptyState title="Группа недоступна" text={error} action={<Link className="button button-secondary" href="/app/profile">Вернуться в профиль</Link>} /></main></div>;
  return <div className="app-page"><AppHeader title="Группа" /><main className="app-main"><div className="page-heading compact-heading"><Link className="text-link" href="/app/profile">← Профиль</Link></div><section className="group-hero"><GroupAvatar group={group} size="large" /><div><span className="section-kicker">{group.role === "OWNER" ? "Вы организатор" : "Вы участник"}</span><h1>{group.name}</h1><p>{group.description || "Постоянный круг людей для общих дел."}</p><div className="group-stats"><span><strong>{group.memberCount}</strong> участников</span><span><strong>{group.asarCount}</strong> асаров</span></div></div></section><div className="group-primary-action"><Link className="button button-primary" href={`/app/asars/new?group=${group.id}`}>+ Создать асар в группе</Link></div>
    <section className="section-block"><div className="section-heading"><div><span className="section-kicker">Люди</span><h2>Участники группы</h2></div></div><div className="group-members">{group.members.map((member) => { const body = <><span className="member-avatar">{member.displayName.slice(0, 1).toUpperCase()}</span><span><strong>{member.displayName}</strong><small>{member.role === "OWNER" ? "Организатор" : "Участник"}{member.username ? ` · @${member.username}` : ""}</small></span><i>{member.username ? "↗" : ""}</i></>; return member.username ? <a href={`https://t.me/${member.username}`} target="_blank" rel="noreferrer" className="group-member-card" key={member.id}>{body}</a> : <div className="group-member-card" key={member.id}>{body}</div>; })}</div></section>
    <section className="section-block"><div className="section-heading"><div><span className="section-kicker">История дел</span><h2>Асары группы</h2></div></div>{group.asars.length ? <div className="asar-grid">{group.asars.map((asar) => <Link className="asar-card" href={`/app/asars/${asar.id}`} key={asar.id}><div className="asar-card-top"><StatusBadge state={asar.lifecycleStatus} /><span className="muted">{formatDate(asar.startsAt)}</span></div><h2>{asar.title}</h2><p>{asar.publicLocation || "Место уточняется"}</p></Link>)}</div> : <EmptyState title="В группе ещё нет асаров" text="Создайте первое общее дело для этого круга людей." />}</section>
  </main></div>;
}
