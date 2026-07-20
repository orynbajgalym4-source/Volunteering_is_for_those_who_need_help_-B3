import type { Readiness, RequirementView } from "./domain";
import type { AsarCategory } from "./catalog";

export type AsarView = {
  id: string;
  ownerName: string;
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
