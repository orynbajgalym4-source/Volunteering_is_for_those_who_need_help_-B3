import { calculateReadiness } from "../../../lib/domain";
import { organizerFromRequest, unauthorized } from "../../../lib/auth.server";
import { database, ensureDatabase, getAsarView, getRequirements, mapAsar } from "../../../lib/store.server";

export async function GET(request: Request) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  await ensureDatabase();
  const rows = await database().prepare("SELECT * FROM asars WHERE owner_email = ? ORDER BY starts_at DESC").bind(owner.email).all<Record<string, unknown>>();
  const items = await Promise.all(rows.results.map(async (row) => {
    const requirements = await getRequirements(String(row.id));
    return { ...mapAsar(row), requirements, readiness: calculateReadiness(requirements) };
  }));
  return Response.json({ asars: items, organizer: owner });
}

export async function POST(request: Request) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const payload = await request.json() as {
    title?: string; description?: string; startsAt?: string; publicLocation?: string; exactAddress?: string;
    beneficiaryConsentConfirmed?: boolean;
    requirements?: Array<{ kind?: string; title?: string; description?: string; requiredQuantity?: number; isCritical?: boolean }>;
  };
  const title = payload.title?.trim() ?? "";
  const startsAt = payload.startsAt?.trim() ?? "";
  const requirements = payload.requirements ?? [];
  if (!title || !startsAt) return Response.json({ code: "INVALID_ASAR", message: "Укажите название и дату" }, { status: 400 });
  if (!payload.beneficiaryConsentConfirmed) return Response.json({ code: "CONSENT_REQUIRED", message: "Подтвердите согласие получателя помощи" }, { status: 400 });
  if (requirements.length === 0 || !requirements.some((item) => item.isCritical)) {
    return Response.json({ code: "REQUIREMENTS_REQUIRED", message: "Добавьте хотя бы одну критическую потребность" }, { status: 400 });
  }
  if (requirements.some((item) => !item.title?.trim() || Number(item.requiredQuantity) <= 0)) {
    return Response.json({ code: "INVALID_REQUIREMENT", message: "Проверьте названия и количество потребностей" }, { status: 400 });
  }

  await ensureDatabase();
  const db = database();
  const asarId = crypto.randomUUID();
  const statements = [
    db.prepare(`INSERT INTO asars (id, owner_email, owner_name, title, description, starts_at, public_location, exact_address, beneficiary_consent_confirmed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .bind(asarId, owner.email, owner.displayName, title, payload.description?.trim() ?? "", startsAt, payload.publicLocation?.trim() ?? "", payload.exactAddress?.trim() ?? ""),
    ...requirements.map((item, index) => db.prepare(`INSERT INTO requirements (id, asar_id, kind, title, description, required_quantity, is_critical, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), asarId, item.kind === "RESOURCE" ? "RESOURCE" : "PERSON", item.title!.trim(), item.description?.trim() ?? "", Number(item.requiredQuantity) || 1, item.isCritical ? 1 : 0, index)),
  ];
  await db.batch(statements);
  return Response.json({ asar: await getAsarView(asarId, owner.email) }, { status: 201 });
}
