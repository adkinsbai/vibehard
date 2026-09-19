import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, chownSync, existsSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2];
assert.ok(["static", "seed", "modify", "check", "approve", "reject", "interrupt"].includes(mode));
const release = "/opt/vibehard/releases/20260919-engineering-workflow";
const statePath = `${release}/verification/state.json`;
const port = mode === "static" ? process.argv[3] : "3210";
assert.ok(["3210", "3211"].includes(port));
const base = `http://127.0.0.1:${port}/vibehard`;
const database = new URL(process.env.DATABASE_URL);
const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432", PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: database.pathname.slice(1) };
function query(sql) {
  const result = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", env });
  assert.equal(result.status, 0, "Verification database query failed");
  return result.stdout.trim();
}
const user = JSON.parse(query("select json_build_object('id',id,'email',email,'name',name,'role',role) from users where email='ldkj@admin.com' and role='admin'"));
const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 300_000 })).toString("base64url");
const signature = createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
const headers = { Cookie: `vibehard_session=${payload}.${signature}`, "Content-Type": "application/json" };
async function request(route, body) {
  const response = await fetch(base + route, { headers, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000) });
  assert.ok(response.ok, `${route} returned ${response.status}`);
  return response.json();
}
if (mode === "static") {
  const response = await fetch(base + "/app/agent", { headers, signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200);
  const html = await response.text();
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
  let code = "";
  for (const source of scripts) {
    const bundle = await fetch(new URL(source, base), { signal: AbortSignal.timeout(10_000) });
    assert.equal(bundle.status, 200); code += await bundle.text();
  }
  for (const label of ["工程工作流已加载", "云端工程执行证据报告", "cloud-workflow-report.md"]) assert.ok(code.includes(label), `Missing workbench feature: ${label}`);
  console.log(JSON.stringify({ port, workflowUi: true }));
} else {
  assert.equal(process.env.ALLOW_WORKFLOW_VERIFICATION, "20260919-engineering-workflow");
  let state;
  if (mode === "seed") {
    assert.ok(!existsSync(statePath), "Verification project already exists");
    assert.equal(query("select count(*) from agent_turns where status in ('queued','running','waiting_approval')"), "0");
    const { models } = await request("/api/models");
    const model = models.find(item => item.providerId === "vibehard");
    assert.ok(model, "Managed cloud model not found");
    const { project } = await request("/api/projects", { name: "工程工作流上线验收-20260919", workspaceKey: `workflow-verify-${Date.now()}`, runnerKey: "cloud-runner", model: model.model });
    assert.match(project.workspaceKey, /^[0-9a-f-]{36}\/[0-9a-f-]{36}-workflow-verify-[0-9]+$/);
    assert.ok(project.workspaceKey.startsWith(user.id + "/"));
    const workspace = path.join("/var/lib/vibehard-runner/workspaces", project.workspaceKey);
    assert.ok(!existsSync(workspace), "Refusing to overwrite an existing workspace");
    const uid = Number(spawnSync("id", ["-u", "vibehard-runner"], { encoding: "utf8" }).stdout.trim());
    const gid = Number(spawnSync("id", ["-g", "vibehard-runner"], { encoding: "utf8" }).stdout.trim());
    assert.ok(uid > 0 && gid > 0);
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    chownSync(path.dirname(workspace), uid, gid); chownSync(workspace, uid, gid);
    for (const [name, content] of Object.entries({
      "README.md": "# Workflow verification fixture\nNative C sample; not a hardware firmware project. Only math.c may be changed. Run make test. Keep test.c and Makefile unchanged.\n",
      "math.c": "int add(int a, int b) { return a - b; }\n",
      "test.c": '#include <assert.h>\n#include <stdio.h>\nint add(int,int);\nint main(void) { assert(add(2,3)==5); assert(add(-1,1)==0); puts("WORKFLOW_TEST_OK"); return 0; }\n',
      "Makefile": "test:\n\tgcc -Wall -Wextra -Werror math.c test.c -o test_app\n\t./test_app\n",
    })) { const file = path.join(workspace, name); writeFileSync(file, content, { mode: 0o600 }); chownSync(file, uid, gid); }
    const { thread } = await request(`/api/projects/${project.id}/threads`, { title: "分析与受控修改验收" });
    state = { project, thread, model, workspace, turns: [] };
    mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
    writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  } else state = JSON.parse(readFileSync(statePath, "utf8"));
  if (mode === "seed" || mode === "modify") {
    if (mode === "modify") {
      const overview = await request(`/api/threads/${state.thread.id}`);
      assert.ok(overview.turns.every(turn => ["completed", "failed", "interrupted"].includes(turn.status)), "Existing task is active");
    }
    const input = mode === "seed"
      ? "请只读分析当前小型 C 工程，实际读取 README.md、math.c、test.c 和 Makefile，指出入口、测试方式和潜在缺陷。不修改文件，不运行构建。用简短中文报告，区分已检查和未验证。"
      : "基于刚才的分析修复 add 函数，只允许修改 math.c；不要修改 README.md、test.c、Makefile。先说明范围，再申请必要写入或执行审批，运行 make test。测试会生成 test_app，这是本次允许的产物。不要使用网络、Git、其他目录或设备。最后报告实际修改、测试结果与未验证项。";
    const { turn } = await request(`/api/threads/${state.thread.id}/turns`, { input, model: state.model.model, providerId: state.model.providerId });
    state.turns.push(turn.id); writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    console.log(JSON.stringify({ projectId: state.project.id, threadId: state.thread.id, turnId: turn.id, submitted: mode }));
  }
  if (mode === "approve" || mode === "reject") {
    const overview = await request(`/api/threads/${state.thread.id}`);
    const approval = overview.approvals.find(item => item.id === process.argv[3] && item.turnId === state.turns.at(-1) && item.status === "pending");
    assert.ok(approval, "Approval does not belong to this verification task");
    await request(`/api/approvals/${approval.id}/decision`, { decision: mode });
    console.log(JSON.stringify({ decision: mode, approvalId: approval.id }));
  }
  if (mode === "interrupt") { await request(`/api/threads/${state.thread.id}/interrupt`, {}); console.log("Verification task interrupt requested"); }
  if (mode === "check") {
    const overview = await request(`/api/threads/${state.thread.id}`);
    writeFileSync(`${release}/verification/events.json`, JSON.stringify(overview, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ projectId: state.project.id, turns: overview.turns.map(turn => ({ id: turn.id, status: turn.status })), approvals: overview.approvals.filter(item => item.status === "pending"), events: overview.events.filter(event => ["task.started", "task.completed", "task.failed", "task.interrupted", "agent.message", "tool.completed"].includes(event.type)).map(event => ({ type: event.type, workflow: event.data.workflow, report: event.data.workflowReport, text: event.data.text, item: event.data.item && { type: event.data.item.type, command: event.data.item.command, exitCode: event.data.item.exitCode, status: event.data.item.status }, error: event.data.message })) }));
  }
}
