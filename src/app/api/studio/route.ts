import { archiveResults } from "@/studio/archive";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  actor,
  db,
  uid,
  now,
  membership,
  projectAccess,
  jobAccess,
  fail,
  checkOrigin,
  encrypt,
  apiKey,
  provider,
  hash,
  assetURL,
  AppError,
} from "@/studio/server";
import {
  canCreate,
  canReadProject,
  canMoveStage,
  validProviderURL,
} from "@/studio/security";
import { getModel, parseSettings } from "@/generation/catalog";
import { toPlatform } from "@/generation/to-platform";
import type { GenerationPlane } from "@/generation/catalog";
export const dynamic = "force-dynamic";
const text = z.string().trim().min(1).max(180);
const id = z.string().min(1).max(180);
const stages = ["Brief", "Ready", "In progress", "Review", "Approved"];
const active = ["submitting", "queued", "in_progress", "unknown"];
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function error(e: unknown) {
  if (e instanceof AppError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError)
    return json({ error: e.issues[0]?.message ?? "Invalid input." }, 400);
  console.error(
    "Studio request failed",
    e instanceof Error ? e.message : "Unknown",
  );
  return json(
    {
      error:
        "Unable to save this change. Your inputs are still here; please try again.",
    },
    500,
  );
}
export async function GET(req: Request) {
  try {
    const u = await actor();
    const url = new URL(req.url);
    let workspaces = (
      await db()
        .prepare(
          "SELECT w.*,m.role,m.project_id FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.created_at",
        )
        .bind(u.id)
        .all()
    ).results as any[];
    if (!workspaces.length) {
      const wid = "personal-" + u.id;
      await db().batch([
        db()
          .prepare(
            "INSERT OR IGNORE INTO workspaces(id,name,owner_id,created_at) VALUES(?,?,?,?)",
          )
          .bind(wid, u.name.split("@")[0] + "’s workspace", u.id, now()),
        db()
          .prepare(
            "INSERT OR IGNORE INTO members(workspace_id,user_id,role) VALUES(?,?,?)",
          )
          .bind(wid, u.id, "owner"),
      ]);
      workspaces = [
        { id: wid, name: u.name.split("@")[0] + "’s workspace", role: "owner" },
      ];
    }
    const wid = url.searchParams.get("workspace") || workspaces[0].id;
    const m = await membership(u.id, wid);
    const projects = (
      await db()
        .prepare(
          "SELECT * FROM projects WHERE workspace_id=? ORDER BY created_at DESC",
        )
        .bind(wid)
        .all()
    ).results.filter((p: any) => canReadProject(m, p.id));
    const condition = m.role === "client" ? " AND project_id=?" : "";
    const args = m.role === "client" ? [wid, m.project_id] : [wid];
    const rows = (
      await db()
        .prepare(
          "SELECT jobs.*,users.name AS creator FROM jobs JOIN users ON users.id=jobs.user_id WHERE workspace_id=?" +
            condition +
            " ORDER BY jobs.created_at DESC LIMIT 300",
        )
        .bind(...args)
        .all()
    ).results as any[];
    const members = (
      await db()
        .prepare(
          "SELECT u.id,u.name,u.email,m.role,m.project_id FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=?",
        )
        .bind(wid)
        .all()
    ).results;
    const assets = (
      await db()
        .prepare(
          "SELECT id,filename,content_type,size,project_id FROM assets WHERE workspace_id=?" +
            condition +
            " ORDER BY created_at DESC LIMIT 150",
        )
        .bind(...args)
        .all()
    ).results;
    const templates = (
      await db()
        .prepare(
          "SELECT * FROM templates WHERE workspace_id=? ORDER BY created_at DESC",
        )
        .bind(wid)
        .all()
    ).results.map((t: any) => ({
      ...t,
      category: "Team workflow",
      description: "A workflow saved by your team.",
      steps: [
        "Add your references",
        "Review settings and get a quote",
        "Generate and review",
      ],
    }));
    const key = await db()
      .prepare("SELECT user_id FROM credentials WHERE user_id=?")
      .bind(u.id)
      .first();
    let comments: unknown[] = [];
    const jid = url.searchParams.get("job");
    if (jid) {
      await jobAccess(u.id, jid);
      comments = (
        await db()
          .prepare(
            "SELECT c.*,u.name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.job_id=? ORDER BY c.created_at",
          )
          .bind(jid)
          .all()
      ).results;
    }
    return json({
      templates: m.role === "client" ? [] : templates,
      user: u,
      workspaces,
      workspace: wid,
      role: m.role,
      projects,
      members:
        m.role === "client"
          ? members.filter((x: any) => x.id === u.id)
          : members,
      assets,
      jobs: rows.map(({ quote_input, status_url, ...j }) => ({
        ...j,
        plane: JSON.parse(j.plane),
        result: j.result ? JSON.parse(j.result) : null,
      })),
      comments,
      keyConfigured: !!key,
    });
  } catch (e) {
    return error(e);
  }
}
async function mappedInput(
  plane: GenerationPlane,
  userId: string,
  projectId: string,
  origin: string,
  requireMedia = false,
) {
  const model = getModel(plane.model);
  const parsed = {
    ...plane,
    prompt: {
      text: z
        .string()
        .max(8000)
        .parse(plane.prompt?.text ?? ""),
    },
    settings: parseSettings(model, plane.settings ?? {}),
    media: { ...plane.media },
  };
  for (const [role, media] of Object.entries(parsed.media)) {
    if (
      !Array.isArray(media) ||
      media.length > (model.roles[role as keyof typeof model.roles] ?? 0)
    )
      fail(400, "Too many or unsupported references.");
    for (const item of media) {
      const a = await db()
        .prepare("SELECT id,project_id,content_type FROM assets WHERE id=?")
        .bind(item.id)
        .first<any>();
      if (!a || a.project_id !== projectId)
        fail(403, "Reference does not belong to this project.");
      if (
        !(a.content_type as string).startsWith(
          role === "video" ? "video/" : role === "audio" ? "audio/" : "image/",
        )
      )
        fail(400, "Reference type does not match its slot.");
      await projectAccess(userId, projectId);
      item.url = await assetURL(a.id, origin);
    }
  }
  if (
    requireMedia &&
    model.id.startsWith("genjutsu") &&
    (!parsed.media.video?.length || !parsed.media.reference?.length)
  )
    fail(400, "Add a source video and at least one reference image.");
  return { parsed, ...toPlatform(parsed) };
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const u = await actor();
    const b = (await req.json()) as any;
    const origin = new URL(req.url).origin;
    if (b.op === "key") {
      const key = z
        .string()
        .trim()
        .regex(/^[^\s:]+:[^\s:]+$/, "Use the API key in id:secret format.")
        .max(1000)
        .parse(b.key);
      await db()
        .prepare(
          "INSERT INTO credentials(user_id,encrypted_key,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted_key=excluded.encrypted_key,updated_at=excluded.updated_at",
        )
        .bind(u.id, await encrypt(key), now())
        .run();
      return json({ ok: true });
    }
    if (b.op === "disconnect") {
      await db()
        .prepare("DELETE FROM credentials WHERE user_id=?")
        .bind(u.id)
        .run();
      return json({ ok: true });
    }
    if (b.op === "project") {
      const wid = id.parse(b.workspace);
      const m = await membership(u.id, wid);
      if (!canCreate(m)) fail(403, "Only team members can create projects.");
      const pid = uid();
      await db()
        .prepare(
          "INSERT INTO projects(id,workspace_id,name,client,color,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          pid,
          wid,
          text.parse(b.name),
          z
            .string()
            .max(120)
            .parse(b.client ?? ""),
          "#b8f34e",
          now(),
        )
        .run();
      return json({ id: pid });
    }
    if (b.op === "workspace") {
      const wid = uid();
      await db().batch([
        db()
          .prepare(
            "INSERT INTO workspaces(id,name,owner_id,created_at) VALUES(?,?,?,?)",
          )
          .bind(wid, text.parse(b.name), u.id, now()),
        db()
          .prepare(
            "INSERT INTO members(workspace_id,user_id,role) VALUES(?,?,?)",
          )
          .bind(wid, u.id, "owner"),
      ]);
      return json({ id: wid });
    }
    if (b.op === "invite") {
      const wid = id.parse(b.workspace);
      const m = await membership(u.id, wid);
      if (m.role !== "owner")
        fail(403, "Only the workspace owner can invite people.");
      const role = z.enum(["editor", "client"]).parse(b.role);
      if (role === "client") await projectAccess(u.id, id.parse(b.project));
      if (role === "client") {
        const p = await db()
          .prepare("SELECT workspace_id FROM projects WHERE id=?")
          .bind(b.project)
          .first<any>();
        if (p.workspace_id !== wid)
          fail(403, "Project is not in this workspace.");
      }
      const token = uid() + uid();
      await db()
        .prepare(
          "INSERT INTO invites(token_hash,workspace_id,role,project_id,expires_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          await hash(token),
          wid,
          role,
          role === "client" ? b.project : null,
          now() + 7 * 86400000,
        )
        .run();
      return json({ url: origin + "/?invite=" + token });
    }
    if (b.op === "accept") {
      const token = z.string().max(200).parse(b.token);
      const h = await hash(token);
      const inv = await db()
        .prepare(
          "SELECT * FROM invites WHERE token_hash=? AND expires_at>? AND used_by IS NULL",
        )
        .bind(h, now())
        .first<any>();
      if (!inv) fail(410, "This invitation has expired or was already used.");
      const claim = await db()
        .prepare(
          "UPDATE invites SET used_by=? WHERE token_hash=? AND used_by IS NULL",
        )
        .bind(u.id, h)
        .run();
      if (!claim.meta.changes)
        fail(409, "This invitation has already been used.");
      await db()
        .prepare(
          "INSERT OR IGNORE INTO members(workspace_id,user_id,role,project_id) VALUES(?,?,?,?)",
        )
        .bind(inv.workspace_id, u.id, inv.role, inv.project_id)
        .run();
      return json({ workspace: inv.workspace_id });
    }
    if (b.op === "remove-member") {
      const m = await membership(u.id, id.parse(b.workspace));
      if (m.role !== "owner") fail(403, "Only the owner can remove members.");
      await db()
        .prepare(
          "DELETE FROM members WHERE workspace_id=? AND user_id=? AND role!='owner'",
        )
        .bind(b.workspace, id.parse(b.user))
        .run();
      return json({ ok: true });
    }
    if (b.op === "job") {
      const p = id.parse(b.project);
      const { project } = await projectAccess(u.id, p, true);
      const template = await db()
        .prepare("SELECT * FROM templates WHERE id=? AND workspace_id=?")
        .bind(id.parse(b.workflow), project.workspace_id)
        .first<any>();
      const model = getModel(template?.model ?? id.parse(b.model));
      const jid = uid();
      const plane = {
        model: model.id,
        prompt: {
          text: z
            .string()
            .max(8000)
            .parse(template?.prompt ?? b.prompt ?? ""),
        },
        media: {},
        settings: parseSettings(
          model,
          template ? JSON.parse(template.settings) : {},
        ),
      };
      await db()
        .prepare(
          "INSERT INTO jobs(id,workspace_id,project_id,user_id,title,workflow,stage,status,plane,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          jid,
          project.workspace_id,
          p,
          u.id,
          text.parse(b.title),
          id.parse(b.workflow),
          "Brief",
          "draft",
          JSON.stringify(plane),
          1,
          now(),
          now(),
        )
        .run();
      return json({ id: jid });
    }
    const j = await jobAccess(
      u.id,
      id.parse(b.id),
      !["comment", "stage", "sync"].includes(b.op),
    );
    if (b.op === "comment") {
      await db()
        .prepare(
          "INSERT INTO comments(id,job_id,user_id,body,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(
          uid(),
          j.id,
          u.id,
          z.string().trim().min(1).max(4000).parse(b.body),
          now(),
        )
        .run();
      return json({ ok: true });
    }
    if (b.op === "stage") {
      if (
        !stages.includes(b.stage) ||
        !canMoveStage(
          j.status,
          b.stage,
          !!j.quoted_at && now() - j.quoted_at <= 900000,
        )
      )
        fail(409, "This generation is not ready for that stage.");
      const { member } = await projectAccess(u.id, j.project_id);
      if (member.role === "client" && !["Review", "Approved"].includes(b.stage))
        fail(403, "Clients can review or approve finished generations.");
      await db()
        .prepare("UPDATE jobs SET stage=?,updated_at=? WHERE id=?")
        .bind(b.stage, now(), j.id)
        .run();
      return json({ ok: true });
    }
    if (b.op === "save") {
      if (j.status !== "draft")
        fail(409, "Create a new version to change a submitted generation.");
      const { parsed } = await mappedInput(b.plane, u.id, j.project_id, origin);
      await db()
        .prepare(
          "UPDATE jobs SET title=?,plane=?,quote=NULL,quote_input=NULL,quoted_at=NULL,stage='Brief',updated_at=? WHERE id=? AND status=?",
        )
        .bind(text.parse(b.title), JSON.stringify(parsed), now(), j.id, "draft")
        .run();
      return json({ ok: true });
    }
    if (b.op === "template") {
      const p = JSON.parse(j.plane);
      await db()
        .prepare(
          "INSERT INTO templates(id,workspace_id,title,model,prompt,settings,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          uid(),
          j.workspace_id,
          text.parse(b.title),
          p.model,
          p.prompt.text,
          JSON.stringify(p.settings),
          now(),
        )
        .run();
      return json({ ok: true });
    }
    if (b.op === "regenerate") {
      if (active.includes(j.status))
        fail(
          409,
          "Wait for this generation to finish before creating a version.",
        );
      const jid = uid();
      await db()
        .prepare(
          "INSERT INTO jobs(id,workspace_id,project_id,user_id,title,workflow,stage,status,plane,version,parent_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          jid,
          j.workspace_id,
          j.project_id,
          u.id,
          j.title,
          j.workflow,
          "Brief",
          "draft",
          j.plane,
          j.version + 1,
          j.id,
          now(),
          now(),
        )
        .run();
      return json({ id: jid });
    }
    if (b.op === "quote") {
      if (j.status !== "draft") fail(409, "Only drafts can be quoted.");
      const { path, body } = await mappedInput(
        JSON.parse(j.plane),
        u.id,
        j.project_id,
        origin,
        true,
      );
      const q = await provider("estimate/" + path, await apiKey(u.id), body);
      const usd = Number(q.usd);
      if (q.usd === undefined || !Number.isFinite(usd) || usd < 0)
        fail(502, "The provider did not return a valid dollar quote.");
      const quoted = await db()
        .prepare(
          "UPDATE jobs SET quote=?,quote_input=?,quoted_at=?,stage=?,updated_at=? WHERE id=? AND status=? AND updated_at=?",
        )
        .bind(
          usd,
          JSON.stringify({ path, body, payer: u.id }),
          now(),
          "Ready",
          now(),
          j.id,
          "draft",
          j.updated_at,
        )
        .run();
      if (!quoted.meta.changes)
        fail(409, "The draft changed while quoting. Get a fresh quote.");
      return json({ usd });
    }
    if (b.op === "generate") {
      if (j.status !== "draft" || !j.quoted_at || now() - j.quoted_at > 900000)
        fail(409, "Get a fresh quote before generating.");
      const q = JSON.parse(j.quote_input);
      if (q.payer !== u.id)
        fail(403, "Get a quote using your own API account first.");
      const key = await apiKey(u.id);
      const latest = await provider("estimate/" + q.path, key, q.body);
      if (
        latest.usd === undefined ||
        !Number.isFinite(Number(latest.usd)) ||
        Number(latest.usd) > j.quote
      )
        fail(409, "The price changed. Please request a new quote.");
      const claimed = await db()
        .prepare(
          "UPDATE jobs SET status='submitting',stage='In progress',user_id=?,updated_at=? WHERE id=? AND status='draft' AND quoted_at=?",
        )
        .bind(u.id, now(), j.id, j.quoted_at)
        .run();
      if (!claimed.meta.changes)
        fail(409, "This generation was already submitted.");
      try {
        const r = await provider(q.path, key, q.body);
        if (!r.request_id || !validProviderURL(r.status_url))
          throw Error("Submission response could not be reconciled.");
        await db()
          .prepare(
            "UPDATE jobs SET status='queued',request_id=?,status_url=?,updated_at=? WHERE id=?",
          )
          .bind(r.request_id, r.status_url, now(), j.id)
          .run();
        return json({ ok: true });
      } catch (e) {
        await db()
          .prepare(
            "UPDATE jobs SET status='unknown',error=?,updated_at=? WHERE id=?",
          )
          .bind(
            "Submission outcome is uncertain. Check the provider console before retrying.",
            now(),
            j.id,
          )
          .run();
        throw e;
      }
    }
    if (b.op === "sync") {
      if (
        !["queued", "in_progress"].includes(j.status) &&
        !(j.status === "completed" && j.error)
      )
        return json({ ok: true });
      if (!validProviderURL(j.status_url)) fail(400, "Invalid status URL.");
      const r = await provider(j.status_url, await apiKey(j.user_id));
      const status = [
        "queued",
        "in_progress",
        "completed",
        "failed",
        "nsfw",
        "canceled",
      ].includes(r.status)
        ? r.status
        : j.status;
      const urls = [
        ...(r.images ?? []).map((x: any) => x.url),
        r.video?.url,
        r.audio?.url,
      ].filter((x: any) => typeof x === "string" && x.startsWith("https://"));
      const archived =
        status === "completed"
          ? await archiveResults(j, urls)
          : { results: urls, pending: false };
      await db()
        .prepare(
          "UPDATE jobs SET status=?,result=?,stage=?,error=?,updated_at=? WHERE id=?",
        )
        .bind(
          status,
          JSON.stringify(archived.results),
          status === "completed"
            ? j.stage === "Approved"
              ? "Approved"
              : "Review"
            : ["failed", "nsfw", "canceled"].includes(status)
              ? "Brief"
              : "In progress",
          ["failed", "nsfw", "canceled"].includes(status)
            ? "The provider did not complete this request. Create a new version to try again."
            : archived.pending
              ? "Your result is available from the provider but has not been archived. Download it now or retry archiving before the provider link expires."
              : null,
          now(),
          j.id,
        )
        .run();
      return json({ ok: true });
    }
    fail(400, "Unknown action.");
  } catch (e) {
    return error(e);
  }
}
