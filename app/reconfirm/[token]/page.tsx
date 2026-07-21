import type { Metadata } from "next";
import { ReconfirmAsar } from "../../../components/reconfirm-asar";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Перекличка перед асаром",
  description: "Подтвердите, что ваши роли перед асаром остаются в силе.",
  robots: { index: false, follow: false },
};

export default async function ReconfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ReconfirmAsar token={token} />;
}
