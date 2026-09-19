export type Membership = { role: string; project_id: string | null };
export function canReadProject(member: Membership, projectId: string) {
  return (
    canCreate(member) ||
    (member.role === "client" && member.project_id === projectId)
  );
}
export function canCreate(member: Membership) {
  return member.role === "owner" || member.role === "editor";
}
export function canReview(member: Membership, projectId: string) {
  return canReadProject(member, projectId);
}
export function validProviderURL(value: string) {
  try {
    const u = new URL(value);
    return (
      u.origin === "https://api.higgsfield.ai" &&
      u.pathname.startsWith("/requests/")
    );
  } catch {
    return false;
  }
}
export function safeReturn(value: string) {
  try {
    const url = new URL(value, "https://studio.example");
    return value.startsWith("/") && url.origin === "https://studio.example"
      ? url.pathname + url.search + url.hash
      : "/";
  } catch {
    return "/";
  }
}
export function canMoveStage(status: string, stage: string, quoted = false) {
  if (status === "completed") return ["Review", "Approved"].includes(stage);
  if (status === "draft")
    return stage === "Brief" || (stage === "Ready" && quoted);
  return ["failed", "nsfw", "canceled"].includes(status) && stage === "Brief";
}
export function versionFamily<
  T extends { id: string; parent_id: string | null },
>(jobs: T[], id: string) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const j of jobs) {
      if (ids.has(j.id) && j.parent_id && !ids.has(j.parent_id)) {
        ids.add(j.parent_id);
        changed = true;
      }
      if (j.parent_id && ids.has(j.parent_id) && !ids.has(j.id)) {
        ids.add(j.id);
        changed = true;
      }
    }
  }
  return jobs.filter((j) => ids.has(j.id));
}
