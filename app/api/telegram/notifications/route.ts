import { organizerFromRequest, unauthorized } from "../../../../lib/auth.server";
import { database, ensureDatabase } from "../../../../lib/store.server";

export async function GET(request: Request) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  await ensureDatabase();
  const row = await database().prepare("SELECT bot_messages_allowed FROM user_preferences WHERE owner_key = ?")
    .bind(owner.email).first<{ bot_messages_allowed: number }>();
  return Response.json({ allowed: Boolean(row?.bot_messages_allowed) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const payload = await request.json() as { allowed?: boolean };
  await ensureDatabase();
  await database().prepare(`INSERT INTO user_preferences (owner_key, bot_messages_allowed, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(owner_key) DO UPDATE SET bot_messages_allowed = excluded.bot_messages_allowed, updated_at = CURRENT_TIMESTAMP`)
    .bind(owner.email, payload.allowed ? 1 : 0).run();
  return Response.json({ allowed: Boolean(payload.allowed) });
}
