// Read-only HTTP checks; no fixture accounts, model calls or business writes.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
const base = process.argv[2];
assert.match(base ?? "", /^(http:\/\/127\.0\.0\.1:321[01]|https:\/\/ldcx\.tech)\/vibehard$/);
const database = new URL(process.env.DATABASE_URL);
const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432", PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: database.pathname.slice(1) };
const sql = "select json_build_object('id',id,'email',email,'name',name,'role',role) from users where role='admin' order by created_at limit 1";
const result = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { env, encoding: "utf8" });
assert.equal(result.status, 0); const admin = JSON.parse(result.stdout.trim()); assert.ok(admin);
const payload = Buffer.from(JSON.stringify({ ...admin, exp: Date.now() + 300_000 })).toString("base64url");
const headers = { Cookie: `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}` };
const scripts = new Map();
const routes = [["/app", "dashboard"], ["/app/agent", "agent"], ["/app/design", "design"], ["/app/schematic", "schematic"], ["/app/datasheets", "datasheets"], ["/app/pcb", "pcb"], ["/app/bom", "bom"], ["/app/debug", "debug"], ["/app/embedded", "embedded"], ["/app/prompts", "prompts"], ["/app/tools", "tools"], ["/app/mcp", "mcp"], ["/app/admin", "admin"], ["/app/knowledge-review", "review"]];
// Use an existing project only to render its page; never create a verification project.
const projectsResponse = await fetch(`${base}/api/projects`, { headers, signal: AbortSignal.timeout(10000) }); assert.equal(projectsResponse.status, 200);
const { projects } = await projectsResponse.json();
if (projects[0]) routes.push([`/app/agent/${projects[0].id}/knowledge`, "knowledge"]);
for (const [route, key] of routes) {
  const response = await fetch(base + route, { headers, signal: AbortSignal.timeout(15000) }); assert.equal(response.status, 200, route);
  const html = await response.text(); let code = html;
  for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const path = match[1];
    if (!scripts.has(path)) {
      const asset = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) }); assert.equal(asset.status, 200, path);
      scripts.set(path, await asset.text());
    }
    code += scripts.get(path);
  }
  assert.ok(code.includes("关闭使用说明") && code.includes("当前能力与注意事项"), `${route}: missing help dialog`);
  assert.ok(code.includes(`module:"${key}"`) || code.includes(`helpKey:"${key}"`) || code.includes(`${key}\\\"`), `${route}: missing module binding`);
}
const queue = await fetch(`${base}/api/knowledge/review`, { headers, signal: AbortSignal.timeout(10000) }); assert.equal(queue.status, 200);
console.log(JSON.stringify({ base, helpPages: routes.length, uniqueBundles: scripts.size, adminKnowledgeReview: 200, noModelCallsOrDataWrites: true }));
