import { AsarDetail } from "../../../../components/asar-detail";
export const dynamic = "force-dynamic";
export default async function AsarDetailPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AsarDetail id={id} />; }
