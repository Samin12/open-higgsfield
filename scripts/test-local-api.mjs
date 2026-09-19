// Tests only the local development runtime. Never points at a production site.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const origin = "http://localhost:5173";
const cookie = "__sites_local_auth=1";
async function request(path, body, auth = true, extra = {}) {
  const response = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(auth ? { cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { error: raw };
  }
  return { status: response.status, data };
}
const post = (body) => request("/api/studio", body);
assert.equal((await request("/api/studio", undefined, false)).status, 401);
assert.equal(
  (
    await request("/api/studio", undefined, false, {
      "oai-authenticated-user-id": "forged",
      "oai-authenticated-user-email": "fake@sites.test",
    })
  ).status,
  401,
);
const account = await request("/api/studio");
assert.equal(account.status, 200);
const wid = account.data.workspaces.find((w) => w.role === "owner").id;
assert.equal(
  (
    await request(
      "/api/studio",
      { op: "project", workspace: wid, name: "blocked" },
      true,
      { origin: "https://evil.example" },
    )
  ).status,
  403,
);
const {
  data: { id: pid },
} = await post({
  op: "project",
  workspace: wid,
  name: "Local verification",
  client: "QA only",
});
const created = await post({
  op: "job",
  project: pid,
  title: "Test version",
  workflow: "character-recast",
  model: "genjutsu-motion",
  prompt: "Test identity",
});
assert.equal(created.status, 200);
const jid = created.data.id;
assert.equal(
  (await post({ op: "stage", id: jid, stage: "Approved" })).status,
  409,
);
assert.equal(
  (await post({ op: "stage", id: jid, stage: "In progress" })).status,
  409,
);
assert.equal((await post({ op: "generate", id: jid })).status, 409);
assert.equal((await post({ op: "quote", id: jid })).status, 400);
const file = new Blob([await readFile("public/workflows/character.jpg")], {
  type: "image/jpeg",
});
const form = new FormData();
form.append("file", file, "reference.jpg");
const uploaded = await fetch(origin + "/api/media?project=" + pid, {
  method: "POST",
  headers: { cookie },
  body: form,
});
assert.equal(uploaded.status, 200);
const asset = await uploaded.json();
assert.equal((await fetch(origin + asset.url)).status, 401);
const ranged = await fetch(origin + asset.url, {
  headers: { cookie, Range: "bytes=0-9" },
});
assert.equal(ranged.status, 206);
assert.equal((await ranged.arrayBuffer()).byteLength, 10);
const saved = await post({
  op: "save",
  id: jid,
  title: "Test version",
  plane: {
    model: "genjutsu-motion",
    prompt: { text: "Saved brief" },
    media: { reference: [{ id: asset.id, role: "reference", url: asset.url }] },
    settings: { resolution: "480p" },
  },
});
assert.equal(saved.status, 200);
assert.equal(
  (await post({ op: "template", id: jid, title: "Saved test template" }))
    .status,
  200,
);
let state = (await request("/api/studio?workspace=" + wid)).data;
const template = state.templates.find((t) => t.title === "Saved test template");
assert.ok(template);
const reused = await post({
  op: "job",
  project: pid,
  title: "Reused",
  workflow: template.id,
  model: "genjutsu-motion",
  prompt: "ignored",
});
assert.equal(reused.status, 200);
state = (await request("/api/studio?workspace=" + wid)).data;
assert.equal(
  state.jobs.find((j) => j.id === reused.data.id).plane.settings.resolution,
  "480p",
);
assert.equal(
  state.jobs.find((j) => j.id === reused.data.id).plane.prompt.text,
  "Saved brief",
);
const version = await post({ op: "regenerate", id: jid });
assert.equal(version.status, 200);
state = (await request("/api/studio?workspace=" + wid)).data;
assert.equal(state.jobs.find((j) => j.id === version.data.id).parent_id, jid);
const suffix = crypto.randomUUID();
const clientWorkspace = "qa-client-" + suffix;
const visible = "qa-visible-" + suffix;
const hidden = "qa-hidden-" + suffix;
const finished = "qa-job-" + suffix;
const other = "qa-other-" + suffix;
const sql = `INSERT INTO users VALUES('${other}','qa-owner@sites.test','QA owner',1);
INSERT INTO workspaces VALUES('${clientWorkspace}','QA scoped workspace','${other}',1);
INSERT INTO members VALUES('${clientWorkspace}','${other}','owner',NULL);
INSERT INTO members VALUES('${clientWorkspace}','local_seedy','client','${visible}');
INSERT INTO projects VALUES('${visible}','${clientWorkspace}','Visible project','QA','#fff',1);
INSERT INTO projects VALUES('${hidden}','${clientWorkspace}','Hidden project','QA','#fff',1);
INSERT INTO jobs(id,workspace_id,project_id,user_id,title,workflow,stage,status,plane,version,created_at,updated_at) VALUES('${finished}','${clientWorkspace}','${visible}','${other}','Completed fixture','custom','Review','completed','{"model":"genjutsu-motion","prompt":{"text":"test"},"media":{},"settings":{"resolution":"720p"}}',1,1,1);`;
execFileSync(
  "pnpm",
  [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    ".wrangler/state",
    "--command",
    sql,
  ],
  { stdio: "pipe" },
);
const client = (await request("/api/studio?workspace=" + clientWorkspace)).data;
assert.equal(client.role, "client");
assert.deepEqual(
  client.projects.map((p) => p.id),
  [visible],
);
assert.deepEqual(client.templates, []);
assert.equal(
  (
    await post({
      op: "project",
      workspace: clientWorkspace,
      name: "Not allowed",
    })
  ).status,
  403,
);
assert.equal(
  (
    await post({
      op: "job",
      project: hidden,
      title: "Not allowed",
      workflow: "custom",
      model: "genjutsu-motion",
    })
  ).status,
  403,
);
assert.equal(
  (await post({ op: "invite", workspace: clientWorkspace, role: "editor" }))
    .status,
  403,
);
assert.equal(
  (await post({ op: "comment", id: finished, body: "Client feedback" })).status,
  200,
);
assert.equal(
  (await post({ op: "stage", id: finished, stage: "Approved" })).status,
  200,
);
assert.equal((await post({ op: "regenerate", id: finished })).status, 403);
assert.equal(
  (await request("/api/studio?workspace=unrelated-workspace")).status,
  403,
);
const invite = await post({
  op: "invite",
  workspace: wid,
  role: "client",
  project: pid,
});
assert.equal(invite.status, 200);
const token = new URL(invite.data.url).searchParams.get("invite");
assert.equal((await post({ op: "accept", token })).status, 200);
assert.equal((await post({ op: "accept", token })).status, 410);
console.log(
  "PASS: authentication, header spoofing, origin, drafts, quote gates, private uploads/ranges, template reuse, versions, client isolation, comments, approval and single-use invitations. No provider generation was submitted.",
);
