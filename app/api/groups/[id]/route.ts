import { organizerFromRequest, unauthorized } from "../../../../lib/auth.server";
import { database, ensureDatabase, getAsarView, getGroupSummary } from "../../../../lib/store.server";
import type { GroupMemberView } from "../../../../lib/types";

type MemberRow = { id: string; display_name: string; username: string | null; role: "OWNER" | "MEMBER"; joined_at: string };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  await ensureDatabase();
  const db = database();
  const membership = await db.prepare("SELECT role FROM group_members WHERE group_id = ? AND member_key = ?").bind(id, owner.email).first();
  if (!membership) return Response.json({ code: "GROUP_FORBIDDEN", message: "Группа недоступна" }, { status: 403 });
  const group = await getGroupSummary(id, owner.email);
  if (!group) return Response.json({ code: "NOT_FOUND", message: "Группа не найдена" }, { status: 404 });
  const memberRows = await db.prepare("SELECT id, display_name, username, role, joined_at FROM group_members WHERE group_id = ? ORDER BY role = 'OWNER' DESC, joined_at")
    .bind(id).all<MemberRow>();
  const asarRows = await db.prepare("SELECT id FROM asars WHERE group_id = ? ORDER BY starts_at DESC").bind(id).all<{ id: string }>();
  const asars = (await Promise.all(asarRows.results.map((row) => getAsarView(row.id)))).filter((asar) => Boolean(asar)).map((asar) => ({ ...asar!, exactAddress: undefined }));
  const members: GroupMemberView[] = memberRows.results.map((row) => ({ id: row.id, displayName: row.display_name, ...(row.username ? { username: row.username } : {}), role: row.role, joinedAt: row.joined_at }));
  return Response.json({ group: { ...group, members, asars } }, { headers: { "Cache-Control": "no-store" } });
}
