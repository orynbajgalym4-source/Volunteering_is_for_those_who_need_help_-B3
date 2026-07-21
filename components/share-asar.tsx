"use client";

import Link from "next/link";
import { useAsar } from "../lib/use-asar";
import { isTerminalLifecycle } from "../lib/domain";
import { AppHeader, EmptyState, LoadingCard } from "./asar-ui";
import { InviteComposer } from "./invite-composer";

export function ShareAsar({ id }: { id: string }) {
  const { asar, loading, error } = useAsar(id);
  if (loading) return <div className="app-page"><AppHeader /><main className="app-main"><LoadingCard /></main></div>;
  if (!asar || error) return <div className="app-page"><AppHeader /><main className="app-main"><EmptyState title="Асар не найден" text={error} /></main></div>;
  if (isTerminalLifecycle(asar.lifecycleStatus)) return <div className="app-page"><AppHeader /><main className="app-main"><EmptyState title="Асар сохранён в истории" text="Завершённые и отменённые события больше нельзя распространять как живые объявления." action={<Link className="button button-secondary" href={`/app/asars/${id}`}>Вернуться к карточке</Link>} /></main></div>;
  return <div className="app-page"><AppHeader title="Поделиться" /><main className="app-main"><div className="page-heading"><div><Link className="text-link" href={`/app/asars/${id}`}>← Вернуться к асару</Link><h1>Соберите понятное приглашение</h1><p>{asar.title}</p></div></div><InviteComposer asar={asar} /></main></div>;
}
