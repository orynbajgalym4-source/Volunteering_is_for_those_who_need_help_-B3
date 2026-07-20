import { ShareAsar } from "../../../../../components/share-asar";
export const dynamic = "force-dynamic";
export default async function SharePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ShareAsar id={id} />; }
