import { organizerFromRequest, unauthorized } from "../../../lib/auth.server";
import { database, ensureDatabase, getGroupsForMember, getGroupSummary, groupImages } from "../../../lib/store.server";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(request: Request) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  return Response.json({ groups: await getGroupsForMember(owner.email) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const owner = await organizerFromRequest(request);
  if (!owner) return unauthorized();
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const photo = form.get("photo");
  if (!name || name.length > 80) return Response.json({ code: "INVALID_GROUP_NAME", message: "Введите название круга до 80 символов" }, { status: 400 });
  if (description.length > 500) return Response.json({ code: "INVALID_GROUP_DESCRIPTION", message: "Описание должно быть короче 500 символов" }, { status: 400 });
  if (photo instanceof File && photo.size > 0 && (!IMAGE_TYPES.has(photo.type) || photo.size > 3 * 1024 * 1024)) {
    return Response.json({ code: "INVALID_GROUP_PHOTO", message: "Загрузите JPG, PNG или WebP размером до 3 МБ" }, { status: 400 });
  }

  await ensureDatabase();
  const groupId = crypto.randomUUID();
  const photoKey = photo instanceof File && photo.size > 0 ? `groups/${groupId}/${crypto.randomUUID()}` : null;
  if (photoKey && photo instanceof File) {
    await groupImages().put(photoKey, photo.stream(), { httpMetadata: { contentType: photo.type, cacheControl: "public, max-age=86400" } });
  }
  try {
    const db = database();
    await db.batch([
      db.prepare("INSERT INTO groups (id, owner_key, name, description, photo_key) VALUES (?, ?, ?, ?, ?)")
        .bind(groupId, owner.email, name, description, photoKey),
      db.prepare("INSERT INTO group_members (id, group_id, member_key, display_name, username, role) VALUES (?, ?, ?, ?, ?, 'OWNER')")
        .bind(crypto.randomUUID(), groupId, owner.email, owner.displayName, owner.username ?? null),
    ]);
  } catch (caught) {
    if (photoKey) await groupImages().delete(photoKey).catch(() => undefined);
    throw caught;
  }
  return Response.json({ group: await getGroupSummary(groupId, owner.email) }, { status: 201 });
}
