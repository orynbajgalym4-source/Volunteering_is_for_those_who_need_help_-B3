import { organizerFromRequest, unauthorized } from "../../../../../lib/auth.server";
import { canTransition, type LifecycleStatus } from "../../../../../lib/domain";
import { database, ensureDatabase, getAsarView } from "../../../../../lib/store.server";
import { normalizeMemberOffers } from "../../../../../lib/member-offers";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  const payload = await request.json() as { action?: string; outcome?: string; note?: string; offers?: unknown };
  const current = await getAsarView(id, owner.email);
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });

  const targets: Record<string, LifecycleStatus> = { publish: "PUBLISHED", start: "IN_PROGRESS", complete: "COMPLETED", cancel: "CANCELLED" };
  const target = targets[payload.action ?? ""];
  if (!target) return Response.json({ code: "INVALID_ACTION", message: "Неизвестное действие" }, { status: 400 });
  const offers = payload.offers === undefined ? undefined : normalizeMemberOffers(payload.offers);
  if (target === "COMPLETED" && !["FULL", "PARTIAL"].includes(payload.outcome ?? "")) {
    return Response.json({ code: "INVALID_OUTCOME", message: "Укажите, выполнено дело полностью или частично" }, { status: 400 });
  }
  if (payload.offers !== undefined && !offers) {
    return Response.json({ code: "INVALID_OFFERS", message: "Проверьте выбранные варианты помощи" }, { status: 400 });
  }
  if (target === "PUBLISHED" && (!current.requirements.length || !current.requirements.some((item) => item.isCritical))) {
    return Response.json({ code: "PUBLISH_REQUIREMENTS", message: "Для публикации нужна критическая потребность" }, { status: 409 });
  }
  if (!canTransition(current.lifecycleStatus as LifecycleStatus, target)) {
    return Response.json({ code: "INVALID_TRANSITION", message: "Этот переход состояния недоступен" }, { status: 409 });
  }
  await ensureDatabase();
  const db = database();
  const statements = [db.prepare("UPDATE asars SET lifecycle_status = ?, outcome = ?, outcome_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_email = ?")
    .bind(target, target === "COMPLETED" ? payload.outcome : null, target === "COMPLETED" ? payload.note?.trim() ?? "" : null, id, owner.email)];
  if (target === "COMPLETED" && offers !== undefined && current.groupId) {
    const member = await db.prepare("SELECT id FROM group_members WHERE group_id = ? AND member_key = ?")
      .bind(current.groupId, owner.email).first<{ id: string }>();
    if (member) {
      statements.push(
        db.prepare("DELETE FROM member_offers WHERE group_member_id = ?").bind(member.id),
        db.prepare("DELETE FROM asar_offer_snapshots WHERE asar_id = ? AND group_member_id = ?").bind(id, member.id),
        ...offers.flatMap((kind) => [
          db.prepare("INSERT INTO member_offers (id, group_member_id, kind) VALUES (?, ?, ?)").bind(crypto.randomUUID(), member.id, kind),
          db.prepare("INSERT INTO asar_offer_snapshots (id, asar_id, group_member_id, kind) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), id, member.id, kind),
        ]),
      );
    }
  }
  await db.batch(statements);
  return Response.json({ asar: await getAsarView(id, owner.email) });
}
