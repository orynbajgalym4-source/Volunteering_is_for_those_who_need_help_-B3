import type { Readiness, RequirementView } from "./domain";
import type { AsarCategory } from "./catalog";

export type GroupSummary = {
  id: string;
  name: string;
  description: string;
  photoUrl?: string;
  role?: "OWNER" | "MEMBER";
  memberCount: number;
  asarCount: number;
};

export type GroupMemberView = {
  id: string;
  displayName: string;
  username?: string;
  role: "OWNER" | "MEMBER";
  joinedAt: string;
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
  publicLocation: string;
  exactAddress?: string;
  lifecycleStatus: string;
  outcome?: string;
  outcomeNote?: string;
  requirements: RequirementView[];
  readiness: Readiness;
  inviteScope?: "FULL_ASAR" | "SINGLE_REQUIREMENT";
};
