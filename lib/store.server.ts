import { env } from "cloudflare:workers";
import { calculateReadiness, quantities, type CommitmentStatus, type RequirementView } from "./domain";
import { normalizeAsarCategory, normalizeRequirementType } from "./catalog";

export function database(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

let initialized = false;
export async function ensureDatabase() {
  if (initialized) return;
  const db = database();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS asars (
      id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, owner_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'OTHER',
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL,
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
      normalized_contact_hash TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'CLAIMED', manage_token_hash TEXT NOT NULL UNIQUE,
      comment TEXT NOT NULL DEFAULT '',
      claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmed_at TEXT, attended_at TEXT,
      cancelled_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(requirement_id, normalized_contact_hash)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS asars_owner_idx ON asars(owner_email)"),
    db.prepare("CREATE INDEX IF NOT EXISTS requirements_asar_idx ON requirements(asar_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS invites_asar_idx ON invites(asar_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS commitments_requirement_idx ON commitments(requirement_id)"),
  ]);
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
  return { ...mapAsar(asar), requirements, readiness: calculateReadiness(requirements) };
}

export function mapAsar(row: Record<string, unknown>) {
  return {
    id: row.id,
    ownerName: row.owner_name,
    category: normalizeAsarCategory(row.category),
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    publicLocation: row.public_location,
    exactAddress: row.exact_address,
    lifecycleStatus: row.lifecycle_status,
    beneficiaryConsentConfirmed: Boolean(row.beneficiary_consent_confirmed),
    outcome: row.outcome,
    outcomeNote: row.outcome_note,
    createdAt: row.created_at,
  };
}
