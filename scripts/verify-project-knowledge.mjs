import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const mode = process.argv[2];
assert.ok(["preflight", "seed", "next", "check"].includes(mode));
const release = "/opt/vibehard/releases/20260919-project-knowledge";
const statePath = `${release}/verification/knowledge.json`;
const database = new URL(process.env.DATABASE_URL);
const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432", PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: database.pathname.slice(1) };
const query = sql => {
  const result = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { env, encoding: "utf8" });
  assert.equal(result.status, 0, "Verification SQL failed"); return result.stdout.trim();
};
const base = `http://127.0.0.1:${mode === "preflight" ? 3211 : 3210}/vibehard`;
const cookie = user => {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 300_000 })).toString("base64url");
  return `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}`;
};
let user;
if (mode === "preflight") {
  assert.equal(env.PGDATABASE, "vibehard_knowledge_test_20260919");
  query("insert into users(email,password_hash,name,role) values ('ldkj@admin.com','unusable-test-only','Isolated verifier','admin') on conflict(email) do nothing");
}
user = JSON.parse(query("select json_build_object('id',id,'email',email,'name',name,'role',role) from users where email='ldkj@admin.com' and role='admin'"));
async function request(route, body, expected = 200, actor = user) {
  const response = await fetch(base + route, { headers: { ...(actor ? { Cookie: cookie(actor) } : {}), "Content-Type": "application/json" }, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, expected, `${route} unexpected status`);
  return response.json();
}
const draft = content => ({ title: "上线验收资料", source: "Synthetic deployment fixture; not hardware facts", kind: "manual", content });
async function change(project, body) { return (await request(`/api/projects/${project.id}/knowledge`, body)).documents[0]; }
if (mode === "preflight") {
  const id = randomUUID();
  query(`insert into projects(id,user_id,name,workspace_key) values ('${id}','${user.id}','Isolated HTTP verification','${id}')`);
  const project = { id };
  const route = `/api/projects/${id}/knowledge`;
  await request(route, undefined, 401, null);
  const outsider = JSON.parse(query("select json_build_object('id',id,'email',email,'name',name,'role',role) from users where email like 'knowledge-other-%' limit 1"));
  await request(route, undefined, 403, outsider);
  await request(route, { action: "create", draft: draft("outside") }, 403, outsider);
  let doc = await change(project, { action: "create", draft: draft("v1") });
  assert.equal((await request(route)).publishedCount, 0);
  const publication = { action: "publish", documentId: doc.id, expectedRevision: doc.revision, confirmed: true };
  doc = await change(project, publication);
  await request(route, publication, 409);
  doc = await change(project, { action: "edit", documentId: doc.id, expectedRevision: doc.revision, draft: draft("v2 draft") });
  assert.equal(doc.versions[0].content, "v1"); assert.equal(doc.publishedVersion, 1);
  doc = await change(project, { action: "disable", documentId: doc.id, expectedRevision: doc.revision });
  assert.equal((await request(route)).publishedCount, 0);
  doc = await change(project, { action: "restore-draft", documentId: doc.id, expectedRevision: doc.revision, version: 1 });
  assert.equal(doc.publishedVersion, null);
  doc = await change(project, { action: "publish", documentId: doc.id, expectedRevision: doc.revision, confirmed: true });
  assert.equal(doc.publishedVersion, 2);
  const page = await fetch(`${base}/app/agent/${id}/knowledge`, { headers: { Cookie: cookie(user) } });
  assert.equal(page.status, 200);
  console.log(JSON.stringify({ isolatedHttpLifecycle: true, ownerIsolation: true, staleRevision: 409, page: 200 }));
} else {
  assert.equal(env.PGDATABASE, "vibehard");
  let state;
  if (mode === "seed") {
    assert.ok(!existsSync(statePath), "Do not duplicate production verification projects");
    const { models } = await request("/api/models");
    const model = models.find(item => item.providerId === "vibehard"); assert.ok(model);
    const { project } = await request("/api/projects", { name: "项目知识库上线验收-20260919", workspaceKey: `knowledge-verify-${Date.now()}`, runnerKey: "cloud-runner", model: model.model }, 201);
    const { thread } = await request(`/api/projects/${project.id}/threads`, { title: "审核资料和上下文隔离验收" }, 201);
    const marker = `KB-${randomUUID()}`;
    let doc = await change(project, { action: "create", draft: draft(`验收编号：${marker}`) });
    doc = await change(project, { action: "publish", documentId: doc.id, expectedRevision: doc.revision, confirmed: true });
    doc = await change(project, { action: "edit", documentId: doc.id, expectedRevision: doc.revision, draft: draft(`未发布草稿编号：DRAFT-${randomUUID()}`) });
    state = { project, thread, model, marker, doc, turns: [] };
    mkdirSync(`${release}/verification`, { recursive: true, mode: 0o700 });
  } else state = JSON.parse(readFileSync(statePath, "utf8"));
  if (mode === "seed" || mode === "next") {
    if (mode === "next") {
      const overview = await request(`/api/threads/${state.thread.id}`);
      assert.ok(overview.turns.every(turn => turn.status === "completed"));
      const last = overview.events.filter(event => event.type === "agent.message").at(-1)?.data.text ?? "";
      assert.ok(last.includes(state.marker), "Previous model reply did not use published reference");
      if (state.turns.length === 1) {
        state.marker = `KB-${randomUUID()}`;
        state.doc = await change(state.project, { action: "edit", documentId: state.doc.id, expectedRevision: state.doc.revision, draft: draft(`验收编号：${state.marker}`) });
        state.doc = await change(state.project, { action: "publish", documentId: state.doc.id, expectedRevision: state.doc.revision, confirmed: true });
      } else {
        assert.equal(state.turns.length, 2);
        state.doc = await change(state.project, { action: "disable", documentId: state.doc.id, expectedRevision: state.doc.revision });
      }
    }
    const { turn } = await request(`/api/threads/${state.thread.id}/turns`, { input: "请只根据本轮提供的已审核参考资料，回答其中的验收编号，并标明资料版本。如果没有已审核资料，回答‘无已审核资料’，不要猜测。不要调用工具、访问网络或读写文件。", model: state.model.model, providerId: state.model.providerId }, 202);
    state.turns.push(turn.id);
    writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    console.log(JSON.stringify({ projectId: state.project.id, turnId: turn.id, round: state.turns.length }));
  } else {
    const overview = await request(`/api/threads/${state.thread.id}`);
    writeFileSync(`${release}/verification/knowledge-events.json`, JSON.stringify(overview, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ projectId: state.project.id, turns: overview.turns.map(t => ({ id: t.id, status: t.status })), events: overview.events.filter(e => ["task.started", "task.completed", "task.failed", "agent.message"].includes(e.type)).map(e => ({ turnId: e.turnId, type: e.type, knowledge: e.data.knowledge, text: e.data.text, error: e.data.message })) }));
  }
}
