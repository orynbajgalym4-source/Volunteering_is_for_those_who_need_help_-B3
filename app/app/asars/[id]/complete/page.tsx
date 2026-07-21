import { CompleteAsar } from "../../../../../components/complete-asar";
export const dynamic = "force-dynamic";
export default async function CompletePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <CompleteAsar id={id} />; }
