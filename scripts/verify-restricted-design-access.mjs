import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";

const base = process.argv[2];
assert.match(base ?? "", /^(http:\/\/127\.0\.0\.1:321[01]|https:\/\/ldcx\.tech)\/vibehard$/);
assert.ok(process.env.DATABASE_URL && process.env.SESSION_SECRET);
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.pathname, "/vibehard");
const pgEnv = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: "vibehard" };
const query = (sql) => {
  const answer = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env: pgEnv, encoding: "utf8" });
  assert.equal(answer.status, 0, "Read-only authorization fixture query failed");
  return answer.stdout.trim().split("\n").filter(Boolean).map(line => line.split("\t"));
};
const [[projectId, ownerId, jobId]] = query("select p.id,p.user_id,j.id from projects p join design_jobs j on j.project_id=p.id order by j.created_at desc limit 1");
assert.ok(projectId && ownerId && jobId, "Existing design job required; no fixture will be created");
const users = query(`select id,email,name,role from users where id='${ownerId}' or id<>(select user_id from projects where id='${projectId}') order by (id='${ownerId}') desc limit 2`);
const owner = users.find(row => row[0] === ownerId), outsider = users.find(row => row[0] !== ownerId);
assert.ok(owner && outsider, "Two existing distinct users required; no account will be created");
const cookie = row => {
  const payload = Buffer.from(JSON.stringify({ id: row[0], email: row[1], name: row[2], role: row[3], exp: Date.now() + 60000 })).toString("base64url");
  return `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}`;
};
const request = (path, cookieValue) => fetch(`${base}${path}`, { headers: cookieValue ? { Cookie: cookieValue } : {},
  redirect: "manual", signal: AbortSignal.timeout(10000) });
assert.equal((await request(`/api/design/${jobId}`)).status, 401);
assert.equal((await request(`/api/design/${jobId}`, cookie(outsider))).status, 404);
assert.equal((await request(`/api/design/${jobId}`, cookie(owner))).status, 200);
const foreignList = await request(`/api/design?projectId=${projectId}`, cookie(outsider));
assert.equal(foreignList.status, 200);
assert.deepEqual((await foreignList.json()).jobs, []);
console.log(JSON.stringify({ base, anonymousDenied: true, foreignDetailDenied: true, ownerDetailAllowed: true,
  foreignListEmpty: true, noWrites: true }));
