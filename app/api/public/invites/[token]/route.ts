import { calculateReadiness, effectiveLifecycleStatus, isRecruitmentOpen } from "../../../../../lib/domain";
import { hashToken, normalizeContact, randomToken } from "../../../../../lib/security";
import { database, getRequirements } from "../../../../../lib/store.server";
import { isIndividualContribution } from "../../../../../lib/catalog";
import { telegramUserFromRequest } from "../../../../../lib/auth.server";
import { inviteByToken, inviteValidationError, publicInviteView } from "../../../../../lib/invites.server";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const invite = await inviteByToken(token);
  const error = inviteValidationError(invite);
  if (error) return Response.json({ code: "INVITE_INVALID", message: error }, { status: 410 });
  const asar = await publicInviteView(invite!);
  if (!asar) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });
  return Response.json({ asar });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const invite = await inviteByToken(token);
  const error = inviteValidationError(invite);
  if (error) return Response.json({ code: "INVITE_INVALID", message: error }, { status: 410 });
  const asarRow = await database().prepare("SELECT lifecycle_status, starts_at FROM asars WHERE id = ?").bind(invite!.asar_id).first<{ lifecycle_status: string; starts_at: string }>();
  const lifecycle = asarRow ? effectiveLifecycleStatus(asarRow.lifecycle_status, asarRow.starts_at) : "CANCELLED";
  if (!isRecruitmentOpen(lifecycle)) {
    return Response.json({ code: "RECRUITMENT_CLOSED", message: "Набор в этот асар уже закрыт" }, { status: 409 });
  }
  const payload = await request.json() as {
    requirementId?: string; participantName?: string; contactType?: string; contactValue?: string; quantity?: number; comment?: string;
    reminderOptIn?: boolean;
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
  if (isIndividualContribution(allowed.kind) && quantity !== 1) return Response.json({ code: "INVALID_QUANTITY", message: "Один человек может занять одно место" }, { status: 400 });

  const manageToken = randomToken();
  const contactHash = await hashToken(normalizeContact(payload.contactValue));
  const telegramUser = await telegramUserFromRequest(request);
  const commitmentStatus = telegramUser ? "CONFIRMED" : "CLAIMED";
  const contactType = payload.contactType === "PHONE" ? "PHONE" : "TELEGRAM";
  const reminderOptIn = Boolean(telegramUser && contactType === "TELEGRAM" && payload.reminderOptIn === true);
  const commitmentId = crypto.randomUUID();
  try {
    const db = database();
    const common = [commitmentId, requirementId, payload.participantName.trim(), contactType, payload.contactValue.trim(), contactHash, telegramUser?.ownerKey ?? null, reminderOptIn ? 1 : 0, quantity, commitmentStatus, await hashToken(manageToken)] as const;
    let result;
    try {
      result = await db.prepare(`INSERT INTO commitments
        (id, requirement_id, participant_name, contact_type, contact_value, normalized_contact_hash, participant_key, reminder_opt_in, quantity, status, manage_token_hash, comment)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (SELECT COALESCE(SUM(quantity), 0) FROM commitments WHERE requirement_id = ? AND status IN ('CLAIMED','CONFIRMED','ATTENDED')) + ?
          <= (SELECT required_quantity FROM requirements WHERE id = ?)`)
        .bind(...common, payload.comment?.trim() ?? "", requirementId, quantity, requirementId).run();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (!message.includes("manage_token_preview")) throw caught;
      result = await db.prepare(`INSERT INTO commitments
        (id, requirement_id, participant_name, contact_type, contact_value, normalized_contact_hash, participant_key, reminder_opt_in, quantity, status, manage_token_hash, manage_token_preview, comment)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE (SELECT COALESCE(SUM(quantity), 0) FROM commitments WHERE requirement_id = ? AND status IN ('CLAIMED','CONFIRMED','ATTENDED')) + ?
          <= (SELECT required_quantity FROM requirements WHERE id = ?)`)
        .bind(...common, manageToken.slice(0, 8), payload.comment?.trim() ?? "", requirementId, quantity, requirementId).run();
    }
    if (!result.meta.changes) {
      return Response.json({ code: "REQUIREMENT_FULL", message: "Эту роль только что занял другой человек" }, { status: 409 });
    }
    if (commitmentStatus === "CONFIRMED") {
      await db.prepare("UPDATE commitments SET confirmed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(commitmentId).run();
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
    commitment: { status: commitmentStatus, requirementId },
    manageToken,
    readiness: calculateReadiness(requirements),
  }, { status: 201 });
}
