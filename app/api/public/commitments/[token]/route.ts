import { hashToken } from "../../../../../lib/security";
import { database, ensureDatabase, getAsarView } from "../../../../../lib/store.server";

type ManageRow = {
  id: string; status: string; participant_name: string; contact_type: string; contact_value: string;
  quantity: number; comment: string; requirement_id: string; requirement_title: string; asar_id: string;
  asar_title: string; starts_at: string; public_location: string; exact_address: string; lifecycle_status: string;
};

async function commitmentByToken(token: string) {
  await ensureDatabase();
  return database().prepare(`SELECT c.*, r.title as requirement_title, r.asar_id, a.title as asar_title, a.starts_at, a.public_location,
    a.exact_address, a.lifecycle_status FROM commitments c JOIN requirements r ON r.id = c.requirement_id
    JOIN asars a ON a.id = r.asar_id WHERE c.manage_token_hash = ?`).bind(await hashToken(token)).first<ManageRow>();
}

function shape(row: ManageRow) {
  const confirmed = ["CONFIRMED", "ATTENDED"].includes(row.status);
  return {
    id: row.id,
    participantName: row.participant_name,
    contactType: row.contact_type,
    contactValue: row.contact_value,
    quantity: row.quantity,
    comment: row.comment,
    status: row.status,
    requirementTitle: row.requirement_title,
    asar: {
      id: row.asar_id,
      title: row.asar_title,
      startsAt: row.starts_at,
      publicLocation: row.public_location,
      exactAddress: confirmed ? row.exact_address : undefined,
      lifecycleStatus: row.lifecycle_status,
    },
  };
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const item = await commitmentByToken(token);
  return item ? Response.json({ commitment: shape(item) }) : Response.json({ code: "NOT_FOUND", message: "Ссылка управления недоступна" }, { status: 404 });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const current = await commitmentByToken(token);
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Ссылка управления недоступна" }, { status: 404 });
  const payload = await request.json() as { action?: string; comment?: string };
  if (payload.action === "confirm") {
    if (current.status !== "CLAIMED") return Response.json({ code: "INVALID_TRANSITION", message: "Участие уже обработано" }, { status: 409 });
    await database().prepare("UPDATE commitments SET status = 'CONFIRMED', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(current.id).run();
  } else if (payload.action === "cancel") {
    if (!["CLAIMED", "CONFIRMED"].includes(current.status)) return Response.json({ code: "INVALID_TRANSITION", message: "Участие уже обработано" }, { status: 409 });
    await database().prepare("UPDATE commitments SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(current.id).run();
  } else if (payload.action === "comment") {
    await database().prepare("UPDATE commitments SET comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(payload.comment?.trim() ?? "", current.id).run();
  } else {
    return Response.json({ code: "INVALID_ACTION", message: "Неизвестное действие" }, { status: 400 });
  }
  const updated = await commitmentByToken(token);
  return Response.json({ commitment: shape(updated!), asar: await getAsarView(current.asar_id) });
}
