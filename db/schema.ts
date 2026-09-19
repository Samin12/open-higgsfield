import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text().primaryKey(),
  email: text().notNull(),
  name: text().notNull(),
  created_at: integer().notNull(),
});
export const workspaces = sqliteTable("workspaces", {
  id: text().primaryKey(),
  name: text().notNull(),
  owner_id: text().notNull(),
  created_at: integer().notNull(),
});
export const members = sqliteTable(
  "members",
  {
    workspace_id: text().notNull(),
    user_id: text().notNull(),
    role: text().notNull(),
    project_id: text(),
  },
  (t) => [primaryKey({ columns: [t.workspace_id, t.user_id] })],
);
export const projects = sqliteTable("projects", {
  id: text().primaryKey(),
  workspace_id: text().notNull(),
  name: text().notNull(),
  client: text().notNull(),
  color: text().notNull(),
  created_at: integer().notNull(),
});
export const jobs = sqliteTable("jobs", {
  id: text().primaryKey(),
  workspace_id: text().notNull(),
  project_id: text().notNull(),
  user_id: text().notNull(),
  title: text().notNull(),
  workflow: text().notNull(),
  stage: text().notNull(),
  status: text().notNull(),
  plane: text().notNull(),
  version: integer().notNull(),
  parent_id: text(),
  result: text(),
  request_id: text(),
  status_url: text(),
  error: text(),
  quote: real(),
  quote_input: text(),
  quoted_at: integer(),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
});
export const assets = sqliteTable("assets", {
  id: text().primaryKey(),
  workspace_id: text().notNull(),
  project_id: text().notNull(),
  user_id: text().notNull(),
  filename: text().notNull(),
  content_type: text().notNull(),
  size: integer().notNull(),
  object_key: text().notNull(),
  created_at: integer().notNull(),
});
export const comments = sqliteTable("comments", {
  id: text().primaryKey(),
  job_id: text().notNull(),
  user_id: text().notNull(),
  body: text().notNull(),
  created_at: integer().notNull(),
});
export const invites = sqliteTable("invites", {
  token_hash: text().primaryKey(),
  workspace_id: text().notNull(),
  role: text().notNull(),
  project_id: text(),
  expires_at: integer().notNull(),
  used_by: text(),
});
export const credentials = sqliteTable("credentials", {
  user_id: text().primaryKey(),
  encrypted_key: text().notNull(),
  updated_at: integer().notNull(),
});
export const templates = sqliteTable("templates", {
  id: text().primaryKey(),
  workspace_id: text().notNull(),
  title: text().notNull(),
  model: text().notNull(),
  prompt: text().notNull(),
  settings: text().notNull(),
  created_at: integer().notNull(),
});
