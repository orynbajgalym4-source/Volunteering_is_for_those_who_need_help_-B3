import { organizerFromRequest, unauthorized } from "../../../../../lib/auth.server";
import { hashToken, randomToken } from "../../../../../lib/security";
import { database, ensureDatabase, getAsarView } from "../../../../../lib/store.server";
import { telegramInviteLink } from "../../../../../lib/telegram-bot.server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  const current = await getAsarView(id, owner.email);
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });
  await ensureDatabase();
  const rows = await database().prepare("SELECT id, scope, requirement_id as requirementId, expires_at as expiresAt, revoked_at as revokedAt FROM invites WHERE asar_id = ? ORDER BY created_at DESC").bind(id).all();
  return Response.json({ invites: rows.results });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const { id } = await context.params;
  const current = await getAsarView(id, owner.email);
  if (!current) return Response.json({ code: "NOT_FOUND", message: "Асар не найден" }, { status: 404 });
  if (current.lifecycleStatus === "DRAFT") return Response.json({ code: "NOT_PUBLISHED", message: "Сначала опубликуйте асар" }, { status: 409 });
  const payload = await request.json() as { scope?: string; requirementId?: string };
  const scope = payload.scope === "SINGLE_REQUIREMENT" ? "SINGLE_REQUIREMENT" : "FULL_ASAR";
  if (scope === "SINGLE_REQUIREMENT" && !current.requirements.some((item) => item.id === payload.requirementId)) {
    return Response.json({ code: "INVALID_REQUIREMENT", message: "Потребность не принадлежит этому асару" }, { status: 400 });
  }
  await ensureDatabase();
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  await database().prepare("INSERT INTO invites (id, asar_id, requirement_id, scope, token_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), id, scope === "SINGLE_REQUIREMENT" ? payload.requirementId : null, scope, await hashToken(token), expiresAt).run();
  return Response.json({ invite: { token, scope, requirementId: scope === "SINGLE_REQUIREMENT" ? payload.requirementId : null, expiresAt, shareUrl: telegramInviteLink(token) } }, { status: 201 });
}
