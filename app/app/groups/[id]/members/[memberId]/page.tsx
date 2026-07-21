import { GroupMemberProfile } from "../../../../../../components/group-member-profile";

export default async function GroupMemberPage({ params }: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await params;
  return <GroupMemberProfile groupId={id} memberId={memberId} />;
}
