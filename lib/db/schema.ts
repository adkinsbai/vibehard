import { relations } from "drizzle-orm";
import type { KnowledgeDocument } from "@/lib/agent/knowledge";
import type { DesignResult } from "@/lib/agent/llm";
import type { DesignDiagnostics } from "@/lib/agent/design-diagnostics";
import type { ModuleManifest } from "@/lib/eda/module-package";
import type { ModuleDefinition } from "@/lib/eda/modules";
import {
  boolean,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const turnStatus = pgEnum("turn_status", ["queued", "running", "waiting_approval", "completed", "failed", "interrupted"]);
export const runnerStatus = pgEnum("runner_status", ["offline", "online", "busy", "revoked"]);
export const approvalStatus = pgEnum("approval_status", ["pending", "approved", "rejected", "expired"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull().default("VibeHard 用户"),
  role: text("role").notNull().default("member"),
  inviteCode: text("invite_code"),
  ...timestamps,
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  workspaceKey: text("workspace_key").notNull(),
  runnerKey: text("runner_key"),
  defaultModel: text("default_model").notNull().default("gpt-5.6-terra"),
  ...timestamps,
}, (table) => [index("projects_user_updated_idx").on(table.userId, table.updatedAt)]);

export const runnerNodes = pgTable("runner_nodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  runnerKey: text("runner_key").notNull().unique(),
  name: text("name").notNull(),
  status: runnerStatus("status").notNull().default("offline"),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  instanceId: uuid("instance_id"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  secretHash: text("secret_hash"),
  ...timestamps,
});

export const designJobs = pgTable("design_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").notNull(),
  requestedProjectId: uuid("requested_project_id"),
  requirement: text("requirement").notNull(),
  status: text("status").$type<"queued" | "running" | "completed" | "failed">().notNull().default("queued"),
  model: text("model"),
  knowledgeVersion: text("knowledge_version"),
  result: jsonb("result").$type<DesignResult>(),
  diagnostics: jsonb("diagnostics").$type<DesignDiagnostics>(),
  error: text("error"),
  leaseToken: uuid("lease_token"),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, table => [
  uniqueIndex("design_jobs_request_uidx").on(table.userId, table.requestId),
  index("design_jobs_queue_idx").on(table.status, table.createdAt),
  index("design_jobs_project_idx").on(table.projectId, table.createdAt),
]);

// Small reviewed document library; not arbitrary uploads or a vector index.
export const projectKnowledge = pgTable("project_knowledge", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  documents: jsonb("documents").$type<KnowledgeDocument[]>().notNull().default([]),
  ...timestamps,
});

// Curated, platform-wide text. Catalog file paths are not indexed as content.
export const sharedKnowledge = pgTable("shared_knowledge", {
  id: uuid("id").primaryKey(),
  category: text("category").notNull(),
  document: jsonb("document").$type<KnowledgeDocument>().notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, table => [index("shared_knowledge_category_idx").on(table.category)]);

// Immutable native source and compiled, version-pinned module definition. Publication is a separate reviewed transition.
export const edaModuleVersions = pgTable("eda_module_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  moduleId: text("module_id").notNull(),
  version: text("version").notNull(),
  packageSha256: text("package_sha256").notNull(),
  manifest: jsonb("manifest").$type<ModuleManifest>().notNull(),
  payloadsBase64: jsonb("payloads_base64").$type<Record<string, string>>().notNull(),
  definition: jsonb("definition").$type<ModuleDefinition>().notNull(),
  status: text("status").$type<"pending" | "published" | "rejected" | "disabled">().notNull().default("pending"),
  submittedBy: uuid("submitted_by").notNull().references(() => users.id),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewReference: text("review_reference"),
  ...timestamps,
}, table => [
  uniqueIndex("eda_module_versions_identity_uidx").on(table.moduleId, table.version),
  index("eda_module_versions_status_idx").on(table.status),
]);

export const agentThreads = pgTable("agent_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  runnerId: uuid("runner_id").references(() => runnerNodes.id),
  codexThreadId: text("codex_thread_id"),
  title: text("title").notNull().default("新建 Agent 会话"),
  ...timestamps,
}, (table) => [index("agent_threads_project_updated_idx").on(table.projectId, table.updatedAt)]);

export const agentTurns = pgTable("agent_turns", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id").notNull().references(() => agentThreads.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  input: text("input").notNull(),
  model: text("model").notNull(),
  status: turnStatus("status").notNull().default("queued"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("agent_turns_thread_status_idx").on(table.threadId, table.status)]);

export const agentEvents = pgTable("agent_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  turnId: uuid("turn_id").notNull().references(() => agentTurns.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull().unique(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  sequence: integer("sequence").notNull(),
  ...timestamps,
}, (table) => [index("agent_events_turn_sequence_idx").on(table.turnId, table.sequence)]);

export const approvals = pgTable("approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  turnId: uuid("turn_id").notNull().references(() => agentTurns.id, { onDelete: "cascade" }),
  tool: text("tool").notNull(),
  risk: text("risk").notNull(),
  description: text("description").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  status: approvalStatus("status").notNull().default("pending"),
  decisionBy: uuid("decision_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("approvals_turn_status_idx").on(table.turnId, table.status)]);

export const artifacts = pgTable("artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  turnId: uuid("turn_id").references(() => agentTurns.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  path: text("path").notNull(),
  ...timestamps,
});

export const modelProfiles = pgTable("model_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  providerId: text("provider_id").notNull(),
  model: text("model").notNull(),
  displayName: text("display_name").notNull(),
  baseUrl: text("base_url"),
  envKey: text("env_key"),
  capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  ...timestamps,
}, (table) => [uniqueIndex("model_profiles_provider_model_uidx").on(table.providerId, table.model)]);

// Provider secrets are encrypted by the platform; never return this table directly.
export const llmSettings = pgTable("llm_settings", {
  purpose: text("purpose").primaryKey(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  protocol: text("protocol").notNull(),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  revision: uuid("revision").notNull(),
  ...timestamps,
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

export const runnerCommands = pgTable("runner_commands", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => agentTurns.id, { onDelete: "cascade" }),
  runnerKey: text("runner_key").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  ...timestamps,
}, (table) => [index("runner_commands_queue_idx").on(table.runnerKey, table.status, table.createdAt)]);

export const userRelations = relations(users, ({ many }) => ({ projects: many(projects), turns: many(agentTurns) }));
export const projectRelations = relations(projects, ({ one, many }) => ({ user: one(users, { fields: [projects.userId], references: [users.id] }), threads: many(agentThreads), artifacts: many(artifacts) }));
