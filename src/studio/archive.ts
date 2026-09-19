import { bucket, db, now } from "./server";

// Only URLs returned by our authenticated provider status request reach this function.
// Downloads stream directly to private storage; no provider credentials go to a CDN.
export async function archiveResults(job: any, urls: string[]) {
  const results: string[] = [];
  let pending = false;
  for (const [index, url] of urls.slice(0, 16).entries()) {
    const id = `result-${job.id}-${index}`;
    const existing = await db()
      .prepare("SELECT id FROM assets WHERE id=?")
      .bind(id)
      .first();
    if (existing) {
      results.push("/api/media/" + id);
      continue;
    }
    try {
      const target = new URL(url);
      if (
        target.protocol !== "https:" ||
        target.username ||
        target.password ||
        target.port ||
        !target.hostname.includes(".") ||
        target.hostname.includes(":") ||
        /^\d+\./.test(target.hostname) ||
        /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
          target.hostname,
        )
      )
        throw Error("Unsupported result URL");
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(45000),
      });
      const type = response.headers.get("content-type")?.split(";")[0] ?? "";
      const size = Number(response.headers.get("content-length"));
      if (
        !response.ok ||
        !response.body ||
        !/^(image|video|audio)\//.test(type) ||
        !size ||
        size > 250 * 1024 * 1024
      )
        throw Error("Result is not ready to archive");
      const objectKey = job.workspace_id + "/" + id;
      await bucket().put(objectKey, response.body, {
        httpMetadata: { contentType: type },
      });
      const extension = type
        .split("/")[1]
        .replace("jpeg", "jpg")
        .replace("mpeg", "mp3");
      await db()
        .prepare(
          "INSERT OR IGNORE INTO assets(id,workspace_id,project_id,user_id,filename,content_type,size,object_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          job.workspace_id,
          job.project_id,
          job.user_id,
          `Version ${job.version} result ${index + 1}.${extension}`,
          type,
          size,
          objectKey,
          now(),
        )
        .run();
      results.push("/api/media/" + id);
    } catch {
      pending = true;
      results.push(url);
    }
  }
  return { results, pending };
}
