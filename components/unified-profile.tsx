"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../lib/client";
import type { MemberOffer } from "../lib/member-offers";
import type { AsarView, GroupMemberProfile, GroupSummary, SelfProfileView } from "../lib/types";
import { getTelegramWebApp } from "../lib/telegram";
import { AppHeader, EmptyState, formatDate, LoadingCard, StatusBadge } from "./asar-ui";
import { GroupAvatar } from "./group-ui";
import { OfferChips, OfferSelector } from "./member-offers";
import { formatAsarSchedule } from "../lib/schedule";

function invitationRecency(value?: string) {
  if (!value) return "Через Asar ещё не приглашали";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Последнее приглашение — сегодня";
  if (days === 1) return "Последнее приглашение — вчера";
  return `Последнее приглашение — ${days} дн. назад`;
}

function ProfileHistory({ history, showCircle }: { history: AsarView[]; showCircle?: boolean }) {
  if (!history.length) return <EmptyState title="История пока пуста" text="Здесь появятся только дела, в которых человек действительно участвовал или был организатором." />;
  return <div className="asar-grid profile-history-grid">{history.map((asar) => <Link className="asar-card profile-history-card" href={`/app/asars/${asar.id}`} key={asar.id}>
    <div className="asar-card-top"><StatusBadge state="COMPLETED" /><span className="muted">{formatAsarSchedule(asar.startsAt, asar.timeMode)}</span></div>
    {showCircle && asar.group && <span className="profile-history-circle">{asar.group.name}</span>}
    <h2>{asar.title}</h2>
    <p>{asar.outcome === "PARTIAL" ? "Выполнено частично" : "Выполнено полностью"}</p>
  </Link>)}</div>;
}

function ProfileHero({ name, username, isSelf, group, member, globalProfile }: {
  name: string;
  username?: string;
  isSelf: boolean;
  group?: GroupSummary;
  member?: GroupMemberProfile | null;
  globalProfile?: SelfProfileView | null;
}) {
  const completed = member?.completedAsarCount ?? globalProfile?.history.length ?? 0;
  return <section className="unified-profile-hero"><div className="unified-profile-avatar">{name.slice(0, 1).toUpperCase()}</div><div className="unified-profile-copy">
    <span className="section-kicker">{group ? `${member?.role === "OWNER" ? "Организатор" : "Участник"} круга` : isSelf ? "Мой профиль" : "Профиль участника"}</span>
    <h1>{name}</h1>
    {username ? <a className="profile-telegram-link" href={`https://t.me/${username}`} target="_blank" rel="noreferrer">@{username} в Telegram ↗</a> : <p>Telegram подключён к Asar</p>}
    <div className="unified-profile-meta">{group ? <span>{group.name}</span> : <span>{globalProfile?.groups.length ?? 0} кругов</span>}<span>{completed} состоявшихся дел</span></div>
  </div></section>;
}

export function UnifiedProfilePage({ groupId, memberId }: { groupId?: string; memberId?: string }) {
  const router = useRouter();
  const memberRoute = Boolean(groupId && memberId);
  const [selfProfile, setSelfProfile] = useState<SelfProfileView | null>(null);
  const [member, setMember] = useState<GroupMemberProfile | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftOffers, setDraftOffers] = useState<MemberOffer[]>([]);
  const [selectedAsar, setSelectedAsar] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [writeAccess, setWriteAccess] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(!memberRoute);
  const [notificationMessage, setNotificationMessage] = useState("");

  useEffect(() => {
    if (memberRoute) {
      api<{ member: GroupMemberProfile }>(`/api/groups/${groupId}/members/${memberId}`)
        .then((data) => {
          setMember(data.member);
          setDraftOffers(data.member.offers);
          setSelectedAsar(data.member.invitableAsars[0]?.id ?? "");
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : "Не удалось открыть профиль"))
        .finally(() => setLoading(false));
      return;
    }

    api<{ profile: SelfProfileView }>("/api/profile")
      .then((data) => {
        setSelfProfile(data.profile);
        setDraftOffers(data.profile.offers);
        const requestedCircle = new URLSearchParams(window.location.search).get("circle") ?? "";
        setSelectedGroupId(data.profile.groups.some((group) => group.id === requestedCircle) ? requestedCircle : "");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Не удалось открыть профиль"))
      .finally(() => setLoading(false));
    api<{ allowed: boolean }>("/api/telegram/notifications")
      .then((data) => setWriteAccess(data.allowed))
      .catch(() => setWriteAccess(false))
      .finally(() => setNotificationsLoading(false));
  }, [groupId, memberId, memberRoute]);

  useEffect(() => {
    if (memberRoute || !selfProfile || !selectedGroupId) return;
    const group = selfProfile.groups.find((item) => item.id === selectedGroupId);
    if (!group?.currentMemberId) return;
    api<{ member: GroupMemberProfile }>(`/api/groups/${group.id}/members/${group.currentMemberId}`)
      .then((data) => { setMember(data.member); setDraftOffers(data.member.offers); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Не удалось открыть профиль в круге"))
  }, [memberRoute, selectedGroupId, selfProfile]);

  const selectContext = (value: string) => {
    setMember(null); setError(""); setEditing(false); setMessage("");
    setSelectedGroupId(value);
    router.replace(value ? `/app/profile?circle=${encodeURIComponent(value)}` : "/app/profile");
  };

  const saveOffers = async () => {
    if (!isSelf) return;
    setBusy("save"); setMessage("");
    try {
      const data = await api<{ offers: MemberOffer[] }>("/api/profile", { method: "PATCH", body: JSON.stringify({ offers: draftOffers }) });
      setMember((current) => current ? { ...current, offers: data.offers } : current);
      setSelfProfile((current) => current ? { ...current, offers: data.offers } : current);
      setEditing(false); setMessage("Профиль обновлён.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Не удалось сохранить выбор"); }
    finally { setBusy(""); }
  };

  const invite = async () => {
    if (!member || !selectedAsar) return;
    setBusy("invite"); setMessage("");
    try {
      const data = await api<{ invitedAt: string }>(`/api/groups/${member.group.id}/members/${member.id}/invites`, { method: "POST", body: JSON.stringify({ asarId: selectedAsar }) });
      setMember((current) => current ? { ...current, lastInvitedAt: data.invitedAt } : current);
      setMessage("Приглашение отправлено через бота.");
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Не удалось отправить приглашение"); }
    finally { setBusy(""); }
  };

  const saveNotificationAccess = async (allowed: boolean) => {
    setWriteAccess(allowed);
    setNotificationMessage(allowed ? "Готово — бот сможет предупреждать о рисках." : "Telegram не дал разрешение на сообщения.");
    if (allowed) await api("/api/telegram/notifications", { method: "POST", body: JSON.stringify({ allowed: true }) }).catch(() => undefined);
  };

  const requestMessages = () => {
    const app = getTelegramWebApp();
    if (!app) return setNotificationMessage("Откройте профиль внутри Telegram, чтобы дать разрешение боту.");
    app.requestWriteAccess((allowed) => { void saveNotificationAccess(allowed); });
  };

  if (loading) return <div className="app-page"><AppHeader title="Профиль" /><main className="app-main unified-profile-page"><LoadingCard text="Открываем профиль…" /></main></div>;
  if (error && !selfProfile && !member) return <div className="app-page"><AppHeader title="Профиль" /><main className="app-main unified-profile-page"><EmptyState title="Профиль недоступен" text={error} action={groupId ? <Link className="button button-secondary" href={`/app/groups/${groupId}`}>Вернуться в круг</Link> : undefined} /></main></div>;

  const contextGroup = member?.group ?? selfProfile?.groups.find((group) => group.id === selectedGroupId);
  const isSelf = memberRoute ? Boolean(member?.isSelf) : true;
  const displayName = member?.displayName ?? selfProfile?.displayName ?? "Участник";
  const username = member?.username ?? selfProfile?.username;
  const globalMode = !memberRoute && !selectedGroupId;
  const history = globalMode ? selfProfile?.history ?? [] : member?.history ?? [];
  const contextPending = !globalMode && !member && !error;

  return <div className="app-page"><AppHeader title="Профиль" backHref={contextGroup ? `/app/groups/${contextGroup.id}` : "/app/asars"} /><main className="app-main unified-profile-page">
    <ProfileHero name={displayName} username={username} isSelf={isSelf} group={contextGroup} member={member} globalProfile={selfProfile} />

    {!memberRoute && selfProfile && selfProfile.groups.length > 0 && <section className="profile-context-switcher"><label htmlFor="profile-context">Показывать профиль</label><select id="profile-context" value={selectedGroupId} onChange={(event) => selectContext(event.target.value)}><option value="">Все круги</option>{selfProfile.groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select><p>{selectedGroupId ? "Возможности и история только в выбранном круге." : "Общая история и все ваши круги."}</p></section>}

    {contextGroup && <section className="profile-context-banner"><GroupAvatar group={contextGroup} /><div><small>Текущий круг</small><strong>{contextGroup.name}</strong><span>{member?.role === "OWNER" ? "Организатор" : "Участник"}</span></div><Link href={`/app/groups/${contextGroup.id}`}>Открыть круг ›</Link></section>}

    {error && <div className="error-banner">{error}</div>}
    {message && <div className={message.includes("обновлён") || message.includes("отправлено") ? "success-banner" : "error-banner"}>{message}</div>}

    {globalMode && selfProfile ? <>
      <section className="profile-summary-grid"><div><strong>{selfProfile.groups.length}</strong><span>кругов</span></div><div><strong>{selfProfile.history.length}</strong><span>состоявшихся дел</span></div></section>
      <section className="panel profile-offers-panel"><div className="section-heading"><div><span className="section-kicker">О вас</span><h2>Чем можете помочь</h2></div>{!editing && <button className="button button-secondary" onClick={() => { setDraftOffers(selfProfile.offers); setEditing(true); }}>Изменить</button>}</div><p className="panel-lead">Один общий набор возможностей для всех кругов. В круге показывается только ваше членство и история дел.</p>{editing ? <><OfferSelector value={draftOffers} onChange={setDraftOffers} /><div className="profile-edit-actions"><button className="button button-secondary" onClick={() => setEditing(false)}>Отмена</button><button className="button button-primary" disabled={busy === "save"} onClick={() => void saveOffers()}>{busy === "save" ? "Сохраняем…" : "Сохранить"}</button></div></> : <OfferChips offers={selfProfile.offers} />}</section>
      <section className="section-block"><div className="section-heading"><div><span className="section-kicker">Ваши круги</span><h2>Круги</h2></div><Link className="button button-secondary" href="/app/groups/new">+ Создать</Link></div>{selfProfile.groups.length ? <div className="profile-circle-list">{selfProfile.groups.map((group) => <button type="button" className="profile-circle-card" onClick={() => selectContext(group.id)} key={group.id}><GroupAvatar group={group} /><span><strong>{group.name}</strong><small>{group.role === "OWNER" ? "Организатор" : "Участник"} · {group.memberCount} участников</small></span><i>›</i></button>)}</div> : <EmptyState title="Кругов пока нет" text="Создайте постоянный круг людей для будущих общих дел." action={<Link className="button button-primary" href="/app/groups/new">Создать первый круг</Link>} />}</section>
      <section className="section-block"><div className="section-heading"><div><span className="section-kicker">История участия</span><h2>Состоявшиеся асары</h2></div></div><ProfileHistory history={history} showCircle /></section>
      <details className="profile-settings"><summary><span><small>Настройки</small><strong>Уведомления от бота</strong></span><em className={writeAccess ? "enabled" : ""}>{notificationsLoading ? "Проверяем…" : writeAccess ? "Включены" : "Выключены"}</em></summary><div className="profile-settings-body"><p>Бот предупредит, если критический участник отменил участие или снова появилась нехватка.</p>{notificationMessage && <div className={writeAccess ? "success-banner" : "error-banner"}>{notificationMessage}</div>}{!notificationsLoading && !writeAccess && <button className="button button-primary" onClick={requestMessages}>Включить уведомления</button>}<small>Asar хранит только данные, необходимые для координации.</small></div></details>
    </> : contextPending ? <LoadingCard text="Открываем профиль в круге…" /> : member ? <>
      <section className="panel profile-offers-panel"><div className="section-heading"><div><span className="section-kicker">Профиль человека</span><h2>Чем может помочь</h2></div>{member.isSelf && !editing && <button className="button button-secondary" onClick={() => { setDraftOffers(member.offers); setEditing(true); }}>Изменить</button>}</div><p className="panel-lead">Эти возможности принадлежат человеку и одинаковы во всех его кругах.</p>{editing ? <><OfferSelector value={draftOffers} onChange={setDraftOffers} /><div className="profile-edit-actions"><button className="button button-secondary" onClick={() => setEditing(false)}>Отмена</button><button className="button button-primary" disabled={busy === "save"} onClick={() => void saveOffers()}>{busy === "save" ? "Сохраняем…" : "Сохранить"}</button></div></> : <OfferChips offers={member.offers} />}</section>
      {!member.isSelf && <section className="panel invite-member-panel"><span className="section-kicker">Личное приглашение</span><h2>Позвать в асар</h2>{member.canViewInvitationRecency && <p className="profile-invite-recency">{invitationRecency(member.lastInvitedAt)}</p>}<p className="panel-lead">Выберите одно активное дело этого круга. Asar сохранит приглашение только после успешной отправки ботом.</p>{member.invitableAsars.length ? <><label className="field"><span className="field-label">Асар для приглашения</span><select className="input" value={selectedAsar} onChange={(event) => setSelectedAsar(event.target.value)}>{member.invitableAsars.map((asar) => <option value={asar.id} key={asar.id}>{asar.title} · {formatDate(asar.startsAt)}</option>)}</select></label><button className="button button-primary button-block" disabled={!member.canReceiveBotInvite || busy === "invite"} onClick={() => void invite()}>{busy === "invite" ? "Отправляем…" : "Пригласить через бота"}</button>{!member.canReceiveBotInvite && <small className="field-hint">Участник ещё не подключил свой Telegram-профиль к Asar.</small>}</> : <EmptyState title="Нет активного асара для приглашения" text="Сначала опубликуйте асар в этом круге." />}</section>}
      <section className="section-block"><div className="section-heading"><div><span className="section-kicker">История участия</span><h2>Состоявшиеся асары</h2></div></div><ProfileHistory history={history} /></section>
    </> : <EmptyState title="Профиль в круге недоступен" text={error || "Участник не найден."} />}
  </main></div>;
}
