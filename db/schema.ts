import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  ownerKey: text("owner_key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  photoKey: text("photo_key"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("groups_owner_idx").on(table.ownerKey)]);

export const groupMembers = sqliteTable("group_members", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  memberKey: text("member_key").notNull(),
  displayName: text("display_name").notNull(),
  username: text("username"),
  role: text("role").notNull().default("MEMBER"),
  membershipSource: text("membership_source").notNull().default("EXPLICIT"),
  joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("group_members_group_member_idx").on(table.groupId, table.memberKey),
  index("group_members_member_idx").on(table.memberKey),
]);

export const asars = sqliteTable("asars", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  ownerName: text("owner_name").notNull(),
  groupId: text("group_id").references(() => groups.id, { onDelete: "set null" }),
  category: text("category").notNull().default("OTHER"),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  startsAt: text("starts_at").notNull(),
  timeMode: text("time_mode").notNull().default("EXACT"),
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
  participantKey: text("participant_key"),
  reminderOptIn: integer("reminder_opt_in", { mode: "boolean" }).notNull().default(false),
  groupMemberId: text("group_member_id").references(() => groupMembers.id, { onDelete: "set null" }),
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
  index("commitments_participant_idx").on(table.participantKey),
  index("commitments_group_member_idx").on(table.groupMemberId),
]);

export const reconfirmationRounds = sqliteTable("reconfirmation_rounds", {
  id: text("id").primaryKey(),
  asarId: text("asar_id").notNull().references(() => asars.id, { onDelete: "cascade" }),
  organizerKey: text("organizer_key").notNull(),
  scheduleKey: text("schedule_key").notNull(),
  startsAt: text("starts_at").notNull(),
  timeMode: text("time_mode").notNull(),
  expiresAt: text("expires_at").notNull(),
  closedAt: text("closed_at"),
  closeReason: text("close_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("reconfirmation_rounds_asar_schedule_idx").on(table.asarId, table.scheduleKey),
  uniqueIndex("reconfirmation_rounds_active_asar_idx").on(table.asarId).where(sql`${table.closedAt} IS NULL`),
  index("reconfirmation_rounds_asar_idx").on(table.asarId),
]);

export const reconfirmationRequests = sqliteTable("reconfirmation_requests", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => reconfirmationRounds.id, { onDelete: "cascade" }),
  participantRef: text("participant_ref").notNull(),
  participantKey: text("participant_key"),
  normalizedContactHash: text("normalized_contact_hash").notNull(),
  participantName: text("participant_name").notNull(),
  contactType: text("contact_type").notNull(),
  contactValue: text("contact_value").notNull(),
  deliveryStatus: text("delivery_status").notNull().default("PENDING"),
  tokenHash: text("token_hash"),
  tokenIssuedAt: text("token_issued_at"),
  deliveryAttempts: integer("delivery_attempts").notNull().default(0),
  reminderCount: integer("reminder_count").notNull().default(0),
  lastAttemptAt: text("last_attempt_at"),
  lastSentAt: text("last_sent_at"),
  openedAt: text("opened_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("reconfirmation_requests_round_participant_idx").on(table.roundId, table.participantRef),
  uniqueIndex("reconfirmation_requests_token_hash_idx").on(table.tokenHash),
  index("reconfirmation_requests_round_idx").on(table.roundId),
  index("reconfirmation_requests_participant_idx").on(table.participantKey),
]);

export const reconfirmationItems = sqliteTable("reconfirmation_items", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => reconfirmationRounds.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull().references(() => reconfirmationRequests.id, { onDelete: "cascade" }),
  commitmentId: text("commitment_id").notNull().references(() => commitments.id, { onDelete: "cascade" }),
  state: text("state").notNull().default("PENDING"),
  respondedAt: text("responded_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("reconfirmation_items_round_commitment_idx").on(table.roundId, table.commitmentId),
  uniqueIndex("reconfirmation_items_request_commitment_idx").on(table.requestId, table.commitmentId),
  index("reconfirmation_items_request_idx").on(table.requestId),
  index("reconfirmation_items_commitment_idx").on(table.commitmentId),
]);

export const memberOffers = sqliteTable("member_offers", {
  id: text("id").primaryKey(),
  groupMemberId: text("group_member_id").notNull().references(() => groupMembers.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("member_offers_member_kind_idx").on(table.groupMemberId, table.kind),
  index("member_offers_member_idx").on(table.groupMemberId),
]);

export const profileOffers = sqliteTable("profile_offers", {
  id: text("id").primaryKey(),
  memberKey: text("member_key").notNull(),
  kind: text("kind").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("profile_offers_member_kind_idx").on(table.memberKey, table.kind),
  index("profile_offers_member_idx").on(table.memberKey),
]);

export const asarOfferSnapshots = sqliteTable("asar_offer_snapshots", {
  id: text("id").primaryKey(),
  asarId: text("asar_id").notNull().references(() => asars.id, { onDelete: "cascade" }),
  groupMemberId: text("group_member_id").notNull().references(() => groupMembers.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("asar_offer_snapshots_asar_member_kind_idx").on(table.asarId, table.groupMemberId, table.kind),
  index("asar_offer_snapshots_asar_idx").on(table.asarId),
]);

export const groupMemberInvitations = sqliteTable("group_member_invitations", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  asarId: text("asar_id").notNull().references(() => asars.id, { onDelete: "cascade" }),
  groupMemberId: text("group_member_id").notNull().references(() => groupMembers.id, { onDelete: "cascade" }),
  invitedByKey: text("invited_by_key").notNull(),
  invitedAt: text("invited_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("group_member_invitations_member_idx").on(table.groupMemberId, table.invitedAt),
  index("group_member_invitations_asar_idx").on(table.asarId),
]);

export const userPreferences = sqliteTable("user_preferences", {
  ownerKey: text("owner_key").primaryKey(),
  botMessagesAllowed: integer("bot_messages_allowed", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
