import { calculateReadiness } from "./domain";
import { hashToken } from "./security";
import { database, ensureDatabase, getGroupSummary, getRequirements, mapAsar } from "./store.server";

export type InviteRow = {
  id: string;
  asar_id: string;
  requirement_id: string | null;
  scope: "FULL_ASAR" | "SINGLE_REQUIREMENT";
  expires_at: string;
  revoked_at: string | null;
};

export async function inviteByToken(token: string) {
  await ensureDatabase();
  return database().prepare("SELECT * FROM invites WHERE token_hash = ?").bind(await hashToken(token)).first<InviteRow>();
}

export function inviteValidationError(invite: InviteRow | null) {
  if (!invite || invite.revoked_at) return "Приглашение недоступно";
  if (new Date(invite.expires_at).getTime() < Date.now()) return "Срок действия приглашения завершён";
  return null;
}

export async function publicInviteView(invite: InviteRow) {
  const asarRow = await database().prepare("SELECT * FROM asars WHERE id = ?").bind(invite.asar_id).first<Record<string, unknown>>();
  if (!asarRow) return null;
  let requirements = await getRequirements(invite.asar_id, false);
  if (invite.scope === "SINGLE_REQUIREMENT") requirements = requirements.filter((item) => item.id === invite.requirement_id);
  requirements = requirements.map((item) => ({ ...item, commitments: undefined }));
  const allRequirements = await getRequirements(invite.asar_id, false);
  const mapped = mapAsar(asarRow);
  const group = mapped.groupId ? await getGroupSummary(mapped.groupId) : undefined;
  return {
    ...mapped,
    group,
    exactAddress: undefined,
    requirements,
    readiness: calculateReadiness(allRequirements),
    inviteScope: invite.scope,
  };
}

export async function resolvePublicInvite(token: string) {
  const invite = await inviteByToken(token);
  const error = inviteValidationError(invite);
  if (error || !invite) return { invite: null, asar: null, error: error ?? "Приглашение недоступно" };
  return { invite, asar: await publicInviteView(invite), error: "" };
}
