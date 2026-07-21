import { organizerFromRequest, unauthorized } from "../../../lib/auth.server";
import { database, ensureDatabase, getAsarView, getGroupsForMember } from "../../../lib/store.server";
import type { SelfProfileView } from "../../../lib/types";

export async function GET(request: Request) {
  const viewer = await organizerFromRequest(request);
  if (!viewer) return unauthorized();

  await ensureDatabase();
  const historyRows = await database().prepare(`SELECT DISTINCT a.id, a.starts_at FROM asars a
    LEFT JOIN requirements r ON r.asar_id = a.id
    LEFT JOIN commitments c ON c.requirement_id = r.id
    LEFT JOIN group_members gm ON gm.id = c.group_member_id
    WHERE a.lifecycle_status = 'COMPLETED' AND COALESCE(a.outcome, 'FULL') != 'CANCELLED'
      AND (a.owner_email = ? OR (gm.member_key = ? AND c.status = 'ATTENDED'))
    ORDER BY a.starts_at DESC`).bind(viewer.email, viewer.email).all<{ id: string; starts_at: string }>();
  const history = (await Promise.all(historyRows.results.map((row) => getAsarView(row.id))))
    .filter((asar) => Boolean(asar))
    .map((asar) => ({ ...asar!, exactAddress: undefined }));

  const profile: SelfProfileView = {
    displayName: viewer.displayName,
    ...(viewer.username ? { username: viewer.username } : {}),
    groups: await getGroupsForMember(viewer.email),
    history,
  };
  return Response.json({ profile }, { headers: { "Cache-Control": "no-store" } });
}
