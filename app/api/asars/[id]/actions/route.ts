import { organizerFromRequest, unauthorized } from "../../../../../lib/auth.server";
import { canTransition, type LifecycleStatus } from "../../../../../lib/domain";
import { database, ensureDatabase, getAsarView } from "../../../../../lib/store.server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  const payload = await request.json() as { action?: string; outcome?: string; note?: string };
  const current = await getAsarView(id, owner.email);
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });

  const targets: Record<string, LifecycleStatus> = { publish: "PUBLISHED", start: "IN_PROGRESS", complete: "COMPLETED", cancel: "CANCELLED" };
  const target = targets[payload.action ?? ""];
  if (!target) return Response.json({ code: "INVALID_ACTION", message: "Неизвестное действие" }, { status: 400 });
  if (target === "PUBLISHED" && (!current.requirements.length || !current.requirements.some((item) => item.isCritical))) {
    return Response.json({ code: "PUBLISH_REQUIREMENTS", message: "Для публикации нужна критическая потребность" }, { status: 409 });
  }
  if (!canTransition(current.lifecycleStatus as LifecycleStatus, target)) {
    return Response.json({ code: "INVALID_TRANSITION", message: "Этот переход состояния недоступен" }, { status: 409 });
  }
  await ensureDatabase();
  await database().prepare("UPDATE asars SET lifecycle_status = ?, outcome = ?, outcome_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_email = ?")
    .bind(target, target === "COMPLETED" ? payload.outcome ?? "FULL" : null, target === "COMPLETED" ? payload.note?.trim() ?? "" : null, id, owner.email).run();
  return Response.json({ asar: await getAsarView(id, owner.email) });
}
