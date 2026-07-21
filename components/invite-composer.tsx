"use client";

import { useMemo, useState } from "react";
import type { AsarView } from "../lib/types";
import { api } from "../lib/client";
import { formatAsarSchedule } from "../lib/schedule";
import { telegramHaptic } from "../lib/telegram";

type InviteResponse = { invite: { publicUrl: string; telegramUrl: string; scope: "FULL_ASAR" | "SINGLE_REQUIREMENT" } };

function invitationCopy(asar: AsarView, requirementId: string) {
  const requirement = asar.requirements.find((item) => item.id === requirementId);
  if (requirement) {
    const remaining = Math.max(0, requirement.requiredQuantity - requirement.claimedQuantity);
    return {
      eyebrow: requirement.isCritical ? "Критически важная роль" : "Нужна конкретная помощь",
      title: `Нужен: ${requirement.customTitle}`,
      text: `Для асара «${asar.title}» нужен вклад «${requirement.customTitle}»${remaining ? ` — ещё ${remaining}` : ""}. Откройте приглашение в Telegram и подтвердите участие.`,
      requirement,
    };
  }
  return {
    eyebrow: "Общее приглашение",
    title: asar.title,
    text: `Присоединяйтесь к асару «${asar.title}». В Telegram можно выбрать одну из свободных обязанностей и подтвердить участие.`,
    requirement: undefined,
  };
}

async function invitationImage(asar: AsarView, requirementId: string) {
  const copy = invitationCopy(asar, requirementId);
  const canvas = document.createElement("canvas");
  canvas.width = 1200; canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#172637"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0f7a60"; context.fillRect(0, 0, 24, canvas.height);
  context.fillStyle = "#d8f0e8"; context.font = "600 28px Arial"; context.fillText(copy.eyebrow.toUpperCase(), 78, 82);
  context.fillStyle = "#fffaf0"; context.font = "700 62px Georgia";
  const words = copy.title.split(/\s+/); let line = ""; let y = 175;
  for (const word of words) {
    const next = `${line}${line ? " " : ""}${word}`;
    if (context.measureText(next).width > 1020 && line) { context.fillText(line, 78, y); y += 76; line = word; } else line = next;
  }
  context.fillText(line, 78, y);
  context.fillStyle = "#c8d2dc"; context.font = "32px Arial";
  context.fillText(formatAsarSchedule(asar.startsAt, asar.timeMode, true), 78, 470);
  context.fillText(asar.publicLocation || "Место уточняется", 78, 520);
  context.fillStyle = "#fffaf0"; context.font = "600 26px Arial"; context.fillText("Открыть в Telegram · ASAR", 78, 580);
  return await new Promise<File | null>((resolve) => canvas.toBlob((blob) => resolve(blob ? new File([blob], "asar-invite.png", { type: "image/png" }) : null), "image/png"));
}

export function InviteComposer({ asar }: { asar: AsarView }) {
  const available = useMemo(() => asar.requirements.filter((item) => item.claimedQuantity < item.requiredQuantity), [asar.requirements]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const copy = invitationCopy(asar, selected);

  const createInvite = async (shareNow: boolean) => {
    setBusy(true); setMessage("");
    try {
      const scope = selected ? "SINGLE_REQUIREMENT" : "FULL_ASAR";
      const data = await api<InviteResponse>(`/api/asars/${asar.id}/invites`, { method: "POST", body: JSON.stringify({ scope, ...(selected ? { requirementId: selected } : {}) }) });
      setLink(data.invite.publicUrl);
      if (shareNow) {
        const file = await invitationImage(asar, selected);
        const shareData: ShareData = { title: copy.title, text: copy.text, url: data.invite.publicUrl, ...(file ? { files: [file] } : {}) };
        if (navigator.share) {
          const compatible = !file || !navigator.canShare || navigator.canShare({ files: [file] });
          await navigator.share(compatible ? shareData : { title: copy.title, text: copy.text, url: data.invite.publicUrl });
        } else {
          await navigator.clipboard.writeText(`${copy.text}\n${data.invite.publicUrl}`);
          setMessage("Текст и ссылка скопированы.");
        }
      }
      telegramHaptic("success");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      telegramHaptic("error"); setMessage(caught instanceof Error ? caught.message : "Не удалось подготовить приглашение");
    } finally { setBusy(false); }
  };

  return <section className="invite-composer" id="invite-composer"><div className="section-heading"><div><span className="section-kicker">Приглашение</span><h2>Кого зовём?</h2></div></div><p className="panel-lead">Выберите общий асар или одну свободную обязанность. Ниже видно ровно то, что получит человек.</p>
    <div className="invite-targets"><button type="button" className={!selected ? "selected" : ""} onClick={() => { setSelected(""); setLink(""); }}><strong>Весь асар</strong><small>Человек сам выберет свободную роль</small></button>{available.map((item) => <button type="button" className={selected === item.id ? "selected" : ""} onClick={() => { setSelected(item.id); setLink(""); }} key={item.id}><strong>{item.customTitle}</strong><small>Нужно ещё {item.requiredQuantity - item.claimedQuantity}{item.isCritical ? " · критично" : ""}</small></button>)}</div>
    <div className="invite-preview"><div className="invite-preview-card"><span>{copy.eyebrow}</span><h3>{copy.title}</h3><p>{asar.title}</p><div><small>{formatAsarSchedule(asar.startsAt, asar.timeMode, true)}</small><small>{asar.publicLocation || "Место уточняется"}</small></div><b>Открыть в Telegram →</b></div><div className="invite-preview-message"><small>Текст сообщения</small><p>{copy.text}</p></div></div>
    {message && <div className={message.includes("скопированы") ? "success-banner" : "error-banner"}>{message}</div>}
    <button className="button button-primary button-large button-block" disabled={busy} onClick={() => void createInvite(true)}>{busy ? "Готовим приглашение…" : "Поделиться приглашением"}</button>
    {link && <div className="share-link-row"><input className="input" readOnly value={link} /><button className="button button-secondary" onClick={() => { void navigator.clipboard.writeText(`${copy.text}\n${link}`); setMessage("Текст и ссылка скопированы."); }}>Копировать</button></div>}
    <small className="field-hint">Ссылка сначала откроет Telegram-бота. Мини‑приложение запишет только ответственность за асар — членство в круге не добавляется.</small>
  </section>;
}
