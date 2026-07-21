import { calculateReadiness } from "../../../lib/domain";
import { isAsarCategory, isRequirementType } from "../../../lib/catalog";
import { organizerFromRequest, unauthorized } from "../../../lib/auth.server";
import { database, ensureDatabase, getAsarView, getGroupSummary, getRequirements, mapAsar } from "../../../lib/store.server";
import { isAsarTimeMode, storedScheduleIsFuture } from "../../../lib/schedule";

export async function GET(request: Request) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  await ensureDatabase();
  const rows = await database().prepare("SELECT * FROM asars WHERE owner_email = ? AND group_id IS NOT NULL ORDER BY starts_at DESC").bind(owner.email).all<Record<string, unknown>>();
  const items = await Promise.all(rows.results.map(async (row) => {
    const requirements = await getRequirements(String(row.id));
    const mapped = mapAsar(row);
    const group = mapped.groupId ? await getGroupSummary(mapped.groupId, owner.email) : undefined;
    return { ...mapped, group, requirements, readiness: calculateReadiness(requirements) };
  }));
  return Response.json({ asars: items, organizer: owner });
}

export async function POST(request: Request) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const payload = await request.json() as {
    groupId?: string; category?: string; title?: string; description?: string; startsAt?: string; timeMode?: string; publicLocation?: string; exactAddress?: string;
    beneficiaryConsentConfirmed?: boolean;
    requirements?: Array<{ type?: string; customTitle?: string; description?: string; requiredQuantity?: number; isCritical?: boolean }>;
  };
  const title = payload.title?.trim() ?? "";
  const startsAt = payload.startsAt?.trim() ?? "";
  const requirements = payload.requirements ?? [];
  const groupId = payload.groupId?.trim() ?? "";
  const timeMode = isAsarTimeMode(payload.timeMode) ? payload.timeMode : "EXACT";
  if (!groupId) return Response.json({ code: "GROUP_REQUIRED", message: "Выберите или создайте круг" }, { status: 400 });
  if (!title || !startsAt) return Response.json({ code: "INVALID_ASAR", message: "Укажите название и дату" }, { status: 400 });
  if (!storedScheduleIsFuture(startsAt, timeMode)) {
    return Response.json({ code: "INVALID_START_TIME", message: "Выберите будущую дату или период" }, { status: 400 });
  }
  if (!isAsarCategory(payload.category)) return Response.json({ code: "INVALID_CATEGORY", message: "Выберите одну из категорий асара" }, { status: 400 });
  if (!payload.beneficiaryConsentConfirmed) return Response.json({ code: "CONSENT_REQUIRED", message: "Подтвердите согласие получателя помощи" }, { status: 400 });
  if (requirements.length === 0 || !requirements.some((item) => item.isCritical)) {
    return Response.json({ code: "REQUIREMENTS_REQUIRED", message: "Добавьте хотя бы одну критическую потребность" }, { status: 400 });
  }
  if (requirements.some((item) => !isRequirementType(item.type) || !item.customTitle?.trim() || Number(item.requiredQuantity) <= 0)) {
    return Response.json({ code: "INVALID_REQUIREMENT", message: "Проверьте названия и количество потребностей" }, { status: 400 });
  }

  await ensureDatabase();
  const db = database();
  const membership = await db.prepare("SELECT role FROM group_members WHERE group_id = ? AND member_key = ? AND membership_source = 'EXPLICIT'").bind(groupId, owner.email).first();
  if (!membership) return Response.json({ code: "GROUP_FORBIDDEN", message: "Вы не состоите в этом круге" }, { status: 403 });
  const asarId = crypto.randomUUID();
  const statements = [
    db.prepare(`INSERT INTO asars (id, owner_email, owner_name, group_id, category, title, description, starts_at, time_mode, public_location, exact_address, beneficiary_consent_confirmed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .bind(asarId, owner.email, owner.displayName, groupId, payload.category, title, payload.description?.trim() ?? "", startsAt, timeMode, payload.publicLocation?.trim() ?? "", payload.exactAddress?.trim() ?? ""),
    ...requirements.map((item, index) => db.prepare(`INSERT INTO requirements (id, asar_id, kind, title, description, required_quantity, is_critical, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), asarId, item.type, item.customTitle!.trim(), item.description?.trim() ?? "", Number(item.requiredQuantity) || 1, item.isCritical ? 1 : 0, index)),
  ];
  await db.batch(statements);
  return Response.json({ asar: await getAsarView(asarId, owner.email) }, { status: 201 });
}
