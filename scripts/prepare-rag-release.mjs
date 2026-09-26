// Prepare an isolated build from the verified active release source. Never
// copy the whole dirty development tree into production.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ragReleaseOverlay } from "./rag-release-overlay.mjs";

const root = process.argv[2];
assert.match(root ?? "", /^\/private\/tmp\/vibehard-rag-release-[A-Za-z0-9]+$/);
const source = `${root}/source`, build = `${root}/build`;
assert.ok(existsSync(`${source}/app/app/pcb/page.tsx`) && existsSync(`${source}/public/demo`));
assert.ok(!existsSync(build));
const base = JSON.parse(readFileSync(`${root}/BASE_RELEASE.json`, "utf8"));
assert.equal(base.release, "20260925-llm-model-discovery-v2");
for (const [file, expected] of Object.entries(base.sourceSha256)) {
  const actual = createHash("sha256").update(readFileSync(`${source}/${file}`)).digest("hex");
  assert.equal(actual, expected, `Active baseline differs: ${file}`);
}

const overlay = ragReleaseOverlay;
cpSync(source, build, { recursive: true, verbatimSymlinks: true });
for (const file of overlay) {
  const from = path.resolve(file), to = `${build}/${file}`;
  assert.ok(existsSync(from), `Missing overlay: ${file}`);
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
}
for (const protectedPath of ["app/demo", "public/demo", "next.config.ts", "app/app/pcb", "components/pcb"]) {
  assert.ok(existsSync(`${build}/${protectedPath}`), `Missing protected ${protectedPath}`);
}
console.log(JSON.stringify({ baseline: base.release, verifiedBaselineFiles: Object.keys(base.sourceSha256).length,
  build, overlayFiles: overlay.length, protectedFrontend: base.protectedFrontend }));
