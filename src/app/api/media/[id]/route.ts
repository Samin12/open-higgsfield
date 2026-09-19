import {
  actor,
  db,
  bucket,
  projectAccess,
  validSignature,
  now,
  AppError,
  fail,
} from "@/studio/server";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const u = new URL(req.url);
    const expires = Number(u.searchParams.get("expires"));
    const sig = u.searchParams.get("sig") || "";
    const signed =
      expires > now() &&
      expires < now() + 86400001 &&
      (await validSignature(id + ":" + expires, sig));
    const a = await db()
      .prepare("SELECT * FROM assets WHERE id=?")
      .bind(id)
      .first<any>();
    if (!a) fail(404, "File not found.");
    if (!signed) {
      const who = await actor();
      await projectAccess(who.id, a.project_id);
    }
    const object = await bucket().get(a.object_key, { range: req.headers });
    if (!object) fail(404, "File not found.");
    const h = new Headers({
      "Content-Type": a.content_type,
      "Cache-Control": "private, max-age=300",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    object.writeHttpMetadata(h);
    if (object.range && "offset" in object.range) {
      const range = object.range as { offset: number; length: number };
      h.set(
        "Content-Range",
        `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`,
      );
      h.set("Content-Length", String(range.length));
      return new Response(object.body, { status: 206, headers: h });
    }
    h.set("Content-Length", String(object.size));
    return new Response(object.body, { headers: h });
  } catch (e) {
    return Response.json(
      { error: e instanceof AppError ? e.message : "File unavailable" },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
