import { GroupDetail } from "../../../../components/group-detail";
export const dynamic = "force-dynamic";
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <GroupDetail id={id} />; }
