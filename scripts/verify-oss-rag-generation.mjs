// Opt-in production candidate check: creates exactly one retained synthetic
// design task, spends one configured model request, never changes credentials.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const base = process.argv[2];
assert.match(base ?? "", /^http:\/\/127\.0\.0\.1:3211\/vibehard$/);
assert.equal(process.env.ALLOW_OSS_RAG_TEST, "synthetic-only");
assert.ok(process.env.DATABASE_URL && process.env.SESSION_SECRET && process.env.VIBEHARD_OSS_INDEX_PATH);
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.pathname, "/vibehard");
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: "vibehard" };
const user = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c",
  "select id,email,name,role from users where role='admin' order by created_at limit 1"], { env, encoding: "utf8" });
assert.equal(user.status, 0, "Could not select an existing administrator");
const [id, email, name, role] = user.stdout.trim().split("\t");
assert.ok(id && email && role === "admin");
const payload = Buffer.from(JSON.stringify({ id, email, name, role, exp: Date.now() + 300000 })).toString("base64url");
const cookie = `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}`;
const request = (route, init = {}) => fetch(`${base}${route}`, { ...init, headers: { Cookie: cookie, ...init.headers },
  signal: AbortSignal.timeout(15000) });
const requirement = "请为 ESP32-S3 设计一个带 I2C 触摸屏、USB 供电和状态指示灯的最小开发板测试节点。给出 BOM 与需要核实的接口约束。";
const response = await request("/api/design", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ requestId: randomUUID(), requirement }) });
assert.equal(response.status, 202, `Submission rejected with HTTP ${response.status}`);
let { job } = await response.json();
assert.ok(job?.id && job?.projectId);
const deadline = Date.now() + 145000;
while (["queued", "running"].includes(job.status) && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 3000));
  const status = await request(`/api/design/${job.id}`);
  assert.equal(status.status, 200);
  job = (await status.json()).job;
}
assert.equal(job.status, "completed", job.error ?? "Design did not complete before deadline");
assert.equal(job.result?.retrieval?.method, "keyword-chunks-fts5-v1");
const references = job.result.retrieval.references.filter(item => item.reviewStatus === "auto-indexed");
assert.ok(references.length > 0 && references.length <= 5, "No server-recorded indexed references");
const db = new DatabaseSync(process.env.VIBEHARD_OSS_INDEX_PATH, { readOnly: true });
try {
  for (const reference of references) {
    const match = reference.source.match(/^(.*)#page=(\d+)&part=(\d+)$/);
    assert.ok(match, "Source must have page/part");
    const row = db.prepare("SELECT text FROM chunks WHERE source_sha=? AND source_path=? AND page=? AND part=?")
      .get(reference.sha256, match[1], Number(match[2]), Number(match[3]));
    assert.ok(row?.text?.includes(reference.excerpt), "Saved citation must match private indexed text");
  }
} finally { db.close(); }
const markdown = await request(`/api/design/${job.id}/download`);
assert.equal(markdown.status, 200);
const body = await markdown.text();
assert.ok(body.includes("未人工复核") && references.every(reference => body.includes(reference.source)));
console.log(JSON.stringify({ jobId: job.id, projectId: job.projectId, references: references.length,
  bomRows: job.result.bom.length, sqliteCitationMatch: true, markdownCitations: true, syntheticRecordRetained: true }));
