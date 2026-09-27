// Opt-in production check. "create" retains one synthetic project/job and
// spends one real model request; "read" only rechecks that job through HTTPS.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import associations from "../lib/server/data/oss-rag-board-associations.json" with { type: "json" };

const [mode, base, existingJobId] = process.argv.slice(2);
assert.ok(["create", "read"].includes(mode));
assert.ok(["http://127.0.0.1:3210/vibehard", "https://ldcx.tech/vibehard"].includes(base));
if (mode === "create") assert.equal(process.env.ALLOW_OSS_RAG_TEST, "synthetic-only");
else assert.match(existingJobId ?? "", /^[a-f0-9-]{36}$/);
assert.ok(process.env.DATABASE_URL && process.env.SESSION_SECRET && process.env.VIBEHARD_OSS_INDEX_PATH);
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.pathname, "/vibehard");
const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: "vibehard" };
function query(sql) {
  const answer = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env: pgEnv, encoding: "utf8" });
  assert.equal(answer.status, 0, "Production user lookup failed");
  return answer.stdout.trim().split("\n").filter(Boolean).map(line => line.split("\t"));
}
const [owner] = mode === "create"
  ? query("select id,email,name,role from users where role='admin' order by created_at limit 1")
  : query(`select u.id,u.email,u.name,u.role from design_jobs j join users u on u.id=j.user_id where j.id='${existingJobId}'`);
const [other] = query(`select id,email,name,role from users where id <> '${owner?.[0] ?? ""}' order by created_at limit 1`);
assert.ok(owner?.[0] && other?.[0], "Two distinct production accounts are required for isolation test");
function cookie([id, email, name, role]) {
  const payload = Buffer.from(JSON.stringify({ id, email, name, role, exp: Date.now() + 300000 })).toString("base64url");
  return `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}`;
}
async function request(path, user, init = {}) {
  return fetch(`${base}${path}`, { ...init, headers: { ...(user ? { Cookie: cookie(user) } : {}), ...init.headers },
    signal: AbortSignal.timeout(15000) });
}

let jobId = existingJobId;
if (mode === "create") {
  const response = await request("/api/design", owner, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: randomUUID(), requirement:
      "请为 ESP32-S3-Touch-LCD-2.8C 设计一个 USB 供电的触摸屏开发板演示节点，参考该型号原理图，列出 BOM 和 I2C/SPI/电源接口的待核实约束。" }) });
  assert.equal(response.status, 202, `Production design submission HTTP ${response.status}`);
  const submitted = await response.json();
  jobId = submitted.job?.id;
  assert.match(jobId ?? "", /^[a-f0-9-]{36}$/);
  console.log(JSON.stringify({ syntheticJobId: jobId, created: true, recordRetained: true }));
}
assert.equal((await request(`/api/design/${jobId}`, null)).status, 401, "Anonymous detail access");
assert.equal((await request(`/api/design/${jobId}`, other)).status, 404, "Cross-user detail access");
assert.equal((await request(`/api/design/${jobId}/download`, other)).status, 404, "Cross-user download access");
const otherList = await request("/api/design", other);
assert.equal(otherList.status, 200, "Other user's list access");
assert.ok(!(await otherList.json()).jobs.some(job => job.id === jobId), "Cross-user list leak");

let response = await request(`/api/design/${jobId}`, owner);
assert.equal(response.status, 200, "Owner detail access");
let { job } = await response.json();
if (mode === "create") {
  const deadline = Date.now() + 180000;
  while (["queued", "running"].includes(job.status) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    response = await request(`/api/design/${jobId}`, owner);
    assert.equal(response.status, 200);
    job = (await response.json()).job;
  }
}
assert.equal(job.status, "completed", job.error ?? "Real model task did not complete");
assert.ok(job.model && Array.isArray(job.result?.bom) && job.result.bom.length > 0);
assert.equal(job.result.retrieval?.method, "keyword-chunks-fts5-v1");
const references = job.result.retrieval.references.filter(reference => reference.reviewStatus === "auto-indexed");
assert.ok(references.length > 0 && references.length <= 5);
const board = "ESP32-S3-Touch-LCD-2.8C";
const allowed = associations.boards[board];
assert.ok(allowed?.length);
const db = new DatabaseSync(process.env.VIBEHARD_OSS_INDEX_PATH, { readOnly: true });
db.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF");
let schematic = false;
try {
  const chunk = db.prepare("SELECT text FROM chunks WHERE source_sha=? AND page=? AND part=? LIMIT 1");
  for (const reference of references) {
    const match = /^(.*)#page=(\d+)&part=(\d+)$/.exec(reference.source);
    assert.ok(match, "Missing citation page/part");
    assert.ok(allowed.some(entry => entry.sourceSha256 === reference.sha256 && entry.citationPath === match[1]),
      "Citation is not an approved alias for this exact board");
    const row = chunk.get(reference.sha256, Number(match[2]), Number(match[3]));
    assert.ok(row?.text?.includes(reference.excerpt), "Citation does not match private index text");
    schematic ||= reference.sha256 === "01eae811f2b777b3f919108acb48c61e79734055f517a07d516185ef26299d76";
  }
} finally { db.close(); }
assert.ok(schematic, "Verified board schematic was not referenced");
const markdownResponse = await request(`/api/design/${jobId}/download`, owner);
assert.equal(markdownResponse.status, 200);
const markdown = await markdownResponse.text();
assert.ok(markdown.includes("未人工复核") && references.every(reference => markdown.includes(reference.source)));
console.log(JSON.stringify({ mode, syntheticJobId: jobId, owner: 200, anonymous: 401, crossUserDetail: 404,
  crossUserDownload: 404, crossUserListAbsent: true, realModel: job.model,
  bomRows: job.result.bom.length, references: references.length, schematicCitation: true,
  aliasAndChunkVerified: true, markdownCitations: true, recordRetained: true }));
