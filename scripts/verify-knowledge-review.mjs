import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
const mode = process.argv[2]; assert.ok(["preflight", "production"].includes(mode));
const database = new URL(process.env.DATABASE_URL);
const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432", PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: database.pathname.slice(1) };
assert.equal(env.PGDATABASE, mode === "preflight" ? "vibehard_knowledge_test_20260919" : "vibehard");
function query(sql) {
  const result = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { env, encoding: "utf8" });
  assert.equal(result.status, 0, "Verification SQL failed (output suppressed)"); return result.stdout.trim();
}
const base = `http://127.0.0.1:${mode === "preflight" ? 3211 : 3210}/vibehard`;
function cookie(user) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 300_000 })).toString("base64url");
  return `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}`;
}
async function request(actor, route, body, status = 200) {
  const response = await fetch(base + route, { headers: { ...(actor ? { Cookie: cookie(actor) } : {}), "Content-Type": "application/json" }, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, status, `${route} expected ${status}, got ${response.status}`); return response.json();
}
if (mode === "preflight") {
  query("insert into users(email,password_hash,name,role) values ('ldkj@admin.com','unusable-test-only','Isolated reviewer','admin'),('review-owner@example.invalid','unusable-test-only','Owner','member'),('review-developer@example.invalid','unusable-test-only','Developer','developer'),('review-outsider@example.invalid','unusable-test-only','Outsider','member') on conflict(email) do update set role=excluded.role");
}
const admin = JSON.parse(query("select json_build_object('id',id,'email',email,'name',name,'role',role) from users where email='ldkj@admin.com' and role='admin'")); assert.ok(admin);
const member = JSON.parse(query(`select json_build_object('id',id,'email',email,'name',name,'role',role) from users where ${mode === "preflight" ? "email='review-owner@example.invalid'" : "role='member'"} limit 1`)); assert.ok(member);
await request(null, "/api/knowledge/review", undefined, 401);
await request(member, "/api/knowledge/review", undefined, 403);
await request(admin, "/api/knowledge/review");
async function bundle(path, markers) {
  const response = await fetch(base + path, { headers: { Cookie: cookie(admin) }, signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200); const html = await response.text(); let code = html;
  for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const asset = await fetch(new URL(match[1], base), { signal: AbortSignal.timeout(15_000) }); assert.equal(asset.status, 200); code += await asset.text();
  }
  for (const marker of markers) assert.ok(code.includes(marker), `Missing UI marker: ${marker}`);
}
await bundle("/app/knowledge-review", ["知识库审核", "只看待审核", "查看资料与审核"]);
await bundle("/app/schematic", ["申请加入知识库备选", "查看申请与审核状态", "管理员或开发者审核发布", "/api/schematic"]);
if (mode === "preflight") {
  const developer = JSON.parse(query("select json_build_object('id',id,'email',email,'name',name,'role',role) from users where email='review-developer@example.invalid'"));
  const outsider = JSON.parse(query("select json_build_object('id',id,'email',email,'name',name,'role',role) from users where email='review-outsider@example.invalid'"));
  const id = randomUUID();
  query(`insert into projects(id,user_id,name,workspace_key) values ('${id}','${member.id}','Isolated knowledge review','${id}')`);
  const route = `/api/projects/${id}/knowledge`;
  const draft = { title: "Synthetic schematic candidate", kind: "schematic", source: "Synthetic fixture; no hardware facts", content: "R7 is unverified. Retain uncertainty." };
  const application = { action: "create", submissionId: randomUUID(), draft };
  let doc = (await request(member, route, application)).documents[0];
  assert.equal((await request(member, route, application)).documents.length, 1);
  await request(outsider, route, undefined, 403);
  await request(developer, route, application, 403);
  const view = await request(developer, route); assert.deepEqual(view.permissions, { canEdit: false, canReview: true });
  assert.deepEqual((await request(member, route)).permissions, { canEdit: true, canReview: false });
  for (const action of ["publish", "disable", "reject"]) {
    const body = { action, documentId: doc.id, expectedRevision: doc.revision, ...(action === "publish" ? { confirmed: true } : action === "reject" ? { reason: "test" } : {}) };
    await request(member, route, body, 403);
    await request({ ...member, role: "admin" }, route, body, 403);
  }
  for (const path of ["/api/admin/overview", "/api/admin/llm"]) await request(developer, path, undefined, 403);
  await request(developer, `/api/admin/users/${member.id}/reset-password`, { password: "not-applied-test-only" }, 403);
  const rejected = { action: "reject", documentId: doc.id, expectedRevision: doc.revision, reason: "Please include original page evidence" };
  doc = (await request(developer, route, rejected)).documents[0]; assert.equal(doc.rejection.reason, rejected.reason);
  await request(admin, route, rejected, 409);
  doc = (await request(member, route, { action: "edit", documentId: doc.id, expectedRevision: doc.revision, draft })).documents[0];
  assert.equal(doc.rejection, undefined);
  doc = (await request(developer, route, { action: "publish", documentId: doc.id, expectedRevision: doc.revision, confirmed: true })).documents[0];
  assert.equal(doc.publishedVersion, 1); assert.equal(doc.versions[0].reviewedBy, developer.id);
  doc = (await request(member, route, { action: "edit", documentId: doc.id, expectedRevision: doc.revision, draft: { ...draft, content: "UNPUBLISHED" } })).documents[0];
  assert.equal(doc.versions[0].content, draft.content);
  doc = (await request(admin, route, { action: "disable", documentId: doc.id, expectedRevision: doc.revision })).documents[0]; assert.equal(doc.publishedVersion, null);
  query(`update users set role='member' where id='${developer.id}'`);
  await request(developer, "/api/knowledge/review", undefined, 403);
  await request(developer, route, { action: "publish", documentId: doc.id, expectedRevision: doc.revision, confirmed: true }, 403);
  query(`update users set role='developer' where id='${developer.id}'`);
  assert.ok(Number(query(`select count(*) from audit_logs where project_id='${id}' and action='knowledge.reject' and metadata->>'reason'='Please include original page evidence'`)) === 1);
  await bundle(`/app/agent/${id}/knowledge?document=${doc.id}`, ["退回修改", "管理员或开发者", "退回原因"]);
  console.log(JSON.stringify({ isolatedHttpReview: true, ownerPublishForbidden: true, adminDeveloperReview: true, developerPrivilegeIsolation: true, forgedAndStaleRolesRejected: true, rejectionAudit: true, schematicApplicationIdempotent: true }));
} else {
  console.log(JSON.stringify({ productionReadOnly: true, adminReviewQueue: 200, memberReviewQueue: 403, newSchematicAndReviewBundles: true, accountsUnchanged: true }));
}
