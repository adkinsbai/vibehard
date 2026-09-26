import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const base = process.argv[2];
const staticOnly = process.argv.includes("--static");
assert.match(base ?? "", /^(http:\/\/127\.0\.0\.1:321[01]|https:\/\/ldcx\.tech)\/vibehard$/);
assert.ok(process.env.SESSION_SECRET);
const renderPayload = Buffer.from(JSON.stringify({ id: "design-render-check", email: "render@example.invalid", name: "Render Check", role: "member", exp: Date.now() + 60_000 })).toString("base64url");
const renderSignature = createHmac("sha256", process.env.SESSION_SECRET).update(renderPayload).digest("base64url");
const page = await fetch(`${base}/app/design`, { headers: { Cookie: `vibehard_session=${renderPayload}.${renderSignature}` }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
assert.equal(page.status, 200);
const html = await page.text();
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
const bundles = await Promise.all(scripts.map(async (source) => {
  const response = await fetch(new URL(source, base).toString(), { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200, `Could not fetch ${source}`);
  return response.text();
}));
const code = bundles.join("\n");
assert.ok(code.includes("内置工程规则 + 已发布资料检索；无匹配会明确提示。BOM 将填写人民币参考单价。"));
assert.ok(code.includes("参考单价（人民币）"));
assert.ok(code.includes("知识库检索记录"));
assert.ok(!code.includes("直接调用管理员配置的模型，当前不接入知识库。"));
if (staticOnly) {
  console.log(JSON.stringify({ base, publishedRetrievalCopy: true, priceColumn: true, retrievalRecord: true }));
  process.exit(0);
}

assert.ok(process.env.DATABASE_URL);
assert.ok(process.env.SESSION_SECRET);
assert.equal(process.env.ALLOW_DESIGN_JOB_TEST, "synthetic-only", "Non-static verification persists a synthetic project/job and uses model quota; require explicit opt-in");
const database = new URL(process.env.DATABASE_URL);
const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432", PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: database.pathname.slice(1) };
const query = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", "select id,email,name from users where role='admin' order by created_at limit 1"], { env, encoding: "utf8" });
assert.equal(query.status, 0);
const [id, email, name] = query.stdout.trim().split("\t");
assert.ok(id && email);
const payload = Buffer.from(JSON.stringify({ id, email, name, role: "admin", exp: Date.now() + 300_000 })).toString("base64url");
const signature = createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
const response = await fetch(`${base}/api/design`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: `vibehard_session=${payload}.${signature}` },
  body: JSON.stringify({ requestId: randomUUID(), requirement: "生成一个 USB 供电、带温度传感器和状态指示灯的最小测试节点，请给出 BOM。" }),
  signal: AbortSignal.timeout(15_000),
});
assert.equal(response.status, 202);
let { job } = await response.json();
console.log(JSON.stringify({ jobId: job.id, projectId: job.projectId, note: "Synthetic record retained for review; no automatic deletion" }));
const deadline = Date.now() + 140_000;
while (["queued", "running"].includes(job.status) && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 3000));
  const status = await fetch(`${base}/api/design/${job.id}`, { headers: { Cookie: `vibehard_session=${payload}.${signature}` }, signal: AbortSignal.timeout(10_000) });
  assert.equal(status.status, 200); job = (await status.json()).job;
}
assert.equal(job.status, "completed", job.error ?? "Background worker did not finish within verification window");
assert.ok(job.knowledgeVersion);
assert.ok(job.result?.bom?.length > 0);
for (const row of job.result.bom) assert.ok((/[¥￥]\s*\d/.test(row.estCost) && /估算/.test(row.estCost)) || /^无法估算[：:]/.test(row.estCost));
console.log(JSON.stringify({ base, jobId: job.id, projectId: job.projectId, knowledgeVersion: job.knowledgeVersion, bomRows: job.result.bom.length }));
