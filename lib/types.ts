import type { Readiness, RequirementView } from "./domain";
import type { AsarCategory } from "./catalog";
import type { MemberOffer } from "./member-offers";

export type GroupSummary = {
  id: string;
  name: string;
  description: string;
  photoUrl?: string;
  role?: "OWNER" | "MEMBER";
  currentMemberId?: string;
  memberCount: number;
  asarCount: number;
};

export type GroupMemberView = {
  id: string;
  displayName: string;
  username?: string;
  role: "OWNER" | "MEMBER";
  joinedAt: string;
  offers: MemberOffer[];
  completedAsarCount: number;
  lastInvitedAt?: string;
  canViewInvitationRecency?: boolean;
  canReceiveBotInvite: boolean;
};

export type GroupView = GroupSummary & {
  members: GroupMemberView[];
  asars: AsarView[];
};

export type AsarView = {
  id: string;
  ownerName: string;
  group?: GroupSummary;
  category: AsarCategory;
  title: string;
  description: string;
  startsAt: string;
  timeMode: AsarTimeMode;
  publicLocation: string;
  exactAddress?: string;
  lifecycleStatus: string;
  outcome?: string;
  outcomeNote?: string;
  requirements: RequirementView[];
  readiness: Readiness;
  inviteScope?: "FULL_ASAR" | "SINGLE_REQUIREMENT";
  followUpOffers?: Array<{ memberId: string; displayName: string; offers: MemberOffer[] }>;
  reconfirmation?: ReconfirmationOverview;
  reconfirmationSummary?: ReconfirmationSummary;
};

export type GroupMemberProfile = GroupMemberView & {
  isSelf: boolean;
  group: GroupSummary;
  history: AsarView[];
  invitableAsars: Array<{ id: string; title: string; startsAt: string }>;
};

export type SelfProfileView = {
  displayName: string;
  username?: string;
  offers: MemberOffer[];
  groups: GroupSummary[];
  history: AsarView[];
};

export type AsarTimeMode = "EXACT" | "MORNING" | "AFTERNOON" | "EVENING" | "FLEXIBLE";

export type ReconfirmationItemState = "PENDING" | "CONFIRMED" | "CANCELLED";
export type ReconfirmationDeliveryStatus = "PENDING" | "BOT_SENT" | "BOT_FAILED" | "MANUAL_REQUIRED" | "MANUAL_LINK_ISSUED";

export type ReconfirmationEligibility = {
  canStart: boolean;
  reason?: string;
  windowOpensAt: string;
  expiresAt: string;
  confirmedPeople: number;
  botEligiblePeople: number;
  manualPeople: number;
};

export type ReconfirmationItemView = {
  commitmentId: string;
  requirementId: string;
  requirementTitle: string;
  quantity: number;
  isCritical: boolean;
  state: ReconfirmationItemState;
};

export type ReconfirmationRequestView = {
  id: string;
  displayName: string;
  contactValue?: string;
  deliveryStatus: ReconfirmationDeliveryStatus;
  openedAt?: string;
  reminderCount: number;
  canRemind: boolean;
  items: ReconfirmationItemView[];
};

export type ReconfirmationRoundView = {
  id: string;
  createdAt: string;
  expiresAt: string;
  isOpen: boolean;
  canDeliver: boolean;
  totalPeople: number;
  answeredPeople: number;
  totalItems: number;
  confirmedItems: number;
  pendingItems: number;
  cancelledItems: number;
  criticalPendingItems: number;
  requests: ReconfirmationRequestView[];
};

export type ReconfirmationSummary = Pick<
  ReconfirmationRoundView,
  "id" | "isOpen" | "totalPeople" | "answeredPeople" | "pendingItems" | "criticalPendingItems"
>;

export type ReconfirmationOverview = {
  eligibility: ReconfirmationEligibility;
  round?: ReconfirmationRoundView;
};

export type PublicReconfirmationView = {
  asar: Pick<AsarView, "title" | "startsAt" | "timeMode" | "publicLocation" | "exactAddress" | "lifecycleStatus">;
  participantName: string;
  expiresAt: string;
  items: Array<Pick<ReconfirmationItemView, "commitmentId" | "requirementTitle" | "quantity" | "isCritical" | "state">>;
};
