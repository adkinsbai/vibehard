// Read-only deployment check. Never prints provider credentials or response bodies.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";

const base = process.argv[2];
assert.match(base ?? "", /^(http:\/\/127\.0\.0\.1:321[01]|https:\/\/ldcx\.tech)\/vibehard$/);
assert.ok(process.env.SESSION_SECRET && process.env.DATABASE_URL);
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.pathname, "/vibehard");
const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432",
  PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: "vibehard" };
const query = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c",
  "select row_to_json(u) from (select distinct on (role) id,email,name,role from users where role in ('admin','member') order by role,created_at) u"], { env, encoding: "utf8" });
assert.equal(query.status, 0, "Could not read verification roles");
const users = query.stdout.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
const admin = users.find(user => user.role === "admin"), member = users.find(user => user.role === "member");
assert.ok(admin && member, "Existing admin and member accounts required; no accounts are created");
function cookie(user) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 300_000 })).toString("base64url");
  return `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}`;
}
const request = (route, options = {}) => fetch(base + route, { ...options, redirect: "manual", signal: AbortSignal.timeout(20_000) });
const adminHeaders = { Cookie: cookie(admin) };
const settingsResponse = await request("/api/admin/llm", { headers: adminHeaders });
assert.equal(settingsResponse.status, 200);
const settingsBody = await settingsResponse.text();
const settings = JSON.parse(settingsBody).settings;
assert.equal(settings.length, 2);
assert.ok(!settingsBody.includes("encryptedApiKey") && !settingsBody.includes('"apiKey"'));
const configured = settings.find(item => item.purpose === "design" && item.hasApiKey)
  ?? settings.find(item => item.purpose === "agent" && item.hasApiKey);
assert.ok(configured, "No configured provider available for real list verification");
const payload = JSON.stringify({ purpose: configured.purpose, baseUrl: configured.baseUrl, revision: configured.revision });
const post = (headers, body = payload) => request("/api/admin/llm/models", {
  method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body,
});
assert.equal((await post({})).status, 401);
assert.equal((await post({ Cookie: cookie(member) })).status, 403);
const changed = await post(adminHeaders, JSON.stringify({ purpose: configured.purpose, baseUrl: "https://another.example/v1", revision: configured.revision }));
assert.equal(changed.status, 400, "Changing provider address without a new key must be denied");
const discovered = await post(adminHeaders);
assert.equal(discovered.status, 200, "Configured provider did not return GET /models; no configuration was changed");
const modelBody = await discovered.text();
const models = JSON.parse(modelBody).models;
assert.ok(Array.isArray(models) && models.length > 0, "Provider returned no selectable models");
assert.ok(models.every(model => typeof model.id === "string" && model.id.length > 0));
assert.equal(discovered.headers.get("cache-control"), "no-store");

const page = await request("/app/admin", { headers: adminHeaders });
assert.equal(page.status, 200);
const html = await page.text();
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
assert.ok(scripts.length);
const bundles = await Promise.all(scripts.map(async source => {
  const response = await fetch(new URL(source, base), { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200); return response.text();
}));
assert.ok(bundles.join("\n").includes("获取模型列表"), "Admin bundle lacks the model discovery control");
console.log(JSON.stringify({ base, configuredPurpose: configured.purpose, listedModels: models.length,
  adminOnly: true, newAddressRequiresKey: true, adminBundle: true, noConfigWrites: true }));
