"use server";

import {
  actor,
  db,
  encrypt,
  now,
  projectAccess,
  apiKey,
  provider,
} from "@/studio/server";
import { parseCredentialInput } from "./credentials";
import type { GenerationPlane } from "./catalog/types";
import type { QueuedGeneration, StatusResult } from "./platform";

// Compatibility for the retained original components. All writes now use the
// same authenticated, server-side account storage as Samin Studio.
export async function savePlatformCredentials(data: unknown) {
  const user = await actor();
  const { apiKey: key } = parseCredentialInput(data);
  await db()
    .prepare(
      "INSERT INTO credentials(user_id,encrypted_key,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET encrypted_key=excluded.encrypted_key,updated_at=excluded.updated_at",
    )
    .bind(user.id, await encrypt(key), now())
    .run();
}
export async function clearPlatformCredentials() {
  const user = await actor();
  await db()
    .prepare("DELETE FROM credentials WHERE user_id=?")
    .bind(user.id)
    .run();
}
export async function hasPlatformCredentials() {
  const user = await actor();
  return !!(await db()
    .prepare("SELECT user_id FROM credentials WHERE user_id=?")
    .bind(user.id)
    .first());
}
export async function submitGeneration(
  _plane: GenerationPlane,
): Promise<QueuedGeneration> {
  await actor();
  throw new Error(
    "Create a project draft and review its quote in Samin Studio before generating.",
  );
}
export async function getGenerationStatuses(
  data: unknown,
): Promise<StatusResult[]> {
  const user = await actor();
  const ids = (data as { requestIds?: unknown })?.requestIds;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 50 ||
    ids.some((id) => typeof id !== "string")
  )
    throw new Error("Invalid request IDs");
  return Promise.all(
    ids.map(async (requestId) => {
      try {
        const job = await db()
          .prepare("SELECT project_id,user_id FROM jobs WHERE request_id=?")
          .bind(requestId)
          .first<any>();
        if (!job) throw new Error("Generation not found.");
        await projectAccess(user.id, job.project_id);
        const status = await provider(
          "requests/" + encodeURIComponent(requestId) + "/status",
          await apiKey(job.user_id),
        );
        return { requestId, status: { ...status, requestId } };
      } catch {
        return {
          requestId,
          error: "Generation is unavailable to this account.",
        };
      }
    }),
  );
}
