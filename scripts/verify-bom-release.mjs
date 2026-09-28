// Read-only public/authentication gate. Does not sign in as another user or read credentials.
import assert from "node:assert/strict";

const origin = process.argv[2];
assert.match(origin ?? "", /^(?:http:\/\/127\.0\.0\.1:321[01]|https:\/\/ldcx\.tech)$/);
const base = `${origin}/vibehard`;
const get = path => fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
assert.equal((await get("/login")).status, 200);
const page = await get("/app/bom");
assert.equal(page.status, 307);
assert.equal(new URL(page.headers.get("location")).pathname, "/vibehard/login");
for (const path of ["/api/projects", "/api/projects/00000000-0000-4000-8000-000000000001/bom"]) {
  assert.equal((await get(path)).status, 401, path);
}
console.log(JSON.stringify({ origin, login: 200, bomAnonymousRedirect: 307, projectApiAnonymous: 401, bomApiAnonymous: 401 }));
