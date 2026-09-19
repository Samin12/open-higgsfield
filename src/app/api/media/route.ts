import { NextResponse } from "next/server";
import {
  actor,
  db,
  bucket,
  uid,
  now,
  projectAccess,
  checkOrigin,
  AppError,
  fail,
} from "@/studio/server";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const u = await actor();
    const project = new URL(req.url).searchParams.get("project") || "";
    const { project: p } = await projectAccess(u.id, project, true);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) fail(400, "Choose a file.");
    if (file.size > 40 * 1024 * 1024)
      fail(413, "Use a file smaller than 40 MB.");
    if (
      !/^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|wav|x-wav|ogg))$/.test(
        file.type,
      )
    )
      fail(400, "Use JPG, PNG, WebP, MP4, WebM, MOV or audio.");
    const aid = uid();
    const key = p.workspace_id + "/" + aid;
    await bucket().put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    await db()
      .prepare(
        "INSERT INTO assets(id,workspace_id,project_id,user_id,filename,content_type,size,object_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        aid,
        p.workspace_id,
        project,
        u.id,
        file.name.slice(0, 180),
        file.type,
        file.size,
        key,
        now(),
      )
      .run();
    return NextResponse.json({
      id: aid,
      url: "/api/media/" + aid,
      filename: file.name,
      content_type: file.type,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "Upload could not be saved. Please try again.",
      },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
