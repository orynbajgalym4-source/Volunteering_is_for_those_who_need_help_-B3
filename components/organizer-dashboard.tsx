"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "../lib/client";
import type { AsarView } from "../lib/types";
import { AppHeader, EmptyState, formatDate, LoadingCard, StatusBadge } from "./asar-ui";

export function OrganizerDashboard() {
  const [items, setItems] = useState<AsarView[]>([]);
  const [organizer, setOrganizer] = useState("Инициатор");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("active");

  useEffect(() => {
    api<{ asars: AsarView[]; organizer: { displayName: string } }>("/api/asars")
      .then((data) => { setItems(data.asars); setOrganizer(data.organizer.displayName); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Не удалось загрузить асары"))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => items.filter((item) => {
    if (filter === "ready") return item.readiness.state === "READY" && !["COMPLETED", "CANCELLED"].includes(item.lifecycleStatus);
    if (filter === "done") return ["COMPLETED", "CANCELLED"].includes(item.lifecycleStatus);
    return !["COMPLETED", "CANCELLED"].includes(item.lifecycleStatus);
  }), [filter, items]);

  return <div className="app-page">
    <AppHeader />
    <main className="app-main">
      <div className="page-heading"><div><span className="section-kicker">Панель инициатора</span><h1>Сәлем, {organizer.split(" ")[0]}.</h1><p>Здесь видно, какие дела держатся крепко, а где нужна ваша реакция.</p></div><Link className="button button-primary" href="/app/asars/new">+ Новый асар</Link></div>
      <div className="filters" aria-label="Фильтр асаров">
        {[['active','Активные'],['ready','Готовые'],['done','Завершённые']].map(([id,label]) => <button className={`filter ${filter === id ? "active" : ""}`} onClick={() => setFilter(id)} key={id}>{label}</button>)}
      </div>
      {loading ? <LoadingCard /> : error ? <EmptyState title="Нужен вход инициатора" text={error} action={<a className="button button-primary" href="/signin-with-chatgpt?return_to=%2Fapp%2Fasars">Войти с ChatGPT</a>} /> : visible.length === 0 ? <EmptyState title={items.length ? "Здесь пока пусто" : "Начните с первого асара"} text="Опишите общее дело, добавьте критические роли и получите гостевую ссылку." action={<Link className="button button-primary" href="/app/asars/new">Собрать асар</Link>} /> :
        <div className="asar-grid">{visible.map((asar) => <Link className="asar-card" href={`/app/asars/${asar.id}`} key={asar.id}>
          <div className="asar-card-top"><StatusBadge state={asar.lifecycleStatus === "DRAFT" ? "DRAFT" : asar.readiness.state} /><div className="progress-ring" style={{ "--percent": asar.readiness.percentage } as React.CSSProperties}><span>{asar.readiness.percentage}%</span></div></div>
          <h2>{asar.title}</h2><p>{formatDate(asar.startsAt)} · {asar.publicLocation}</p>
          <div className="asar-card-bottom"><small>{asar.requirements.reduce((sum, item) => sum + item.claimedQuantity, 0)} участников и ресурсов</small><strong>{asar.readiness.missingCritical.length ? `Не хватает: ${asar.readiness.missingCritical[0]}` : asar.readiness.unconfirmedCritical.length ? "Ждём подтверждений" : "Все опоры подтверждены"}</strong></div>
        </Link>)}</div>}
    </main>
  </div>;
}
