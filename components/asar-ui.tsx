import Link from "next/link";
import type { ReadinessState } from "../lib/domain";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className={`brand ${compact ? "brand-compact" : ""}`} href="/"><span className="brand-mark">A</span><strong>ASAR</strong>{!compact && <small>общее дело</small>}</Link>;
}

export function ReadinessOrb({ state, percent, segments }: { state: ReadinessState; percent: number; segments?: string[] }) {
  const items = segments ?? Array.from({ length: 5 }, (_, index) => index < Math.ceil(percent / 20) ? "done" : "empty");
  return <div className={`readiness-orb state-${state.toLowerCase()}`} aria-label={`Готовность ${percent}%`}>
    <div className="orb-lines" aria-hidden="true">{items.map((status, index) => <i key={index} className={status} style={{ transform: `rotate(${index * (180 / Math.max(items.length - 1, 1)) - 90}deg)` }} />)}</div>
    <div className="orb-center"><strong>{percent}%</strong><span>готово</span></div>
  </div>;
}

export function AppHeader({ title, backHref = "/app/asars" }: { title?: string; backHref?: string }) {
  return <header className="app-header"><div className="app-header-inner"><Brand compact />{title && <><span className="header-separator" /><strong className="header-title">{title}</strong></>}<nav><Link href={backHref}>Мои асары</Link><Link href="/app/profile">Профиль</Link><span className="avatar">А</span></nav></div></header>;
}

export function LoadingCard({ text = "Собираем данные асара…" }: { text?: string }) {
  return <div className="loading-card" role="status"><span className="spinner" />{text}</div>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-symbol">А</span><h2>{title}</h2><p>{text}</p>{action}</div>;
}

export function StatusBadge({ state }: { state: string }) {
  const labels: Record<string, string> = { NOT_READY: "Не готов", PROVISIONAL: "Условно готов", READY: "Готов", DRAFT: "Черновик", PUBLISHED: "Набор открыт", IN_PROGRESS: "Идёт сейчас", COMPLETED: "Завершён", CANCELLED: "Отменён", CLAIMED: "Откликнулся", CONFIRMED: "Подтвердил", ATTENDED: "Прибыл", NO_SHOW: "Не пришёл" };
  return <span className={`badge badge-${state.toLowerCase()}`}>{labels[state] ?? state}</span>;
}

export function formatDate(value: string, withYear = false) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
