import { calculateReadiness } from "../../../../../lib/domain";
import { hashToken, normalizeContact, randomToken } from "../../../../../lib/security";
import { database, ensureDatabase, getRequirements, mapAsar } from "../../../../../lib/store.server";

type InviteRow = {
  id: string; asar_id: string; requirement_id: string | null; scope: "FULL_ASAR" | "SINGLE_REQUIREMENT";
  expires_at: string; revoked_at: string | null;
};

async function inviteByToken(token: string) {
  await ensureDatabase();
  return database().prepare("SELECT * FROM invites WHERE token_hash = ?").bind(await hashToken(token)).first<InviteRow>();
}

async function publicView(invite: InviteRow) {
  const asarRow = await database().prepare("SELECT * FROM asars WHERE id = ?").bind(invite.asar_id).first<Record<string, unknown>>();
  if (!asarRow) return null;
  let requirements = await getRequirements(invite.asar_id, false);
  if (invite.scope === "SINGLE_REQUIREMENT") requirements = requirements.filter((item) => item.id === invite.requirement_id);
  requirements = requirements.map((item) => ({ ...item, commitments: undefined }));
  const allRequirements = await getRequirements(invite.asar_id, false);
  const mapped = mapAsar(asarRow);
  return {
    ...mapped,
    exactAddress: undefined,
    requirements,
    readiness: calculateReadiness(allRequirements),
    inviteScope: invite.scope,
  };
}

function validateInvite(invite: InviteRow | null) {
  if (!invite || invite.revoked_at) return "Приглашение недоступно";
  if (new Date(invite.expires_at).getTime() < Date.now()) return "Срок действия приглашения завершён";
  return null;
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const invite = await inviteByToken(token);
  const error = validateInvite(invite);
  if (error) return Response.json({ code: "INVITE_INVALID", message: error }, { status: 410 });
  const asar = await publicView(invite!);
  if (!asar) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });
  return Response.json({ asar });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const invite = await inviteByToken(token);
  const error = validateInvite(invite);
  if (error) return Response.json({ code: "INVITE_INVALID", message: error }, { status: 410 });
  const asarRow = await database().prepare("SELECT lifecycle_status FROM asars WHERE id = ?").bind(invite!.asar_id).first<{ lifecycle_status: string }>();
  if (!asarRow || asarRow.lifecycle_status !== "PUBLISHED") {
    return Response.json({ code: "RECRUITMENT_CLOSED", message: "Набор в этот асар уже закрыт" }, { status: 409 });
  }
  const payload = await request.json() as {
    requirementId?: string; participantName?: string; contactType?: string; contactValue?: string; quantity?: number; comment?: string;
  };
  const requirementId = payload.requirementId ?? "";
  const quantity = Math.max(1, Math.floor(Number(payload.quantity) || 1));
  if (!payload.participantName?.trim() || !payload.contactValue?.trim() || !requirementId) {
    return Response.json({ code: "INVALID_COMMITMENT", message: "Укажите имя, контакт и вклад" }, { status: 400 });
  }
  if (invite!.scope === "SINGLE_REQUIREMENT" && invite!.requirement_id !== requirementId) {
    return Response.json({ code: "INVITE_SCOPE", message: "Эта ссылка относится к другой потребности" }, { status: 403 });
  }
  const allowed = await database().prepare("SELECT id, kind FROM requirements WHERE id = ? AND asar_id = ?").bind(requirementId, invite!.asar_id).first<{ id: string; kind: string }>();
  if (!allowed) return Response.json({ code: "INVALID_REQUIREMENT", message: "Потребность недоступна" }, { status: 404 });
  if (allowed.kind === "PERSON" && quantity !== 1) return Response.json({ code: "INVALID_QUANTITY", message: "Один человек может занять одно место" }, { status: 400 });

  const manageToken = randomToken();
  const contactHash = await hashToken(normalizeContact(payload.contactValue));
  try {
    const result = await database().prepare(`INSERT INTO commitments
      (id, requirement_id, participant_name, contact_type, contact_value, normalized_contact_hash, quantity, status, manage_token_hash, comment)
      SELECT ?, ?, ?, ?, ?, ?, ?, 'CLAIMED', ?, ?
      WHERE (SELECT COALESCE(SUM(quantity), 0) FROM commitments WHERE requirement_id = ? AND status IN ('CLAIMED','CONFIRMED','ATTENDED')) + ?
        <= (SELECT required_quantity FROM requirements WHERE id = ?)`)
      .bind(crypto.randomUUID(), requirementId, payload.participantName.trim(), payload.contactType === "PHONE" ? "PHONE" : "TELEGRAM", payload.contactValue.trim(), contactHash, quantity, await hashToken(manageToken), payload.comment?.trim() ?? "", requirementId, quantity, requirementId).run();
    if (!result.meta.changes) {
      return Response.json({ code: "REQUIREMENT_FULL", message: "Эту роль только что занял другой человек" }, { status: 409 });
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message.includes("UNIQUE")) {
      return Response.json({ code: "ALREADY_CLAIMED", message: "Вы уже выбрали эту потребность" }, { status: 409 });
    }
    throw caught;
  }
  const requirements = await getRequirements(invite!.asar_id);
  return Response.json({
    commitment: { status: "CLAIMED", requirementId },
    manageToken,
    readiness: calculateReadiness(requirements),
  }, { status: 201 });
}
