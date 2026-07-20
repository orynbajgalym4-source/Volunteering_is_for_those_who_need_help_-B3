export type LifecycleStatus = "DRAFT" | "PUBLISHED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type CommitmentStatus = "CLAIMED" | "CONFIRMED" | "ATTENDED" | "CANCELLED" | "NO_SHOW";
export type ReadinessState = "NOT_READY" | "PROVISIONAL" | "READY";

export type RequirementView = {
  id: string;
  kind: "PERSON" | "RESOURCE";
  title: string;
  description: string;
  requiredQuantity: number;
  isCritical: boolean;
  claimedQuantity: number;
  confirmedQuantity: number;
  commitments?: CommitmentView[];
};

export type CommitmentView = {
  id: string;
  participantName: string;
  contactType: "PHONE" | "TELEGRAM";
  contactValue?: string;
  quantity: number;
  status: CommitmentStatus;
  comment: string;
};

export type Readiness = {
  state: ReadinessState;
  percentage: number;
  missingCritical: string[];
  unconfirmedCritical: string[];
};

const ACTIVE = new Set<CommitmentStatus>(["CLAIMED", "CONFIRMED", "ATTENDED"]);
const CONFIRMED = new Set<CommitmentStatus>(["CONFIRMED", "ATTENDED"]);

export function quantities(commitments: Array<{ status: CommitmentStatus; quantity: number }>) {
  return commitments.reduce(
    (result, item) => {
      if (ACTIVE.has(item.status)) result.claimed += item.quantity;
      if (CONFIRMED.has(item.status)) result.confirmed += item.quantity;
      return result;
    },
    { claimed: 0, confirmed: 0 },
  );
}

export function calculateReadiness(requirements: RequirementView[]): Readiness {
  const missingCritical = requirements
    .filter((item) => item.isCritical && item.claimedQuantity < item.requiredQuantity)
    .map((item) => item.title);
  const unconfirmedCritical = requirements
    .filter((item) => item.isCritical && item.claimedQuantity >= item.requiredQuantity && item.confirmedQuantity < item.requiredQuantity)
    .map((item) => item.title);

  const weighted = requirements.reduce(
    (acc, item) => {
      const weight = item.isCritical ? 3 : 1;
      acc.total += weight;
      acc.filled += weight * Math.min(item.confirmedQuantity, item.requiredQuantity) / item.requiredQuantity;
      return acc;
    },
    { filled: 0, total: 0 },
  );

  return {
    state: missingCritical.length ? "NOT_READY" : unconfirmedCritical.length ? "PROVISIONAL" : "READY",
    percentage: weighted.total ? Math.round((weighted.filled / weighted.total) * 100) : 0,
    missingCritical,
    unconfirmedCritical,
  };
}

export function canTransition(from: LifecycleStatus, to: LifecycleStatus) {
  const allowed: Record<LifecycleStatus, LifecycleStatus[]> = {
    DRAFT: ["PUBLISHED", "CANCELLED"],
    PUBLISHED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };
  return allowed[from].includes(to);
}
