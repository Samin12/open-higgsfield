import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canReadProject, canCreate } from "./security";
const runtime = env as unknown as {
  DB: D1Database;
  BUCKET: R2Bucket;
  STUDIO_SECRET: string;
};
export const db = () => runtime.DB;
export const bucket = () => runtime.BUCKET;
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new AppError(status, message);
}
export const uid = () => crypto.randomUUID();
export const now = () => Date.now();
export async function actor() {
  const u = await getChatGPTUser();
  if (!u) fail(401, "Sign in to continue.");
  await db()
    .prepare(
      "INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name",
    )
    .bind(u.userId, u.email, u.displayName, now())
    .run();
  return { id: u.userId, email: u.email, name: u.displayName };
}
export async function membership(userId: string, workspaceId: string) {
  const m = await db()
    .prepare("SELECT * FROM members WHERE workspace_id=? AND user_id=?")
    .bind(workspaceId, userId)
    .first<{ role: string; project_id: string | null }>();
  if (!m) fail(403, "This workspace is not available to your account.");
  return m;
}
export async function projectAccess(
  userId: string,
  projectId: string,
  write = false,
) {
  const p = await db()
    .prepare("SELECT * FROM projects WHERE id=?")
    .bind(projectId)
    .first<{ id: string; workspace_id: string }>();
  if (!p) fail(404, "Project not found.");
  const m = await membership(userId, p.workspace_id);
  if (!canReadProject(m, projectId) || (write && !canCreate(m)))
    fail(403, "Your role cannot perform this action.");
  return { project: p, member: m };
}
export async function jobAccess(userId: string, id: string, write = false) {
  const j = await db()
    .prepare("SELECT * FROM jobs WHERE id=?")
    .bind(id)
    .first<any>();
  if (!j) fail(404, "Generation not found.");
  await projectAccess(userId, j.project_id, write);
  return j;
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    fail(403, "Cross-origin writes are not allowed.");
}
const bytes = (s: string) => new TextEncoder().encode(s);
const b64 = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function secretKey(use: "encrypt" | "sign") {
  if (!runtime.STUDIO_SECRET)
    fail(503, "Secure account storage is not configured.");
  const raw = await crypto.subtle.digest(
    "SHA-256",
    bytes(runtime.STUDIO_SECRET),
  );
  return crypto.subtle.importKey(
    "raw",
    raw,
    use === "encrypt" ? "AES-GCM" : { name: "HMAC", hash: "SHA-256" },
    false,
    use === "encrypt" ? ["encrypt", "decrypt"] : ["sign", "verify"],
  );
}
export async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await secretKey("encrypt"),
    bytes(value),
  );
  return b64(iv) + "." + b64(data);
}
export async function decrypt(value: string) {
  const [iv, data] = value.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv!) },
      await secretKey("encrypt"),
      unb64(data!),
    ),
  );
}
export async function hash(value: string) {
  return b64(await crypto.subtle.digest("SHA-256", bytes(value)));
}
export async function sign(value: string) {
  return b64(
    await crypto.subtle.sign("HMAC", await secretKey("sign"), bytes(value)),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function validSignature(value: string, sig: string) {
  const expected = await sign(value);
  if (sig.length !== expected.length) return false;
  let n = 0;
  for (let i = 0; i < sig.length; i++)
    n |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return n === 0;
}
export async function assetURL(id: string, origin: string) {
  const expires = now() + 86400000;
  return `${origin}/api/media/${id}?expires=${expires}&sig=${await sign(id + ":" + expires)}`;
}
export async function apiKey(userId: string) {
  const c = await db()
    .prepare("SELECT encrypted_key FROM credentials WHERE user_id=?")
    .bind(userId)
    .first<{ encrypted_key: string }>();
  if (!c) fail(422, "Connect your Higgsfield API key in Settings first.");
  return decrypt(c.encrypted_key);
}
export async function provider(path: string, key: string, input?: unknown) {
  const url = path.startsWith("https://")
    ? path
    : "https://api.higgsfield.ai/" + path;
  if (new URL(url).origin !== "https://api.higgsfield.ai")
    fail(400, "Invalid provider URL.");
  const r = await fetch(url, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Key " + key,
      "Content-Type": "application/json",
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    signal: AbortSignal.timeout(25000),
    redirect: "error",
  });
  if (!r.ok)
    fail(
      r.status === 401 ? 422 : 502,
      r.status === 401
        ? "Your API key was rejected. Update it in Settings."
        : `The generation provider returned ${r.status}. No automatic retry was made.`,
    );
  return r.json() as Promise<any>;
}
