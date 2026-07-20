import { ManageCommitment } from "../../../components/manage-commitment";
export const dynamic = "force-dynamic";
export default async function CommitmentPage({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; return <ManageCommitment token={token} />; }
