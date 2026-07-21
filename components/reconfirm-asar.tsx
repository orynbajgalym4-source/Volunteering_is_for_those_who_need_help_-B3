"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/client";
import { formatAsarSchedule } from "../lib/schedule";
import { telegramHaptic } from "../lib/telegram";
import type {
  PublicReconfirmationView,
  ReconfirmationDeliveryStatus,
  ReconfirmationItemState,
  ReconfirmationOverview,
  ReconfirmationRequestView,
} from "../lib/types";
import { Brand, EmptyState, LoadingCard } from "./asar-ui";

type OwnerReconfirmationResponse = ReconfirmationOverview & { shareUrl?: string };

const deliveryCopy: Record<ReconfirmationDeliveryStatus, { label: string; tone: string }> = {
  PENDING: { label: "Готовим доставку", tone: "waiting" },
  BOT_SENT: { label: "Отправлено в Telegram", tone: "success" },
  BOT_FAILED: { label: "Telegram не доставил", tone: "danger" },
  MANUAL_REQUIRED: { label: "Нужно отправить вручную", tone: "manual" },
  MANUAL_LINK_ISSUED: { label: "Ручная ссылка создана", tone: "manual" },
};

const itemCopy: Record<ReconfirmationItemState, string> = {
  PENDING: "Ждём ответа",
  CONFIRMED: "Подтвердил снова",
  CANCELLED: "Не сможет",
};

function formatMoment(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(date);
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function ReconfirmationPanel({
  asarId,
  onAsarRefresh,
  onFindReplacement,
  replacementNeeded,
}: {
  asarId: string;
  onAsarRefresh?: () => void | Promise<void>;
  onFindReplacement?: (requirementId: string) => void;
  replacementNeeded?: (requirementId: string) => boolean;
}) {
  const [data, setData] = useState<OwnerReconfirmationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [manualLinks, setManualLinks] = useState<Record<string, string>>({});

  const load = useCallback(async (refreshAsar = false) => {
    try {
      const next = await api<OwnerReconfirmationResponse>(`/api/asars/${asarId}/reconfirmations`);
      setData(next);
      if (next.round) setExpanded(true);
      if (refreshAsar) await onAsarRefresh?.();
    } catch (caught) {
      setMessageTone("error");
      setMessage(caught instanceof Error ? caught.message : "Не удалось загрузить перекличку");
    } finally {
      setLoading(false);
    }
  }, [asarId, onAsarRefresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const roundIsActive = Boolean(data?.round?.isOpen);
  useEffect(() => {
    if (!roundIsActive) return;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(refreshVisible, 30_000);
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("focus", refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("focus", refreshVisible);
    };
  }, [roundIsActive, load]);

  const launch = async () => {
    setBusy("launch"); setMessage("");
    try {
      const next = await api<OwnerReconfirmationResponse>(`/api/asars/${asarId}/reconfirmations`, { method: "POST", body: "{}" });
      setData(next); setExpanded(true); telegramHaptic("success");
      setMessageTone("success");
      setMessage("Перекличка запущена. Занятые места сохранены, теперь ждём свежих ответов.");
      await onAsarRefresh?.();
    } catch (caught) {
      telegramHaptic("error");
      setMessageTone("error");
      setMessage(caught instanceof Error ? caught.message : "Не удалось запустить перекличку");
    } finally { setBusy(""); }
  };

  const requestAction = async (requestId: string, action: "remind" | "manual-link") => {
    setBusy(`${requestId}:${action}`); setMessage("");
    try {
      const next = await api<OwnerReconfirmationResponse>(`/api/asars/${asarId}/reconfirmations/requests/${requestId}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setData(next);
      if (next.shareUrl) {
        setManualLinks((current) => ({ ...current, [requestId]: next.shareUrl! }));
        try {
          await copyText(next.shareUrl);
          setMessageTone("success");
          setMessage("Персональная ссылка создана и скопирована.");
        } catch { setMessageTone("success"); setMessage("Персональная ссылка создана — скопируйте её ниже."); }
      } else {
        setMessageTone("success");
        setMessage("Напоминание отправлено.");
      }
      telegramHaptic("success");
    } catch (caught) {
      telegramHaptic("error");
      setMessageTone("error");
      setMessage(caught instanceof Error ? caught.message : "Не удалось выполнить действие");
      await load(true);
    } finally { setBusy(""); }
  };

  const shareManualLink = async (request: ReconfirmationRequestView) => {
    const url = manualLinks[request.id];
    if (!url) return;
    const text = `${request.displayName}, пожалуйста, подтвердите свои роли перед асаром: ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "Перекличка перед асаром", text, url });
      else { await copyText(text); setMessageTone("success"); setMessage("Текст и ссылка скопированы."); }
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) { setMessageTone("error"); setMessage("Не удалось открыть отправку. Скопируйте ссылку вручную."); }
    }
  };

  const round = data?.round;
  const cancelledCritical = useMemo(() => {
    const items = round?.requests.flatMap((request) => request.items)
      .filter((item) => item.isCritical && item.state === "CANCELLED" && (replacementNeeded?.(item.requirementId) ?? true)) ?? [];
    return [...new Map(items.map((item) => [item.requirementId, item])).values()];
  }, [replacementNeeded, round]);

  if (loading) return <section className="reconfirmation-shell reconfirmation-loading" id="reconfirmation"><span className="spinner" /><span>Проверяем окно переклички…</span></section>;
  if (!data) return null;
  if (!round && !data.eligibility.canStart) return null;

  if (!round) return <section className={`reconfirmation-shell ${expanded ? "expanded" : ""}`} id="reconfirmation">
    <div className="reconfirmation-intro">
      <div className="reconfirmation-mark" aria-hidden="true">✓?</div>
      <div><span className="section-kicker">За 48 часов до начала</span><h2>Контрольная перекличка</h2><p>Проверьте, кто по-прежнему сможет выполнить обещанный вклад. Места останутся занятыми, пока человек сам не откажется.</p></div>
      {!expanded && <button className="button button-primary" type="button" onClick={() => setExpanded(true)}>Проверить готовность</button>}
    </div>
    {expanded && <div className="reconfirmation-preview">
      <div className="reconfirmation-preview-title"><div><strong>Будет создан один запрос на человека</strong><span>Если у человека несколько ролей, он ответит по каждой внутри одной страницы.</span></div><button className="text-action" type="button" onClick={() => setExpanded(false)}>Свернуть</button></div>
      <div className="reconfirmation-stats">
        <div><strong>{data.eligibility.confirmedPeople}</strong><span>участников</span></div>
        <div><strong>{data.eligibility.botEligiblePeople}</strong><span>сообщений в Telegram</span></div>
        <div><strong>{data.eligibility.manualPeople}</strong><span>ручных ссылок</span></div>
      </div>
      <div className="reconfirmation-consent-note"><span>!</span><p>После запуска готовность критических ролей станет условной до новых ответов. Неответившие участники не будут отменены автоматически.</p></div>
      {message && <div className={messageTone === "error" ? "error-banner" : "success-banner"}>{message}</div>}
      <button className="button button-primary button-large button-block" type="button" disabled={busy === "launch"} onClick={() => void launch()}>{busy === "launch" ? "Запускаем перекличку…" : "Запустить перекличку"}</button>
      <small className="field-hint">Автоматически уйдёт {data.eligibility.botEligiblePeople}; для остальных {data.eligibility.manualPeople} человек появятся персональные ссылки.</small>
      <small className="field-hint">Ссылка действует до начала асара{data.eligibility.expiresAt ? ` — ${formatMoment(data.eligibility.expiresAt)}` : ""}. Перекличку нельзя запустить второй раз без изменения расписания.</small>
    </div>}
  </section>;

  const peoplePercent = round.totalPeople ? Math.round(round.answeredPeople / round.totalPeople * 100) : 0;
  return <section className="reconfirmation-shell active" id="reconfirmation">
    <div className="reconfirmation-round-heading"><div><span className="section-kicker">Контрольная перекличка</span><h2>{!round.isOpen ? "Перекличка закрыта" : round.pendingItems ? "Ждём свежих ответов" : "Перекличка завершена"}</h2><p>{round.answeredPeople} из {round.totalPeople} участников ответили · {round.isOpen ? "действует до" : "закрыта"} {formatMoment(round.expiresAt)}</p></div><div className="reconfirmation-percent"><strong>{peoplePercent}%</strong><span>людей ответили</span></div></div>
    <div className="reconfirmation-progress" aria-label={`${peoplePercent}% участников ответили`}><i style={{ width: `${peoplePercent}%` }} /></div>
    <div className="reconfirmation-stats compact">
      <div><strong>{round.confirmedItems}</strong><span>подтверждено</span></div>
      <div><strong>{round.pendingItems}</strong><span>ждём ответа</span></div>
      <div><strong>{round.cancelledItems}</strong><span>отказов</span></div>
      <div className={round.criticalPendingItems ? "attention" : ""}><strong>{round.criticalPendingItems}</strong><span>критичных ждём</span></div>
    </div>
    {message && <div className={messageTone === "error" ? "error-banner" : "success-banner"}>{message}</div>}
    {cancelledCritical.length > 0 && <div className="reconfirmation-risk"><div><strong>Освободилась критическая роль</strong><p>Асар снова не готов. Создайте приглашение сразу на нужный вклад.</p></div>{cancelledCritical.map((item) => <button className="button button-secondary" type="button" onClick={() => onFindReplacement?.(item.requirementId)} key={item.commitmentId}>Найти замену: {item.requirementTitle}</button>)}</div>}
    <div className="reconfirmation-people">{round.requests.map((request) => {
      const delivery = deliveryCopy[request.deliveryStatus] ?? deliveryCopy.PENDING;
      const pending = request.items.some((item) => item.state === "PENDING");
      const manual = request.deliveryStatus === "MANUAL_REQUIRED" || request.deliveryStatus === "MANUAL_LINK_ISSUED" || request.deliveryStatus === "BOT_FAILED";
      const link = manualLinks[request.id];
      return <article className="reconfirmation-person" key={request.id}>
        <div className="reconfirmation-person-head"><div><strong>{request.displayName}</strong>{request.contactValue && <small>{request.contactValue}</small>}{request.openedAt && <small>Открыл {formatMoment(request.openedAt)}</small>}</div><span className={`delivery-pill ${delivery.tone}`}>{delivery.label}</span></div>
        <div className="reconfirmation-role-list">{request.items.map((item) => <div className={`reconfirmation-role state-${item.state.toLowerCase()}`} key={item.commitmentId}><span><strong>{item.requirementTitle}{item.quantity > 1 ? ` · ${item.quantity}` : ""}</strong>{item.isCritical && <small>Критично</small>}</span><b>{itemCopy[item.state]}</b></div>)}</div>
        {round.canDeliver && pending && <div className="reconfirmation-person-actions">
          {manual && <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void requestAction(request.id, "manual-link")}>{busy === `${request.id}:manual-link` ? "Создаём…" : link ? "Обновить ссылку" : "Создать личную ссылку"}</button>}
          {request.canRemind && <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void requestAction(request.id, "remind")}>{busy === `${request.id}:remind` ? "Отправляем…" : request.deliveryStatus === "BOT_FAILED" ? "Повторить Telegram" : "Напомнить"}</button>}
          {!manual && !request.canRemind && request.reminderCount === 0 && <small>Повторно напомнить можно через 6 часов.</small>}
        </div>}
        {round.isOpen && link && <div className="reconfirmation-link"><input className="input" value={link} readOnly /><button className="button button-primary" type="button" onClick={() => void shareManualLink(request)}>Отправить</button><button className="button button-plain" type="button" onClick={() => void copyText(link).then(() => setMessage("Ссылка скопирована.")).catch(() => setMessage("Выделите и скопируйте ссылку вручную."))}>Копировать</button></div>}
      </article>;
    })}</div>
  </section>;
}

type PublicResponse = { reconfirmation: PublicReconfirmationView };
type Answer = "confirm" | "cancel";

export function ReconfirmAsar({ token }: { token: string }) {
  const [reconfirmation, setReconfirmation] = useState<PublicReconfirmationView | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    api<PublicResponse>(`/api/public/reconfirmations/${token}`)
      .then((result) => { setReconfirmation(result.reconfirmation); setNow(Date.now()); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Ссылка переклички недоступна"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!reconfirmation) return;
    const expiresAt = new Date(reconfirmation.expiresAt).getTime();
    const updateClock = () => setNow(Date.now());
    const timeout = Number.isFinite(expiresAt)
      ? window.setTimeout(updateClock, Math.max(0, expiresAt - Date.now() + 50))
      : undefined;
    document.addEventListener("visibilitychange", updateClock);
    window.addEventListener("focus", updateClock);
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", updateClock);
      window.removeEventListener("focus", updateClock);
    };
  }, [reconfirmation]);

  const pendingItems = reconfirmation?.items.filter((item) => item.state === "PENDING") ?? [];
  const allPendingAnswered = pendingItems.every((item) => Boolean(answers[item.commitmentId]));
  const isExpired = Boolean(reconfirmation && new Date(reconfirmation.expiresAt).getTime() <= now);

  const submit = async () => {
    if (!reconfirmation) return;
    const responses = reconfirmation.items.flatMap((item) => {
      const answer = answers[item.commitmentId];
      if (!answer || item.state === "CANCELLED" || (item.state === "CONFIRMED" && answer === "confirm")) return [];
      return [{ commitmentId: item.commitmentId, action: answer }];
    });
    if (!responses.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<PublicResponse>(`/api/public/reconfirmations/${token}`, { method: "POST", body: JSON.stringify({ responses }) });
      setReconfirmation(result.reconfirmation); setAnswers({});
      setNotice(result.reconfirmation.items.some((item) => item.state === "PENDING") ? "Ответы сохранены." : "Спасибо. Организатор уже видит ваши ответы.");
      telegramHaptic("success");
    } catch (caught) {
      telegramHaptic("error");
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить ответы");
    } finally { setBusy(false); }
  };

  if (loading) return <div className="guest-page"><div className="guest-shell"><div className="guest-top"><Brand compact /></div><LoadingCard text="Открываем перекличку…" /></div></div>;
  if (!reconfirmation) return <div className="guest-page"><div className="guest-shell"><div className="guest-top"><Brand compact /></div><EmptyState title="Перекличка недоступна" text={error || "Ссылка истекла или была заменена."} /></div></div>;

  const complete = reconfirmation.items.every((item) => item.state !== "PENDING");
  const hasNewCancellation = reconfirmation.items.some((item) => item.state === "CONFIRMED" && answers[item.commitmentId] === "cancel");
  return <div className="guest-page"><div className="guest-shell"><div className="guest-top"><Brand compact /><small>Контрольная перекличка</small></div><article className="guest-card reconfirm-guest-card">
    <header className="guest-hero"><span className="eyebrow"><i /> До начала асара</span><h1>{reconfirmation.asar.title}</h1><div className="guest-meta"><span>◷ {formatAsarSchedule(reconfirmation.asar.startsAt, reconfirmation.asar.timeMode, true)}</span><span>⌖ {reconfirmation.asar.publicLocation}</span></div></header>
    <div className="guest-body">
      <div className={`reconfirm-welcome ${complete ? "complete" : ""}`}><span>{complete ? "✓" : isExpired ? "×" : "?"}</span><div><h2>{complete ? "Ваш ответ принят" : isExpired ? "Перекличка закрыта" : `${reconfirmation.participantName}, всё в силе?`}</h2><p>{complete ? "Организатор уже видит актуальное состояние каждой роли." : isExpired ? "Срок ответа истёк. Ваше место не отменено автоматически, но подтвердить роли по этой ссылке уже нельзя." : "Ответьте отдельно по каждому обещанному вкладу. Без ответа ваше место останется занятым, но готовность будет считаться условной."}</p></div></div>
      {error && <div className="error-banner">{error}</div>}{notice && <div className="success-banner">{notice}</div>}
      {reconfirmation.asar.exactAddress && <div className="exact-address"><strong>Точный адрес:</strong> {reconfirmation.asar.exactAddress}</div>}
      <div className="reconfirm-answer-list">{reconfirmation.items.map((item) => {
        const answer = answers[item.commitmentId];
        if (item.state === "CANCELLED") return <section className="reconfirm-answer locked cancelled" key={item.commitmentId}><div><strong>{item.requirementTitle}{item.quantity > 1 ? ` · ${item.quantity}` : ""}</strong>{item.isCritical && <small>Критичная роль</small>}</div><span>Вы не сможете участвовать</span><p>Эту роль нельзя вернуть по той же ссылке.</p></section>;
        return <section className={`reconfirm-answer ${item.state === "CONFIRMED" ? "confirmed" : ""} ${isExpired ? "locked" : ""}`} key={item.commitmentId}><div className="reconfirm-answer-title"><div><strong>{item.requirementTitle}{item.quantity > 1 ? ` · ${item.quantity}` : ""}</strong>{item.isCritical && <small>Критичная роль</small>}</div>{item.state === "CONFIRMED" ? <span>✓ Подтверждено</span> : isExpired ? <span>Срок ответа истёк</span> : null}</div>
          {!isExpired && (item.state === "PENDING" ? <div className="reconfirm-choices"><button type="button" className={answer === "confirm" ? "selected confirm" : ""} aria-pressed={answer === "confirm"} onClick={() => setAnswers((current) => ({ ...current, [item.commitmentId]: "confirm" }))}><span>✓</span><strong>Подтверждаю</strong><small>Организатор может рассчитывать на меня</small></button><button type="button" className={answer === "cancel" ? "selected cancel" : ""} aria-pressed={answer === "cancel"} onClick={() => setAnswers((current) => ({ ...current, [item.commitmentId]: "cancel" }))}><span>×</span><strong>Не смогу</strong><small>Роль сразу станет свободной</small></button></div> : <button className={`reconfirm-cancel-confirmed ${answer === "cancel" ? "selected" : ""}`} type="button" onClick={() => setAnswers((current) => ({ ...current, [item.commitmentId]: current[item.commitmentId] === "cancel" ? "confirm" : "cancel" }))}>{answer === "cancel" ? "Отмена выбрана — сохранить ниже" : "Всё изменилось — я не смогу"}</button>)}
        </section>;
      })}</div>
      {!isExpired && (pendingItems.length > 0 || hasNewCancellation) && <button className="button button-primary button-large button-block" type="button" disabled={busy || (pendingItems.length > 0 && !allPendingAnswered)} onClick={() => void submit()}>{busy ? "Сохраняем ответы…" : hasNewCancellation && !pendingItems.length ? "Подтвердить отмену роли" : allPendingAnswered ? "Отправить ответы" : `Ответьте ещё по ${pendingItems.filter((item) => !answers[item.commitmentId]).length}`}</button>}
      <p className="privacy-note">Ответы доступны только инициатору. Ссылка {isExpired ? "действовала" : "действует"} до {formatMoment(reconfirmation.expiresAt)}.</p>
    </div>
  </article></div></div>;
}
