"use client";

import { useState } from "react";
import { api } from "../lib/client";
import type { GroupSummary } from "../lib/types";

export function GroupCreator({ onCreated, onCancel }: { onCreated: (group: GroupSummary) => void; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choosePhoto = (file?: File) => {
    if (!file) return;
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };
  const submit = async () => {
    if (!name.trim()) return setError("Введите название группы");
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.set("name", name.trim());
      body.set("description", description.trim());
      if (photo) body.set("photo", photo);
      const data = await api<{ group: GroupSummary }>("/api/groups", { method: "POST", body });
      onCreated(data.group);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось создать группу"); }
    finally { setBusy(false); }
  };

  return <div className="group-creator"><div className="group-photo-picker"><label><span className={`group-photo-preview ${preview ? "has-photo" : ""}`} style={preview ? { backgroundImage: `url(${preview})` } : undefined}>{!preview && (name.trim().slice(0, 1).toUpperCase() || "+")}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])} /><strong>{preview ? "Сменить фото" : "Добавить фото"}</strong><small>JPG, PNG или WebP до 3 МБ</small></label></div><div className="group-create-fields"><div className="field"><label htmlFor="group-name">Название группы *</label><input id="group-name" className="input" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Например: Соседи дома 18" /></div><div className="field"><label htmlFor="group-description">Описание</label><textarea id="group-description" className="textarea" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Кто входит в группу и какие общие дела вы организуете" /><small className="field-hint">Описание помогает новым участникам понять контекст группы.</small></div></div>{error && <div className="error-banner">{error}</div>}<div className="group-create-actions">{onCancel && <button type="button" className="button button-secondary" onClick={onCancel}>Назад к выбору</button>}<button type="button" className="button button-primary" disabled={busy} onClick={() => void submit()}>{busy ? "Создаём…" : "Создать группу"}</button></div></div>;
}
