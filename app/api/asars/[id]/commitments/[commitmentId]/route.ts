import { organizerFromRequest, unauthorized } from "../../../../../../lib/auth.server";
import { database, ensureDatabase, getAsarView } from "../../../../../../lib/store.server";

export async function POST(request: Request, context: { params: Promise<{ id: string; commitmentId: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id, commitmentId } = await context.params;
  const current = await getAsarView(id, owner.email);
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });
  const payload = await request.json() as { action?: string };
  const status = payload.action === "attended" ? "ATTENDED" : payload.action === "no-show" ? "NO_SHOW" : null;
  if (!status) return Response.json({ code: "INVALID_ACTION", message: "Неизвестное действие" }, { status: 400 });
  await ensureDatabase();
  const result = await database().prepare(`UPDATE commitments SET status = ?, attended_at = CASE WHEN ? = 'ATTENDED' THEN CURRENT_TIMESTAMP ELSE attended_at END,
    updated_at = CURRENT_TIMESTAMP WHERE id = ? AND requirement_id IN (SELECT id FROM requirements WHERE asar_id = ?)`)
    .bind(status, status, commitmentId, id).run();
  if (!result.meta.changes) return Response.json({ code: "NOT_FOUND", message: "Участник не найден" }, { status: 404 });
  return Response.json({ asar: await getAsarView(id, owner.email) });
}
