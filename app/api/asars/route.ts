import { isAsarCategory, isRequirementType } from "../../../lib/catalog";
import { organizerFromRequest, unauthorized } from "../../../lib/auth.server";
import { calculateReadiness } from "../../../lib/domain";
import { database, ensureDatabase, getAsarView, getGroupSummary, getRequirements, mapAsar } from "../../../lib/store.server";
import { isAsarTimeMode, storedScheduleIsFuture } from "../../../lib/schedule";

type ReconfirmationSummaryRow = {
  asar_id: string;
  id: string;
  expires_at: string;
  total_people: number;
  answered_people: number;
  pending_items: number;
  critical_pending_items: number;
};

export async function GET(request: Request) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  await ensureDatabase();
  const db = database();
  const [rows, roundRows] = await Promise.all([
    db.prepare("SELECT * FROM asars WHERE owner_email = ? AND group_id IS NOT NULL ORDER BY starts_at DESC")
      .bind(owner.email).all<Record<string, unknown>>(),
    db.prepare(`SELECT rr.asar_id, rr.id, rr.expires_at,
      (SELECT COUNT(*) FROM reconfirmation_requests rq WHERE rq.round_id = rr.id) AS total_people,
      (SELECT COUNT(*) FROM reconfirmation_requests rq WHERE rq.round_id = rr.id
        AND NOT EXISTS (SELECT 1 FROM reconfirmation_items ri WHERE ri.request_id = rq.id AND ri.state = 'PENDING')) AS answered_people,
      (SELECT COUNT(*) FROM reconfirmation_items ri WHERE ri.round_id = rr.id AND ri.state = 'PENDING') AS pending_items,
      (SELECT COUNT(*) FROM reconfirmation_items ri JOIN commitments c ON c.id = ri.commitment_id
        JOIN requirements r ON r.id = c.requirement_id
        WHERE ri.round_id = rr.id AND ri.state = 'PENDING' AND r.is_critical = 1) AS critical_pending_items
      FROM reconfirmation_rounds rr JOIN asars a ON a.id = rr.asar_id
      WHERE a.owner_email = ? AND rr.closed_at IS NULL`).bind(owner.email).all<ReconfirmationSummaryRow>(),
  ]);
  const roundByAsar = new Map(roundRows.results.map((row) => [row.asar_id, row]));
  const groupCache = new Map<string, ReturnType<typeof getGroupSummary>>();
  const items = await Promise.all(rows.results.map(async (row) => {
    const mapped = mapAsar(row);
    const requirements = await getRequirements(String(row.id));
    let group;
    if (mapped.groupId) {
      const cached = groupCache.get(mapped.groupId) ?? getGroupSummary(mapped.groupId, owner.email);
      groupCache.set(mapped.groupId, cached);
      group = await cached;
    }
    const round = roundByAsar.get(String(row.id));
    return {
      ...mapped,
      group,
      requirements,
      readiness: calculateReadiness(requirements),
      ...(round ? {
        reconfirmationSummary: {
          id: round.id,
          isOpen: String(row.lifecycle_status) === "PUBLISHED" && new Date(round.expires_at).getTime() > Date.now(),
          totalPeople: Number(round.total_people),
          answeredPeople: Number(round.answered_people),
          pendingItems: Number(round.pending_items),
          criticalPendingItems: Number(round.critical_pending_items),
        },
      } : {}),
    };
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
