import { database, ensureDatabase, groupImages } from "../../../../../lib/store.server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await ensureDatabase();
  const row = await database().prepare("SELECT photo_key FROM groups WHERE id = ?").bind(id).first<{ photo_key: string | null }>();
  if (!row?.photo_key) return new Response(null, { status: 404 });
  const object = await groupImages().get(row.photo_key);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({ "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
