// Read-only release checks against the actual build and its served assets.
// The pre-rendered PCB HTML is checked on disk because authenticated production
// pages must not be accessed with synthetic or borrowed credentials.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = process.argv[2] || "http://127.0.0.1:3211";
const standalone = process.argv[3];
const base = new URL("/vibehard/", origin);
const request = (path, options = {}) => fetch(new URL(path, base), {
  signal: AbortSignal.timeout(20000), ...options,
});
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

assert.ok(standalone, "Pass the standalone directory as the second argument");
assert.equal((await request("login")).status, 200);
const guarded = await request("app/pcb", { redirect: "manual" });
assert.equal(guarded.status, 307);
assert.equal(new URL(guarded.headers.get("location"), base).pathname, "/vibehard/login");
assert.equal((await request("api/projects")).status, 401);

const demo = await request("demo");
assert.equal(demo.status, 200);
const demoHtml = await demo.text();
assert.ok(demoHtml.includes("每一个外设，都有调试脉络。"));
assert.ok(demoHtml.includes("围绕板级外设展开调试"));
assert.ok(demoHtml.includes("introductionLabel"), "Preserve the current Demo copy layout");
const recordings = {};
for (const slug of ["design", "datasheets", "pcb", "debug", "embedded"]) {
  const path = `demo/recordings/${slug}.gif`;
  assert.ok(demoHtml.includes(`/vibehard/${path}`));
  const response = await request(path);
  assert.equal(response.status, 200, path);
  assert.ok(response.headers.get("content-type")?.includes("image/gif"), path);
  const actual = Buffer.from(await response.arrayBuffer());
  const expected = await readFile(resolve(standalone, "public", path));
  assert.equal(digest(actual), digest(expected), `Media mismatch: ${path}`);
  recordings[slug] = digest(actual);
}

const pcbHtml = await readFile(resolve(standalone, ".next/server/app/app/pcb.html"), "utf8");
assert.ok(pcbHtml.includes("温湿度监测节点 v0.2"), "PCB page reverted to the old example");
assert.ok(pcbHtml.includes("ESP32-S3-WROOM-1"));

const assets = new Set();
for (const html of [demoHtml, pcbHtml]) {
  for (const match of html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css)(?:\?[^\"]*)?)"/g)) {
    if (match[1].startsWith("/vibehard/_next/")) assets.add(match[1].replaceAll("&amp;", "&"));
  }
}
assert.ok(assets.size > 0, "No frontend assets found");
let detailedPcbBundle = false;
for (const path of assets) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  const text = await response.text();
  if (text.includes("TH-NODE / REV 0.2")) {
    for (const marker of ["ANTENNA / COPPER KEEPOUT", "ESPRESSIF", "装配视图", "布线视图", "下载 PCB 预览 PNG"]) {
      assert.ok(text.includes(marker), `Missing PCB feature: ${marker}`);
    }
    detailedPcbBundle = true;
  }
}
assert.ok(detailedPcbBundle, "Detailed PCB renderer missing from assets referenced by the actual page");
console.log(JSON.stringify({ origin, pcb: "v0.2", detailedPcbBundle, authGuard: 307,
  unauthenticatedProjects: 401, demo: 200, assets: assets.size, recordings }, null, 2));
