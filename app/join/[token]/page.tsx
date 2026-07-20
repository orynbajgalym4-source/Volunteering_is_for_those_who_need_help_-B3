import { JoinAsar } from "../../../components/join-asar";
export const dynamic = "force-dynamic";
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; return <JoinAsar token={token} />; }
