import { env } from "cloudflare:workers";
import { calculateReadiness, effectiveLifecycleStatus, quantities, type CommitmentStatus, type RequirementView } from "./domain";
import { normalizeAsarCategory, normalizeRequirementType } from "./catalog";
import type { GroupSummary } from "./types";
import { isMemberOffer, type MemberOffer } from "./member-offers";

export function database(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export function groupImages(): R2Bucket {
  const bucket = (env as typeof env & { GROUP_IMAGES?: R2Bucket }).GROUP_IMAGES;
  if (!bucket) throw new Error("R2 binding GROUP_IMAGES is unavailable");
  return bucket;
}

let initialized = false;
export async function ensureDatabase() {
  if (initialized) return;
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', photo_key TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      member_key TEXT NOT NULL, display_name TEXT NOT NULL, username TEXT,
      role TEXT NOT NULL DEFAULT 'MEMBER', membership_source TEXT NOT NULL DEFAULT 'EXPLICIT',
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, member_key)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS asars (
      id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, owner_name TEXT NOT NULL,
      group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
      category TEXT NOT NULL DEFAULT 'OTHER',
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL,
      time_mode TEXT NOT NULL DEFAULT 'EXACT',
      public_location TEXT NOT NULL, exact_address TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT', beneficiary_consent_confirmed INTEGER NOT NULL DEFAULT 0,
      outcome TEXT, outcome_note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS requirements (
      id TEXT PRIMARY KEY, asar_id TEXT NOT NULL REFERENCES asars(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      required_quantity INTEGER NOT NULL CHECK(required_quantity > 0), is_critical INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY, asar_id TEXT NOT NULL REFERENCES asars(id) ON DELETE CASCADE,
      requirement_id TEXT REFERENCES requirements(id) ON DELETE CASCADE, scope TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
      revoked_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS commitments (
      id TEXT PRIMARY KEY, requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
      participant_name TEXT NOT NULL, contact_type TEXT NOT NULL, contact_value TEXT NOT NULL,
      normalized_contact_hash TEXT NOT NULL, participant_key TEXT,
      group_member_id TEXT REFERENCES group_members(id) ON DELETE SET NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'CLAIMED', manage_token_hash TEXT NOT NULL UNIQUE,
      comment TEXT NOT NULL DEFAULT '',
      claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmed_at TEXT, attended_at TEXT,
      cancelled_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(requirement_id, normalized_contact_hash)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS user_preferences (
      owner_key TEXT PRIMARY KEY, bot_messages_allowed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS member_offers (
      id TEXT PRIMARY KEY, group_member_id TEXT NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_member_id, kind)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS profile_offers (
      id TEXT PRIMARY KEY, member_key TEXT NOT NULL, kind TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(member_key, kind)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS asar_offer_snapshots (
      id TEXT PRIMARY KEY, asar_id TEXT NOT NULL REFERENCES asars(id) ON DELETE CASCADE,
      group_member_id TEXT NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(asar_id, group_member_id, kind)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS group_member_invitations (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      asar_id TEXT NOT NULL REFERENCES asars(id) ON DELETE CASCADE,
      group_member_id TEXT NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
      invited_by_key TEXT NOT NULL, invited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS asars_owner_idx ON asars(owner_email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS groups_owner_idx ON groups(owner_key)"),
    db.prepare("CREATE INDEX IF NOT EXISTS group_members_member_idx ON group_members(member_key)"),
    db.prepare("CREATE INDEX IF NOT EXISTS requirements_asar_idx ON requirements(asar_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS invites_asar_idx ON invites(asar_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS commitments_requirement_idx ON commitments(requirement_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS member_offers_member_idx ON member_offers(group_member_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS profile_offers_member_idx ON profile_offers(member_key)"),
    db.prepare("CREATE INDEX IF NOT EXISTS asar_offer_snapshots_asar_idx ON asar_offer_snapshots(asar_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS group_member_invitations_member_idx ON group_member_invitations(group_member_id, invited_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS group_member_invitations_asar_idx ON group_member_invitations(asar_id)"),
  ]);
  const asarColumns = await db.prepare("PRAGMA table_info(asars)").all<{ name: string }>();
  if (!asarColumns.results.some((column) => column.name === "group_id")) {
    await db.prepare("ALTER TABLE asars ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE SET NULL").run();
  }
  if (!asarColumns.results.some((column) => column.name === "time_mode")) {
    await db.prepare("ALTER TABLE asars ADD COLUMN time_mode TEXT NOT NULL DEFAULT 'EXACT'").run();
  }
  const groupMemberColumns = await db.prepare("PRAGMA table_info(group_members)").all<{ name: string }>();
  if (!groupMemberColumns.results.some((column) => column.name === "membership_source")) {
    await db.prepare("ALTER TABLE group_members ADD COLUMN membership_source TEXT NOT NULL DEFAULT 'EXPLICIT'").run();
    await db.prepare("UPDATE group_members SET membership_source = 'ASAR_RESPONSE' WHERE role = 'MEMBER'").run();
  }
  const commitmentColumns = await db.prepare("PRAGMA table_info(commitments)").all<{ name: string }>();
  if (!commitmentColumns.results.some((column) => column.name === "group_member_id")) {
    await db.prepare("ALTER TABLE commitments ADD COLUMN group_member_id TEXT REFERENCES group_members(id) ON DELETE SET NULL").run();
  }
  if (!commitmentColumns.results.some((column) => column.name === "participant_key")) {
    await db.prepare("ALTER TABLE commitments ADD COLUMN participant_key TEXT").run();
  }
  await db.prepare("CREATE INDEX IF NOT EXISTS asars_group_idx ON asars(group_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS commitments_group_member_idx ON commitments(group_member_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS commitments_participant_idx ON commitments(participant_key)").run();
  await db.prepare(`INSERT OR IGNORE INTO profile_offers (id, member_key, kind, updated_at)
    SELECT mo.id, gm.member_key, mo.kind, mo.updated_at
    FROM member_offers mo JOIN group_members gm ON gm.id = mo.group_member_id`).run();
  initialized = true;
}

type RawRequirement = {
  id: string; kind: string; title: string; description: string;
  required_quantity: number; is_critical: number; sort_order: number;
};
type RawCommitment = {
  id: string; requirement_id: string; participant_name: string; contact_type: "PHONE" | "TELEGRAM";
  contact_value: string; quantity: number; status: CommitmentStatus; comment: string;
};

export async function getRequirements(asarId: string, includeContacts = false): Promise<RequirementView[]> {
  await ensureDatabase();
  const db = database();
  const requirementRows = await db.prepare("SELECT * FROM requirements WHERE asar_id = ? ORDER BY sort_order, created_at").bind(asarId).all<RawRequirement>();
  const commitmentRows = await db.prepare(`SELECT c.* FROM commitments c JOIN requirements r ON r.id = c.requirement_id WHERE r.asar_id = ? ORDER BY c.created_at`).bind(asarId).all<RawCommitment>();
  return requirementRows.results.map((row) => {
    const related = commitmentRows.results.filter((item) => item.requirement_id === row.id);
    const total = quantities(related.map((item) => ({ status: item.status, quantity: item.quantity })));
    return {
      id: row.id,
      type: normalizeRequirementType(row.kind),
      customTitle: row.title,
      description: row.description,
      requiredQuantity: row.required_quantity,
      isCritical: Boolean(row.is_critical),
      claimedQuantity: total.claimed,
      confirmedQuantity: total.confirmed,
      commitments: related.map((item) => ({
        id: item.id,
        participantName: item.participant_name,
        contactType: item.contact_type,
        ...(includeContacts ? { contactValue: item.contact_value } : {}),
        quantity: item.quantity,
        status: item.status,
        comment: item.comment,
      })),
    };
  });
}

export async function getAsarView(asarId: string, ownerEmail?: string) {
  await ensureDatabase();
  const db = database();
  const query = ownerEmail
    ? db.prepare("SELECT * FROM asars WHERE id = ? AND owner_email = ?").bind(asarId, ownerEmail)
    : db.prepare("SELECT * FROM asars WHERE id = ?").bind(asarId);
  const asar = await query.first<Record<string, unknown>>();
  if (!asar) return null;
  const requirements = await getRequirements(asarId, Boolean(ownerEmail));
  const mapped = mapAsar(asar);
  const group = mapped.groupId ? await getGroupSummary(mapped.groupId, ownerEmail) : undefined;
  const followUpOffers = await getAsarOfferSnapshots(asarId);
  return { ...mapped, group, requirements, readiness: calculateReadiness(requirements), followUpOffers };
}

type RawGroup = {
  id: string; name: string; description: string; photo_key: string | null;
  role?: "OWNER" | "MEMBER" | null; member_id?: string | null; member_count: number; asar_count: number;
};

function mapGroup(row: RawGroup): GroupSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ...(row.photo_key ? { photoUrl: `/api/groups/${row.id}/image` } : {}),
    ...(row.role ? { role: row.role } : {}),
    ...(row.member_id ? { currentMemberId: row.member_id } : {}),
    memberCount: Number(row.member_count),
    asarCount: Number(row.asar_count),
  };
}

export async function getGroupSummary(groupId: string, memberKey?: string): Promise<GroupSummary | undefined> {
  await ensureDatabase();
  const row = await database().prepare(`SELECT g.*, gm.role, gm.id AS member_id,
    (SELECT COUNT(*) FROM group_members members WHERE members.group_id = g.id AND members.membership_source = 'EXPLICIT') AS member_count,
    (SELECT COUNT(*) FROM asars a WHERE a.group_id = g.id) AS asar_count
    FROM groups g LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.member_key = ? AND gm.membership_source = 'EXPLICIT' WHERE g.id = ?`)
    .bind(memberKey ?? "", groupId).first<RawGroup>();
  if (!row) return undefined;
  return mapGroup(row);
}

export async function getGroupsForMember(memberKey: string): Promise<GroupSummary[]> {
  await ensureDatabase();
  const rows = await database().prepare(`SELECT g.*, gm.role, gm.id AS member_id,
    (SELECT COUNT(*) FROM group_members members WHERE members.group_id = g.id AND members.membership_source = 'EXPLICIT') AS member_count,
    (SELECT COUNT(*) FROM asars a WHERE a.group_id = g.id) AS asar_count
    FROM group_members gm JOIN groups g ON g.id = gm.group_id
    WHERE gm.member_key = ? AND gm.membership_source = 'EXPLICIT' ORDER BY g.updated_at DESC`).bind(memberKey).all<RawGroup>();
  return rows.results.map(mapGroup);
}

export async function getMemberOffers(groupMemberId: string): Promise<MemberOffer[]> {
  await ensureDatabase();
  const rows = await database().prepare("SELECT kind FROM member_offers WHERE group_member_id = ? ORDER BY updated_at, kind")
    .bind(groupMemberId).all<{ kind: string }>();
  return rows.results.map((row) => row.kind).filter(isMemberOffer);
}

export async function getProfileOffers(memberKey: string): Promise<MemberOffer[]> {
  await ensureDatabase();
  const rows = await database().prepare("SELECT kind FROM profile_offers WHERE member_key = ? ORDER BY updated_at, kind")
    .bind(memberKey).all<{ kind: string }>();
  return rows.results.map((row) => row.kind).filter(isMemberOffer);
}

export async function getAsarOfferSnapshots(asarId: string) {
  await ensureDatabase();
  const rows = await database().prepare(`SELECT snapshots.group_member_id, snapshots.kind, members.display_name
    FROM asar_offer_snapshots snapshots JOIN group_members members ON members.id = snapshots.group_member_id
    WHERE snapshots.asar_id = ? ORDER BY snapshots.created_at, snapshots.kind`)
    .bind(asarId).all<{ group_member_id: string; kind: string; display_name: string }>();
  const grouped = new Map<string, { memberId: string; displayName: string; offers: MemberOffer[] }>();
  for (const row of rows.results) {
    if (!isMemberOffer(row.kind)) continue;
    const current = grouped.get(row.group_member_id) ?? { memberId: row.group_member_id, displayName: row.display_name, offers: [] };
    current.offers.push(row.kind);
    grouped.set(row.group_member_id, current);
  }
  return [...grouped.values()];
}

export function mapAsar(row: Record<string, unknown>) {
  return {
    id: row.id,
    ownerName: row.owner_name,
    groupId: row.group_id ? String(row.group_id) : undefined,
    category: normalizeAsarCategory(row.category),
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    timeMode: (["EXACT", "MORNING", "AFTERNOON", "EVENING", "FLEXIBLE"].includes(String(row.time_mode)) ? String(row.time_mode) : "EXACT") as "EXACT" | "MORNING" | "AFTERNOON" | "EVENING" | "FLEXIBLE",
    publicLocation: row.public_location,
    exactAddress: row.exact_address,
    lifecycleStatus: effectiveLifecycleStatus(String(row.lifecycle_status), String(row.starts_at)),
    beneficiaryConsentConfirmed: Boolean(row.beneficiary_consent_confirmed),
    outcome: row.outcome,
    outcomeNote: row.outcome_note,
    createdAt: row.created_at,
  };
}
