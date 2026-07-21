import { organizerFromRequest, unauthorized } from "../../../../../../lib/auth.server";
import { effectiveLifecycleStatus } from "../../../../../../lib/domain";
import { normalizeMemberOffers } from "../../../../../../lib/member-offers";
import { database, ensureDatabase, getAsarView, getGroupSummary, getProfileOffers } from "../../../../../../lib/store.server";
import type { GroupMemberProfile } from "../../../../../../lib/types";

type MemberRow = {
  id: string;
  member_key: string;
  display_name: string;
  username: string | null;
  role: "OWNER" | "MEMBER";
  joined_at: string;
};

async function contextFor(request: Request, groupId: string, memberId: string) {
  const viewer = await organizerFromRequest(request);
  if (!viewer) return { error: unauthorized() };
  await ensureDatabase();
  const db = database();
  const viewerMembership = await db.prepare("SELECT id, role FROM group_members WHERE group_id = ? AND member_key = ? AND membership_source = 'EXPLICIT'")
    .bind(groupId, viewer.email).first<{ id: string; role: "OWNER" | "MEMBER" }>();
  if (!viewerMembership) return { error: Response.json({ code: "GROUP_FORBIDDEN", message: "Круг недоступен" }, { status: 403 }) };
  const member = await db.prepare("SELECT id, member_key, display_name, username, role, joined_at FROM group_members WHERE id = ? AND group_id = ? AND membership_source = 'EXPLICIT'")
    .bind(memberId, groupId).first<MemberRow>();
  if (!member) return { error: Response.json({ code: "NOT_FOUND", message: "Участник не найден" }, { status: 404 }) };
  return { viewer, viewerMembership, member, db };
}

export async function GET(request: Request, context: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await context.params;
  const access = await contextFor(request, id, memberId);
  if (access.error) return access.error;
  const { viewer, viewerMembership, member, db } = access;

  const historyRows = await db.prepare(`SELECT DISTINCT a.id, a.starts_at FROM asars a
    LEFT JOIN requirements r ON r.asar_id = a.id
    LEFT JOIN commitments c ON c.requirement_id = r.id
    WHERE a.group_id = ? AND a.lifecycle_status = 'COMPLETED' AND COALESCE(a.outcome, 'FULL') != 'CANCELLED'
      AND (a.owner_email = ? OR ((c.participant_key = ? OR c.group_member_id = ?) AND c.status = 'ATTENDED'))
    ORDER BY a.starts_at DESC`).bind(id, member.member_key, member.member_key, member.id).all<{ id: string; starts_at: string }>();
  const history = (await Promise.all(historyRows.results.map((row) => getAsarView(row.id))))
    .filter((asar) => Boolean(asar))
    .map((asar) => ({ ...asar!, exactAddress: undefined }));
  const invitation = await db.prepare("SELECT MAX(invited_at) AS invited_at FROM group_member_invitations WHERE group_member_id = ?")
    .bind(member.id).first<{ invited_at: string | null }>();
  const candidateRows = await db.prepare("SELECT id, title, starts_at, lifecycle_status FROM asars WHERE group_id = ? AND owner_email = ? ORDER BY starts_at")
    .bind(id, viewer.email).all<{ id: string; title: string; starts_at: string; lifecycle_status: string }>();
  const invitableAsars = candidateRows.results
    .filter((asar) => ["PUBLISHED", "IN_PROGRESS"].includes(effectiveLifecycleStatus(asar.lifecycle_status, asar.starts_at)))
    .map((asar) => ({ id: asar.id, title: asar.title, startsAt: asar.starts_at }));
  const group = await getGroupSummary(id, viewer.email);
  if (!group) return Response.json({ code: "NOT_FOUND", message: "Круг не найден" }, { status: 404 });
  const isSelf = member.member_key === viewer.email;
  const canViewInvitationRecency = isSelf || viewerMembership.role === "OWNER";

  const profile: GroupMemberProfile = {
    id: member.id,
    displayName: member.display_name,
    ...(member.username ? { username: member.username } : {}),
    role: member.role,
    joinedAt: member.joined_at,
    offers: await getProfileOffers(member.member_key),
    completedAsarCount: history.length,
    ...(canViewInvitationRecency && invitation?.invited_at ? { lastInvitedAt: invitation.invited_at } : {}),
    canViewInvitationRecency,
    canReceiveBotInvite: /^telegram:\d+$/.test(member.member_key),
    isSelf,
    group,
    history,
    invitableAsars,
  };
  return Response.json({ member: profile }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await context.params;
  const access = await contextFor(request, id, memberId);
  if (access.error) return access.error;
  const { viewer, member, db } = access;
  if (member.member_key !== viewer.email) {
    return Response.json({ code: "MEMBER_FORBIDDEN", message: "Можно изменять только собственный профиль" }, { status: 403 });
  }
  const payload = await request.json() as { offers?: unknown };
  const offers = normalizeMemberOffers(payload.offers);
  if (!offers) return Response.json({ code: "INVALID_OFFERS", message: "Проверьте выбранные варианты помощи" }, { status: 400 });
  await db.batch([
    db.prepare("DELETE FROM profile_offers WHERE member_key = ?").bind(member.member_key),
    ...offers.map((kind) => db.prepare("INSERT INTO profile_offers (id, member_key, kind) VALUES (?, ?, ?)")
      .bind(crypto.randomUUID(), member.member_key, kind)),
  ]);
  return Response.json({ offers: await getProfileOffers(member.member_key) });
}
