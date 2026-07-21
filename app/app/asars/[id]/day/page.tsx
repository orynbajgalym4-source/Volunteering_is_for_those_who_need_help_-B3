import { AsarDay } from "../../../../../components/asar-day";
export const dynamic = "force-dynamic";
export default async function DayPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AsarDay id={id} />; }
