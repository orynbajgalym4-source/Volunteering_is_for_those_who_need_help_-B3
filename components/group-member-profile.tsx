"use client";

import { UnifiedProfilePage } from "./unified-profile";

export function GroupMemberProfile({ groupId, memberId }: { groupId: string; memberId: string }) {
  return <UnifiedProfilePage groupId={groupId} memberId={memberId} />;
}
