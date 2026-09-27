// Opt-in diagnostic: one short real request against the currently saved design
// model. Does not print or change credentials, settings or project data.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";

assert.equal(process.env.ALLOW_OSS_RAG_TEST, "synthetic-only");
assert.ok(process.env.DATABASE_URL && process.env.SESSION_SECRET);
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.pathname, "/vibehard");
const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: "vibehard" };
const user = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c",
  "select id,email,name,role from users where role='admin' order by created_at limit 1"], { env: pgEnv, encoding: "utf8" });
assert.equal(user.status, 0);
const [id, email, name, role] = user.stdout.trim().split("\t");
assert.ok(id && email && role === "admin");
const payload = Buffer.from(JSON.stringify({ id, email, name, role, exp: Date.now() + 120000 })).toString("base64url");
const cookie = `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}`;
const base = "http://127.0.0.1:3210/vibehard";
const start = Date.now();
const settings = await fetch(`${base}/api/admin/llm`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(12000) });
assert.equal(settings.status, 200);
const design = (await settings.json()).settings.find(item => item.purpose === "design");
assert.ok(design?.hasApiKey);
const response = await fetch(`${base}/api/admin/llm/test`, { method: "POST", headers: { Cookie: cookie,
  "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "design", baseUrl: design.baseUrl,
    model: design.model, protocol: design.protocol, apiKey: "", revision: design.revision }),
  signal: AbortSignal.timeout(55000) });
const result = await response.json();
console.log(JSON.stringify({ status: response.status, latencyMs: Date.now() - start, baseUrl: design.baseUrl,
  model: design.model, protocol: design.protocol, message: result.message ?? result.error ?? "unknown" }));
if (!response.ok) process.exitCode = 1;
