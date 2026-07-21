import { CreateAsar } from "../../../../components/create-asar";
export const dynamic = "force-dynamic";
export default async function NewAsarPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const params = await searchParams;
  return <CreateAsar initialGroupId={params.group ?? ""} />;
}
