"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "../lib/client";
import type { AsarView, ReconfirmationSummary } from "../lib/types";
import { AppHeader, EmptyState, LoadingCard, StatusBadge } from "./asar-ui";
import type { TelegramProfile } from "../lib/telegram";
import { formatAsarSchedule } from "../lib/schedule";

function activeReconfirmation(asar: AsarView): ReconfirmationSummary | undefined {
  return asar.reconfirmationSummary ?? asar.reconfirmation?.round;
}

export function OrganizerDashboard({ embedded = false, profile }: { embedded?: boolean; profile?: TelegramProfile | null }) {
  const [items, setItems] = useState<AsarView[]>([]);
  const [organizer, setOrganizer] = useState("Инициатор");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("active");

  const load = useCallback(async () => {
    try {
      const data = await api<{ asars: AsarView[]; organizer: { displayName: string } }>("/api/asars");
      setItems(data.asars);
      setOrganizer(data.organizer.displayName);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить асары");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const hasActiveReconfirmation = items.some((item) => Boolean(activeReconfirmation(item)?.isOpen));
  useEffect(() => {
    if (!hasActiveReconfirmation) return;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refreshVisible, 30_000);
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("focus", refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("focus", refreshVisible);
    };
  }, [hasActiveReconfirmation, load]);

  const visible = useMemo(() => items.filter((item) => {
    if (filter === "ready") return item.readiness.state === "READY" && !["COMPLETED", "CANCELLED", "EXPIRED"].includes(item.lifecycleStatus);
    if (filter === "done") return ["COMPLETED", "CANCELLED"].includes(item.lifecycleStatus);
    return !["COMPLETED", "CANCELLED"].includes(item.lifecycleStatus);
  }), [filter, items]);

  return <div className={embedded ? "app-page tg-dashboard" : "app-page"}>
    {!embedded && <AppHeader />}
    <main className="app-main">
      {embedded && <div className="tg-homebar"><div><BrandMini /><span><small>Система готовности</small><strong>ASAR</strong></span></div><div className="tg-user">{profile?.photoUrl ? <span className="tg-user-photo" style={{ backgroundImage: `url(${profile.photoUrl})` }} aria-label={profile.firstName} /> : <span>{profile?.firstName?.[0] ?? "А"}</span>}</div></div>}
      <div className="page-heading"><div><span className="section-kicker">Панель инициатора</span><h1>Сәлем, {(profile?.firstName || organizer.split(" ")[0])}.</h1><p>Сразу видно, какое дело готово, а где нужна ваша реакция.</p></div><Link className="button button-primary" href="/app/asars/new">+ Новый асар</Link></div>
      <div className="filters" aria-label="Фильтр асаров">
        {[['active','Активные'],['ready','Готовые'],['done','История']].map(([id,label]) => <button className={`filter ${filter === id ? "active" : ""}`} onClick={() => setFilter(id)} key={id}>{label}</button>)}
      </div>
      {loading ? <LoadingCard /> : error ? <EmptyState title="Обновите Telegram-сессию" text={error} action={<a className="button button-primary" href="https://t.me/asar_ops_bot?start=app">Получить новую кнопку</a>} /> : visible.length === 0 ? <EmptyState title={items.length ? "Здесь пока пусто" : "Начните с первого асара"} text="Опишите общее дело, добавьте критические роли и получите приглашение для Telegram." action={<Link className="button button-primary" href="/app/asars/new">Собрать асар</Link>} /> :
        <div className="asar-grid">{visible.map((asar) => { const reconfirmation = activeReconfirmation(asar); return <Link className="asar-card" href={`/app/asars/${asar.id}`} key={asar.id}>
          <div className="asar-card-top"><StatusBadge state={["DRAFT", "COMPLETED", "CANCELLED", "EXPIRED"].includes(asar.lifecycleStatus) ? asar.lifecycleStatus : asar.readiness.state} /><div className="progress-ring" style={{ "--percent": asar.readiness.percentage } as React.CSSProperties}><span>{asar.readiness.percentage}%</span></div></div>
          {asar.group && <span className="asar-group-label">{asar.group.name}</span>}<h2>{asar.title}</h2><p>{formatAsarSchedule(asar.startsAt, asar.timeMode)} · {asar.publicLocation}</p>
          {reconfirmation && <div className={`dashboard-reconfirmation ${reconfirmation.isOpen && reconfirmation.criticalPendingItems ? "attention" : ""}`}><span>Контрольная перекличка</span><strong>{!reconfirmation.isOpen ? "Перекличка закрыта" : reconfirmation.pendingItems ? `${reconfirmation.answeredPeople} из ${reconfirmation.totalPeople} ответили` : "Все ответили"}</strong></div>}
          <div className="asar-card-bottom"><small>{asar.requirements.reduce((sum, item) => sum + item.claimedQuantity, 0)} участников и ресурсов</small><strong>{asar.readiness.missingCritical.length ? `Не хватает: ${asar.readiness.missingCritical[0]}` : asar.readiness.unconfirmedCritical.length ? "Ждём подтверждений" : "Все опоры подтверждены"}</strong></div>
        </Link>; })}</div>}
    </main>{embedded && <nav className="tg-tabbar"><Link className="active" href="/"><span>⌂</span>Главная</Link><Link href="/app/asars"><span>◫</span>Асары</Link><Link className="tg-create" href="/app/asars/new"><span>＋</span></Link><Link href="/app/profile"><span>○</span>Профиль</Link></nav>}
  </div>;
}

function BrandMini() { return <span className="tg-brand-mark">A</span>; }
