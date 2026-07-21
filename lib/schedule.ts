import type { AsarTimeMode } from "./types";

export const ASAR_TIME_MODES: Array<{ value: AsarTimeMode; label: string; hint: string; time: string }> = [
  { value: "EXACT", label: "Точное время", hint: "Когда важно начать по часам", time: "" },
  { value: "MORNING", label: "Утром", hint: "Примерно с 9:00 до 12:00", time: "09:00" },
  { value: "AFTERNOON", label: "Днём", hint: "Примерно с 12:00 до 18:00", time: "13:00" },
  { value: "EVENING", label: "Вечером", hint: "После 18:00", time: "18:00" },
  { value: "FLEXIBLE", label: "В любое время", hint: "День известен, часы уточнятся", time: "12:00" },
];

export function isAsarTimeMode(value: unknown): value is AsarTimeMode {
  return ASAR_TIME_MODES.some((item) => item.value === value);
}

export function buildScheduleStart(date: string, mode: AsarTimeMode, exactTime: string) {
  const selected = ASAR_TIME_MODES.find((item) => item.value === mode);
  const time = mode === "EXACT" ? exactTime : selected?.time ?? "12:00";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return "";
  const value = new Date(`${date}T${time}:00`);
  return Number.isFinite(value.getTime()) ? value.toISOString() : "";
}

export function scheduleIsFuture(date: string, mode: AsarTimeMode, exactTime: string, now = Date.now()) {
  const start = buildScheduleStart(date, mode, exactTime);
  if (!start) return false;
  if (mode === "EXACT") return new Date(start).getTime() > now;
  const endHour = mode === "MORNING" ? 12 : mode === "AFTERNOON" ? 18 : 23;
  const endMinute = mode === "MORNING" || mode === "AFTERNOON" ? 0 : 59;
  return new Date(`${date}T${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}:59`).getTime() > now;
}

export function storedScheduleIsFuture(startsAt: string, mode: AsarTimeMode, now = Date.now()) {
  const start = new Date(startsAt).getTime();
  if (!Number.isFinite(start)) return false;
  const windows: Record<AsarTimeMode, number> = {
    EXACT: 0,
    MORNING: 3,
    AFTERNOON: 5,
    EVENING: 6,
    FLEXIBLE: 12,
  };
  return start + windows[mode] * 60 * 60 * 1000 > now;
}

export function formatAsarSchedule(value: string, mode: AsarTimeMode = "EXACT", withYear = false) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) }).format(date);
  if (mode === "EXACT") return `${day}, ${new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date)}`;
  const labels: Record<Exclude<AsarTimeMode, "EXACT">, string> = {
    MORNING: "утром",
    AFTERNOON: "днём",
    EVENING: "вечером",
    FLEXIBLE: "время уточняется",
  };
  return `${day}, ${labels[mode]}`;
}
