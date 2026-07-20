import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const asars = sqliteTable("asars", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  ownerName: text("owner_name").notNull(),
  category: text("category").notNull().default("OTHER"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  startsAt: text("starts_at").notNull(),
  publicLocation: text("public_location").notNull(),
  exactAddress: text("exact_address").notNull(),
  lifecycleStatus: text("lifecycle_status").notNull().default("DRAFT"),
  beneficiaryConsentConfirmed: integer("beneficiary_consent_confirmed", { mode: "boolean" }).notNull().default(false),
  outcome: text("outcome"),
  outcomeNote: text("outcome_note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("asars_owner_idx").on(table.ownerEmail)]);

export const requirements = sqliteTable("requirements", {
  id: text("id").primaryKey(),
  asarId: text("asar_id").notNull().references(() => asars.id, { onDelete: "cascade" }),
  type: text("kind").notNull(),
  customTitle: text("title").notNull(),
  description: text("description").notNull().default(""),
  requiredQuantity: integer("required_quantity").notNull(),
  isCritical: integer("is_critical", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("requirements_asar_idx").on(table.asarId)]);

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  asarId: text("asar_id").notNull().references(() => asars.id, { onDelete: "cascade" }),
  requirementId: text("requirement_id").references(() => requirements.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("invites_token_hash_idx").on(table.tokenHash), index("invites_asar_idx").on(table.asarId)]);

export const commitments = sqliteTable("commitments", {
  id: text("id").primaryKey(),
  requirementId: text("requirement_id").notNull().references(() => requirements.id, { onDelete: "cascade" }),
  participantName: text("participant_name").notNull(),
  contactType: text("contact_type").notNull(),
  contactValue: text("contact_value").notNull(),
  normalizedContactHash: text("normalized_contact_hash").notNull(),
  quantity: integer("quantity").notNull().default(1),
  status: text("status").notNull().default("CLAIMED"),
  manageTokenHash: text("manage_token_hash").notNull(),
  comment: text("comment").notNull().default(""),
  claimedAt: text("claimed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  confirmedAt: text("confirmed_at"),
  attendedAt: text("attended_at"),
  cancelledAt: text("cancelled_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("commitments_manage_hash_idx").on(table.manageTokenHash),
  uniqueIndex("commitments_contact_requirement_idx").on(table.requirementId, table.normalizedContactHash),
  index("commitments_requirement_idx").on(table.requirementId),
]);
