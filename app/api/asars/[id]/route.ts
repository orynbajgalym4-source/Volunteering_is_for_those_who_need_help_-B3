import { organizerFromRequest, unauthorized } from "../../../../lib/auth.server";
import { database, ensureDatabase, getAsarView } from "../../../../lib/store.server";
import { isAsarTimeMode } from "../../../../lib/schedule";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  const asar = await getAsarView(id, owner.email);
  return asar ? Response.json({ asar }) : Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  const current = await getAsarView(id, owner.email);
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });
  if (["COMPLETED", "CANCELLED"].includes(String(current.lifecycleStatus))) {
    return Response.json({ code: "ASAR_LOCKED", message: "Завершённый асар нельзя изменить" }, { status: 409 });
  }
  const payload = await request.json() as { title?: string; description?: string; startsAt?: string; timeMode?: string; publicLocation?: string; exactAddress?: string };
  if (payload.timeMode !== undefined && !isAsarTimeMode(payload.timeMode)) {
    return Response.json({ code: "INVALID_TIME_MODE", message: "Выберите допустимый режим времени" }, { status: 400 });
  }
  await ensureDatabase();
  const db = database();
  const statements = [db.prepare(`UPDATE asars SET title = COALESCE(?, title), description = COALESCE(?, description), starts_at = COALESCE(?, starts_at), time_mode = COALESCE(?, time_mode),
    public_location = COALESCE(?, public_location), exact_address = COALESCE(?, exact_address), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_email = ?`)
    .bind(payload.title?.trim() || null, payload.description?.trim() ?? null, payload.startsAt ?? null, payload.timeMode ?? null, payload.publicLocation?.trim() ?? null, payload.exactAddress?.trim() ?? null, id, owner.email)];
  const scheduleChanged = (payload.startsAt !== undefined && payload.startsAt !== current.startsAt)
    || (payload.timeMode !== undefined && payload.timeMode !== current.timeMode);
  if (scheduleChanged) {
    statements.push(db.prepare(`UPDATE reconfirmation_rounds
      SET closed_at = CURRENT_TIMESTAMP, close_reason = 'SCHEDULE_CHANGED',
        schedule_key = schedule_key || '#changed:' || ?, updated_at = CURRENT_TIMESTAMP
      WHERE asar_id = ? AND closed_at IS NULL`).bind(crypto.randomUUID(), id));
  }
  await db.batch(statements);
  return Response.json({ asar: await getAsarView(id, owner.email) });
}
