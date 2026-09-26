// Read-only production verification. Uses one persisted member only to render the protected page.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";

const base = process.argv[2];
assert.match(base ?? "", /^(http:\/\/127\.0\.0\.1:321[01]|https:\/\/ldcx\.tech)\/vibehard$/);
assert.ok(process.env.SESSION_SECRET);
const database = new URL(process.env.DATABASE_URL); assert.equal(database.pathname, "/vibehard");
const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432", PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: "vibehard" };
const result = spawnSync("/usr/bin/psql", ["-X", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", "select row_to_json(u) from (select id,email,name,role from users order by created_at limit 1) u"], { env, encoding: "utf8" });
assert.equal(result.status, 0, "Could not read a verification user");
const user = JSON.parse(result.stdout.trim()); assert.ok(user?.id, "An existing user is required; do not create one");
const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + 300_000 })).toString("base64url");
const cookie = `vibehard_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}`;
const request = (route, init = {}) => fetch(base + route, { ...init, signal: AbortSignal.timeout(20000), redirect: "manual" });

const anon = await request("/app/taishan"); assert.equal(anon.status, 307); assert.equal(new URL(anon.headers.get("location"), base).pathname, "/vibehard/login");
const page = await request("/app/taishan", { headers: { Cookie: cookie } });
assert.equal(page.status, 200); const body = await page.text();
for (const marker of ["泰山派开发", "VibeBoard", "项目和知识数据暂不与 VibeHard 自动同步", "/Vibeboard/"]) assert.ok(body.includes(marker), marker);
assert.ok((body.match(/href="\/vibehard\/app\/taishan"/g) ?? []).length >= 2, "Desktop and mobile entries required");
assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'self'/);
// A bare RSC probe without Next-Router-State-Tree returns the route shell, not the leaf payload.
// Validate the transport only; the full authenticated HTML above validates the actual page content.
const rsc = await request("/app/taishan?_rsc", { headers: { Cookie: cookie, RSC: "1" } });
assert.equal(rsc.status, 200); assert.match(rsc.headers.get("content-type") ?? "", /text\/x-component/); await rsc.arrayBuffer();
const external = await fetch("https://ldcx.tech/Vibeboard/", { signal: AbortSignal.timeout(20000), redirect: "manual" });
assert.equal(external.status, 200); const portal = await external.text(); assert.ok(portal.includes("VibeBoard"));
assert.ok(!/deny|sameorigin/i.test(external.headers.get("x-frame-options") ?? ""), "VibeBoard blocks iframe");
assert.ok(!/frame-ancestors\s+'none'/i.test(external.headers.get("content-security-policy") ?? ""), "VibeBoard CSP blocks iframe");
console.log(JSON.stringify({ base, anonymousRedirect: true, authenticatedHtmlAndRsc: true, desktopAndMobileEntries: true, iframePath: "/Vibeboard/", portalStatus: 200, iframeHeadersCompatible: true, independentAccountBoundaryShown: true, noDatabaseWritesOrModelCalls: true }));
