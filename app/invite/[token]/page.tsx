import type { Metadata } from "next";
import { InviteRedirect } from "../../../components/invite-redirect";
import { resolvePublicInvite } from "../../../lib/invites.server";
import { telegramInviteLink } from "../../../lib/telegram-bot.server";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const { asar } = await resolvePublicInvite(token);
  if (!asar) return { title: "Приглашение в Asar", description: "Откройте приглашение внутри Telegram." };
  const requirement = asar.inviteScope === "SINGLE_REQUIREMENT" ? asar.requirements[0] : undefined;
  const description = requirement
    ? `Для асара «${asar.title}» нужен вклад: ${requirement.customTitle}. Откройте Telegram и подтвердите участие.`
    : `Присоединяйтесь к асару «${asar.title}». Выберите подходящую роль внутри Telegram.`;
  return {
    title: requirement ? `Нужен ${requirement.customTitle} — ${asar.title}` : `Асар: ${asar.title}`,
    description,
    robots: { index: false, follow: false },
    openGraph: { title: requirement ? `Нужен ${requirement.customTitle}` : asar.title, description, images: ["/og.png"] },
  };
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { asar } = await resolvePublicInvite(token);
  const requirement = asar?.inviteScope === "SINGLE_REQUIREMENT" ? asar.requirements[0] : undefined;
  return <InviteRedirect telegramUrl={telegramInviteLink(token)} title={asar?.title ?? "Асар"} role={requirement?.customTitle} />;
}
