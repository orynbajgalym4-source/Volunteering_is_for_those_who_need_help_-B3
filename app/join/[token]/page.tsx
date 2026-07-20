import type { Metadata } from "next";
import { headers } from "next/headers";
import { JoinAsar } from "../../../components/join-asar";
import { hashToken } from "../../../lib/security";
import { database, ensureDatabase } from "../../../lib/store.server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  try {
    await ensureDatabase();
    const row = await database().prepare(`SELECT a.title, a.public_location, a.starts_at, a.description, i.expires_at
      FROM invites i JOIN asars a ON a.id = i.asar_id
      WHERE i.token_hash = ? AND i.revoked_at IS NULL`)
      .bind(await hashToken(token)).first<{ title: string; public_location: string; starts_at: string; description: string; expires_at: string }>();
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) return { title: "Приглашение в Asar" };
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "asar-ready.q61505011.chatgpt.site";
    const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const origin = `${protocol}://${host}`;
    const when = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(row.starts_at));
    const description = `${when} · ${row.public_location || "Место уточняется"}. ${row.description || "Выберите конкретный вклад в общее дело."}`;
    return {
      title: `Асар: ${row.title}`,
      description,
      openGraph: { title: row.title, description, type: "website", url: `${origin}/join/${token}`, images: [{ url: `${origin}/og.png`, width: 1536, height: 1024, alt: row.title }] },
      twitter: { card: "summary_large_image", title: row.title, description, images: [`${origin}/og.png`] },
    };
  } catch { return { title: "Приглашение в Asar" }; }
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinAsar token={token} />;
}
