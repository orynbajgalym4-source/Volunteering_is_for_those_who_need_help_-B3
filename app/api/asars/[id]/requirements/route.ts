import { organizerFromRequest, unauthorized } from "../../../../../lib/auth.server";
import { database, ensureDatabase, getAsarView } from "../../../../../lib/store.server";
import { isRequirementType } from "../../../../../lib/catalog";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  const current = await getAsarView(id, owner.email);
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });
  if (["COMPLETED", "CANCELLED"].includes(String(current.lifecycleStatus))) return Response.json({ code: "ASAR_LOCKED", message: "Асар уже закрыт" }, { status: 409 });
  const payload = await request.json() as { type?: string; customTitle?: string; description?: string; requiredQuantity?: number; isCritical?: boolean };
  if (!isRequirementType(payload.type) || !payload.customTitle?.trim() || Number(payload.requiredQuantity) <= 0) return Response.json({ code: "INVALID_REQUIREMENT", message: "Выберите тип, укажите потребность и количество" }, { status: 400 });
  await ensureDatabase();
  await database().prepare(`INSERT INTO requirements (id, asar_id, kind, title, description, required_quantity, is_critical, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), id, payload.type, payload.customTitle.trim(), payload.description?.trim() ?? "", Number(payload.requiredQuantity), payload.isCritical ? 1 : 0, current.requirements.length).run();
  return Response.json({ asar: await getAsarView(id, owner.email) }, { status: 201 });
}
