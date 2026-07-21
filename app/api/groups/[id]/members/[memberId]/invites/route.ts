import { organizerFromRequest, unauthorized } from "../../../../../../../lib/auth.server";
import { effectiveLifecycleStatus, isRecruitmentOpen } from "../../../../../../../lib/domain";
import { hashToken, randomToken } from "../../../../../../../lib/security";
import { database, ensureDatabase } from "../../../../../../../lib/store.server";
import { telegramBotCall, telegramInviteLink } from "../../../../../../../lib/telegram-bot.server";

export async function POST(request: Request, context: { params: Promise<{ id: string; memberId: string }> }) {
  const viewer = await organizerFromRequest(request);
  if (!viewer) return unauthorized();
  const { id, memberId } = await context.params;
  const payload = await request.json() as { asarId?: string };
  await ensureDatabase();
  const db = database();
  const viewerMembership = await db.prepare("SELECT id FROM group_members WHERE group_id = ? AND member_key = ?")
    .bind(id, viewer.email).first();
  if (!viewerMembership) return Response.json({ code: "GROUP_FORBIDDEN", message: "Круг недоступен" }, { status: 403 });
  const member = await db.prepare("SELECT id, member_key, display_name FROM group_members WHERE id = ? AND group_id = ?")
    .bind(memberId, id).first<{ id: string; member_key: string; display_name: string }>();
  if (!member) return Response.json({ code: "NOT_FOUND", message: "Участник не найден" }, { status: 404 });
  const asar = await db.prepare("SELECT id, title, starts_at, lifecycle_status FROM asars WHERE id = ? AND group_id = ? AND owner_email = ?")
    .bind(payload.asarId ?? "", id, viewer.email).first<{ id: string; title: string; starts_at: string; lifecycle_status: string }>();
  if (!asar) return Response.json({ code: "ASAR_FORBIDDEN", message: "Выберите свой активный асар из этого круга" }, { status: 403 });
  if (!isRecruitmentOpen(effectiveLifecycleStatus(asar.lifecycle_status, asar.starts_at))) {
    return Response.json({ code: "ASAR_CLOSED", message: "В этот асар набор уже закрыт" }, { status: 409 });
  }
  const chatId = member.member_key.startsWith("telegram:") ? Number(member.member_key.slice("telegram:".length)) : NaN;
  if (!Number.isSafeInteger(chatId)) {
    return Response.json({ code: "MEMBER_NOT_REACHABLE", message: "Участник ещё не подключил Telegram-профиль к Asar" }, { status: 409 });
  }

  const token = randomToken();
  const inviteId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  await db.prepare("INSERT INTO invites (id, asar_id, requirement_id, scope, token_hash, expires_at) VALUES (?, ?, NULL, 'FULL_ASAR', ?, ?)")
    .bind(inviteId, asar.id, await hashToken(token), expiresAt).run();
  try {
    await telegramBotCall("sendMessage", {
      chat_id: chatId,
      text: `${viewer.displayName} приглашает вас в асар «${asar.title}».`,
      reply_markup: { inline_keyboard: [[{ text: "Посмотреть асар", url: telegramInviteLink(token) }]] },
    });
  } catch {
    await db.prepare("DELETE FROM invites WHERE id = ?").bind(inviteId).run();
    return Response.json({ code: "TELEGRAM_SEND_FAILED", message: "Не удалось отправить сообщение. Возможно, участник ещё не разрешил боту писать ему." }, { status: 409 });
  }
  const invitedAt = new Date().toISOString();
  await db.prepare("INSERT INTO group_member_invitations (id, group_id, asar_id, group_member_id, invited_by_key, invited_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), id, asar.id, member.id, viewer.email, invitedAt).run();
  return Response.json({ invitedAt }, { status: 201 });
}
