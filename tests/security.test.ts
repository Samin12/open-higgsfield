import test from "node:test";
import assert from "node:assert/strict";
import {
  canReadProject,
  canCreate,
  canMoveStage,
  validProviderURL,
  safeReturn,
  versionFamily,
} from "../src/studio/security.ts";
test("clients are scoped; unknown roles fail closed", () => {
  assert.equal(canReadProject({ role: "client", project_id: "a" }, "a"), true);
  assert.equal(canReadProject({ role: "client", project_id: "a" }, "b"), false);
  assert.equal(canCreate({ role: "client", project_id: "a" }), false);
  assert.equal(
    canReadProject({ role: "unknown", project_id: null }, "a"),
    false,
  );
  for (const role of ["owner", "editor"])
    assert.equal(canCreate({ role, project_id: null }), true);
});
test("only completed work can enter review or approval", () => {
  for (const status of [
    "draft",
    "submitting",
    "queued",
    "in_progress",
    "unknown",
    "failed",
  ])
    assert.equal(canMoveStage(status, "Approved", true), false);
  assert.equal(canMoveStage("completed", "Approved"), true);
  assert.equal(canMoveStage("completed", "Brief"), false);
  assert.equal(canMoveStage("draft", "In progress"), false);
  assert.equal(canMoveStage("draft", "Ready", false), false);
  assert.equal(canMoveStage("draft", "Ready", true), true);
});
test("authenticated polling cannot redirect provider keys", () => {
  assert.equal(
    validProviderURL("https://api.higgsfield.ai/requests/abc/status"),
    true,
  );
  for (const url of [
    "https://api.higgsfield.ai.evil.example/requests/abc",
    "http://api.higgsfield.ai/requests/a",
    "https://example.com/requests/a",
    "https://api.higgsfield.ai/estimate/a",
  ])
    assert.equal(validProviderURL(url), false);
});
test("return locations stay on the app origin", () => {
  for (const path of [
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
  ])
    assert.equal(safeReturn(path), "/");
  assert.equal(safeReturn("/?invite=abc"), "/?invite=abc");
});
test("version navigation includes deep ancestry and sibling branches", () => {
  const jobs = [
    { id: "1", parent_id: null },
    { id: "2", parent_id: "1" },
    { id: "3", parent_id: "2" },
    { id: "4", parent_id: "3" },
    { id: "sibling", parent_id: "1" },
    { id: "other", parent_id: null },
  ];
  assert.deepEqual(
    versionFamily(jobs, "4").map((x) => x.id),
    ["1", "2", "3", "4", "sibling"],
  );
});
