// Read-only production verification. No account creation or role changes.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const base = process.argv[2];
assert.match(base ?? "", /^(http:\/\/127\.0\.0\.1:321[01]|https:\/\/ldcx\.tech)\/vibehard$/);
assert.ok(process.env.SESSION_SECRET);
const database = new URL(process.env.DATABASE_URL); assert.equal(database.pathname, "/vibehard");
const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432", PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: "vibehard" };
const result = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", "select coalesce(json_agg(u),'[]'::json) from (select distinct on (role) id,email,name,role from users order by role,created_at) u"], { env, encoding: "utf8" });
assert.equal(result.status, 0, "Could not read verification roles");
const users = JSON.parse(result.stdout.trim());
const admin = users.find(user => user.role === "admin"), member = users.find(user => user.role === "member");
assert.ok(admin && member, "An existing administrator and member are required; do not auto-create users");
function headers(user) {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 300_000 })).toString("base64url");
  return { Cookie: `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}` };
}
const request = (route, init = {}) => fetch(base + route, { ...init, signal: AbortSignal.timeout(20000), redirect: "manual" });
const anon = await request("/app/knowledge"); assert.equal(anon.status, 307); assert.equal(new URL(anon.headers.get("location"), base).pathname, "/vibehard/login");
const boards = JSON.parse(readFileSync(new URL("../source/lib/server/data/board-catalog.json", import.meta.url), "utf8"));
assert.equal(boards.length, 63); assert.equal(boards.flatMap(board => board.resources).length, 1076);
const bundlePaths = new Set();
for (const user of users.filter(user => ["admin", "developer", "member"].includes(user.role))) {
  for (const rsc of [false, true]) {
    // Next 16 canonicalizes RSC requests without this query marker via a 307.
    const response = await request(`/app/knowledge${rsc ? "?_rsc" : ""}`, { headers: { ...headers(user), ...(rsc ? { RSC: "1" } : {}) } });
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control") ?? "", /private|no-store/);
    const body = await response.text();
    if (user.role === "member") { assert.ok(body.includes("仅管理员和开发者")); assert.ok(!body.includes(boards[0].name)); }
    else {
      for (const board of boards) assert.ok(body.includes(board.name), `Missing board: ${board.name}`);
      if (!rsc) {
        for (const label of ["开发板选型库", "芯片手册", "原理图库", "PCB 库", "驱动与示例", "开发经验"]) assert.ok(body.includes(label), label);
        assert.ok(!body.includes("待补充"));
        for (const match of body.matchAll(/<script[^>]+src="([^"]+)"/g)) bundlePaths.add(match[1]);
      }
    }
  }
}
for (const role of ["admin", "developer"]) {
  const forged = await request("/app/knowledge", { headers: headers({ ...member, role }) });
  assert.equal(forged.status, 200); const body = await forged.text(); assert.ok(body.includes("仅管理员和开发者")); assert.ok(!body.includes(boards[0].name));
}
const absent = await request("/app/knowledge", { headers: headers({ id: "00000000-0000-4000-8000-000000000001", email: "render@example.invalid", name: "No user", role: "admin" }) });
assert.equal(absent.status, 307);
const legacy = await request("/app/board-library", { headers: headers(admin) }); assert.equal(legacy.status, 307); assert.equal(new URL(legacy.headers.get("location"), base).pathname, "/vibehard/app/knowledge");
for (const path of bundlePaths) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) }); assert.equal(response.status, 200);
  const code = await response.text(); assert.ok(!code.includes(boards[0].name), "Catalog leaked into publicly downloadable JS");
}
console.log(JSON.stringify({ base, boards: boards.length, resourceReferences: 1076, anonymousRedirect: true, persistedRolesChecked: users.map(user => user.role), forgedRoleDenied: true, deletedUserDenied: true, legacyRedirect: true, noCatalogInPublicBundles: true, noDatabaseWrites: true }));
