// Read-only post-cutover check of the retained candidate task via the public
// API. No synthetic job or additional model request is created.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const base = process.argv[2], jobId = process.argv[3];
assert.equal(base, "https://ldcx.tech/vibehard");
assert.match(jobId ?? "", /^[a-f0-9-]{36}$/);
assert.ok(process.env.DATABASE_URL && process.env.SESSION_SECRET && process.env.VIBEHARD_OSS_INDEX_PATH);
const url = new URL(process.env.DATABASE_URL); assert.equal(url.pathname, "/vibehard");
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: "vibehard" };
const answer = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c",
  `select u.id,u.email,u.name,u.role from design_jobs j join users u on u.id=j.user_id where j.id='${jobId}'`], { env, encoding: "utf8" });
assert.equal(answer.status, 0);
const [id, email, name, role] = answer.stdout.trim().split("\t"); assert.ok(id && email);
const payload = Buffer.from(JSON.stringify({ id, email, name, role, exp: Date.now() + 60000 })).toString("base64url");
const cookie = `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}`;
const request = path => fetch(`${base}${path}`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(15000) });
const response = await request(`/api/design/${jobId}`); assert.equal(response.status, 200);
const { job } = await response.json(); assert.equal(job.status, "completed");
assert.equal(job.result?.retrieval?.method, "keyword-chunks-fts5-v1");
const references = job.result.retrieval.references.filter(reference => reference.reviewStatus === "auto-indexed");
assert.ok(references.length > 0 && references.length <= 5);
const db = new DatabaseSync(process.env.VIBEHARD_OSS_INDEX_PATH, { readOnly: true });
try {
  for (const reference of references) {
    const match = reference.source.match(/^(.*)#page=(\d+)&part=(\d+)$/); assert.ok(match);
    const row = db.prepare("SELECT text FROM chunks WHERE source_sha=? AND source_path=? AND page=? AND part=?")
      .get(reference.sha256, match[1], Number(match[2]), Number(match[3]));
    assert.ok(row?.text?.includes(reference.excerpt));
  }
} finally { db.close(); }
const download = await request(`/api/design/${jobId}/download`); assert.equal(download.status, 200);
const markdown = await download.text(); assert.ok(markdown.includes("未人工复核"));
assert.ok(references.every(reference => markdown.includes(reference.source)));
console.log(JSON.stringify({ publicJob: "completed", references: references.length, indexedSourceMatch: true,
  markdownCitations: true, noWritesOrModelCalls: true }));
