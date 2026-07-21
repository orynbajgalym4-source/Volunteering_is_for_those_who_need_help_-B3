import { organizerFromRequest, unauthorized } from "../../../../lib/auth.server";
import { database, ensureDatabase, getAsarView, getGroupSummary, getMemberOffers } from "../../../../lib/store.server";
import type { GroupMemberView } from "../../../../lib/types";

type MemberRow = { id: string; member_key: string; display_name: string; username: string | null; role: "OWNER" | "MEMBER"; joined_at: string };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  await ensureDatabase();
  const db = database();
  const membership = await db.prepare("SELECT role FROM group_members WHERE group_id = ? AND member_key = ?").bind(id, owner.email).first<{ role: "OWNER" | "MEMBER" }>();
  if (!membership) return Response.json({ code: "GROUP_FORBIDDEN", message: "Круг недоступен" }, { status: 403 });
  const group = await getGroupSummary(id, owner.email);
  if (!group) return Response.json({ code: "NOT_FOUND", message: "Круг не найден" }, { status: 404 });
  const memberRows = await db.prepare("SELECT id, member_key, display_name, username, role, joined_at FROM group_members WHERE group_id = ? ORDER BY role = 'OWNER' DESC, joined_at")
    .bind(id).all<MemberRow>();
  const asarRows = await db.prepare("SELECT id FROM asars WHERE group_id = ? ORDER BY starts_at DESC").bind(id).all<{ id: string }>();
  const asars = (await Promise.all(asarRows.results.map((row) => getAsarView(row.id)))).filter((asar) => Boolean(asar)).map((asar) => ({ ...asar!, exactAddress: undefined }));
  const members: GroupMemberView[] = await Promise.all(memberRows.results.map(async (row) => {
    const count = await db.prepare(`SELECT COUNT(DISTINCT a.id) AS total FROM asars a
      LEFT JOIN requirements r ON r.asar_id = a.id
      LEFT JOIN commitments c ON c.requirement_id = r.id
      WHERE a.group_id = ? AND a.lifecycle_status = 'COMPLETED' AND COALESCE(a.outcome, 'FULL') != 'CANCELLED'
        AND (a.owner_email = ? OR (c.group_member_id = ? AND c.status = 'ATTENDED'))`)
      .bind(id, row.member_key, row.id).first<{ total: number }>();
    const canViewInvitationRecency = membership.role === "OWNER" || row.member_key === owner.email;
    const invitation = canViewInvitationRecency
      ? await db.prepare("SELECT MAX(invited_at) AS invited_at FROM group_member_invitations WHERE group_member_id = ?")
        .bind(row.id).first<{ invited_at: string | null }>()
      : null;
    return {
      id: row.id,
      displayName: row.display_name,
      ...(row.username ? { username: row.username } : {}),
      role: row.role,
      joinedAt: row.joined_at,
      offers: await getMemberOffers(row.id),
      completedAsarCount: Number(count?.total ?? 0),
      ...(invitation?.invited_at ? { lastInvitedAt: invitation.invited_at } : {}),
      canViewInvitationRecency,
      canReceiveBotInvite: /^telegram:\d+$/.test(row.member_key),
    };
  }));
  return Response.json({ group: { ...group, members, asars } }, { headers: { "Cache-Control": "no-store" } });
}
