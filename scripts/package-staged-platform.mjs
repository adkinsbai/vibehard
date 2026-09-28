// Package the reviewed September 28 audit and BOM releases from immutable Git trees.
// Usage: node scripts/package-staged-platform.mjs <source-dir> <git-ref> <audit|bom|dashboard|pricefreeze|deviceentry> <output-dir> <previous-RELEASE.json>
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [source, ref, stage, output, previousManifestPath] = process.argv.slice(2);
const names = { audit: "20260928-audit-fixes-v1", bom: "20260928-bom-pricing-v2", dashboard: "20260928-project-dashboard-v1", pricefreeze: "20260928-bom-price-freeze-v1", deviceentry: "20260928-rv1126b-entry-v1" };
assert.ok(stage in names);
assert.match(output ?? "", /^\/private\/tmp\/vibehard-staged-release\.[A-Za-z0-9]+$/);
assert.ok(path.isAbsolute(source) && existsSync(previousManifestPath));
const release = path.join(output, names[stage]);
assert.ok(!existsSync(release), "Never overwrite an existing release");
const previous = JSON.parse(readFileSync(previousManifestPath, "utf8"));
assert.equal(previous.release, stage === "audit" ? "20260927-unified-retrieval-v1" : stage === "bom" ? names.audit : stage === "dashboard" ? names.bom : stage === "pricefreeze" ? names.dashboard : names.pricefreeze);
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, `${command} failed`);
  return result.stdout.trim();
};
assert.equal(run("git", ["rev-parse", "HEAD"], source), ref);
assert.equal(run("git", ["status", "--porcelain=v1", "--untracked-files=normal"], source), "", "Package only a clean reviewed Git tree");
assert.ok(readFileSync(path.join(source, ".next/standalone/server.js"), "utf8").includes('basePath":"/vibehard"'));
for (const file of Object.keys(previous.sourceSha256)) assert.ok(existsSync(path.join(source, file)), `Missing active source ${file}`);
const protectedPaths = ["next.config.ts", "app/demo/", "public/demo/", "app/app/pcb/", "components/pcb/"];
for (const [file, digest] of Object.entries(previous.sourceSha256)) {
  if (protectedPaths.some(prefix => file === prefix || file.startsWith(prefix))) {
    assert.equal(hash(path.join(source, file)), digest, `Protected source changed: ${file}`);
  }
}
if (stage === "audit") {
  for (const file of ["lib/server/design-job-worker.ts", "lib/server/session-cookies.ts", "lib/server/knowledge-index-set.ts"]) assert.ok(existsSync(path.join(source, file)));
} else if (stage === "bom") {
  for (const file of ["lib/server/project-bom.ts", "lib/bom-price-snapshots.ts", "app/api/projects/[id]/bom/route.ts"]) assert.ok(existsSync(path.join(source, file)));
} else if (stage === "dashboard") {
  for (const file of ["app/app/page.tsx", "components/app/dashboard-grid.tsx"]) assert.ok(existsSync(path.join(source, file)));
} else if (stage === "deviceentry") {
  for (const file of ["app/app/taishan/page.tsx", "components/app/app-nav.tsx", "components/app/app-sidebar.tsx", "components/app/dashboard-grid.tsx", "lib/module-help.ts"]) assert.ok(existsSync(path.join(source, file)));
} else {
  for (const file of ["lib/bom-price-snapshots.ts", "lib/server/design-job-worker.ts", "components/app/design-result.tsx"]) assert.ok(existsSync(path.join(source, file)));
}
const files = run("git", ["ls-tree", "-r", "--name-only", ref], process.cwd()).split("\n").filter(Boolean);
mkdirSync(release, { recursive: false });
cpSync(path.join(source, ".next/standalone"), path.join(release, "standalone"), { recursive: true, verbatimSymlinks: true });
cpSync(path.join(source, ".next/static"), path.join(release, "standalone/.next/static"), { recursive: true, force: true });
cpSync(path.join(source, "public"), path.join(release, "standalone/public"), { recursive: true, force: true });
const hashes = {};
for (const file of files) {
  assert.ok(!path.isAbsolute(file) && !file.split("/").includes(".."));
  const original = path.join(source, file);
  assert.ok(existsSync(original), file);
  const target = path.join(release, "source", file);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(original, target);
  hashes[file] = hash(original);
}
const artifacts = {};
if (stage === "audit" || stage === "pricefreeze") {
  mkdirSync(path.join(release, "services"));
  for (const name of stage === "audit" ? ["design-worker.cjs", "knowledge-retrieval.cjs"] : ["design-worker.cjs"]) {
    const original = path.join(source, "dist/services", name);
    assert.ok(existsSync(original), name);
    copyFileSync(original, path.join(release, "services", name));
    artifacts[name] = hash(original);
  }
}
mkdirSync(path.join(release, "scripts"));
const tools = ["deploy-staged-platform.mjs", "verify-bom-release.mjs", "verify-frontend-release.mjs"];
const toolHashes = {};
for (const file of tools) {
  const original = path.join(source, "scripts", file);
  assert.ok(existsSync(original), file);
  copyFileSync(original, path.join(release, "scripts", file));
  toolHashes[file] = hash(original);
}
const runtime = file => /^(?:app|components|lib|public|runner|gateway|drizzle)\//.test(file) || ["package.json", "pnpm-lock.yaml", "next.config.ts", "proxy.ts", "instrumentation.ts"].includes(file);
const changedRuntime = Object.entries(previous.sourceSha256).filter(([file, digest]) => runtime(file) && hashes[file] !== digest).map(([file]) => file);
const newRuntime = files.filter(file => runtime(file) && !previous.sourceSha256[file]);
if (stage === "dashboard") {
  assert.deepEqual(changedRuntime.sort(), ["app/app/page.tsx", "components/app/dashboard-grid.tsx"]);
  assert.deepEqual(newRuntime, []);
}
if (stage === "pricefreeze") {
  assert.deepEqual(changedRuntime.sort(), [
    "app/app/bom/page.tsx", "components/app/design-result.tsx", "lib/agent/design-jobs.ts", "lib/agent/llm.ts",
    "lib/bom-price-snapshots.ts", "lib/server/design-job-worker.ts", "lib/server/project-bom.ts",
  ]);
  assert.deepEqual(newRuntime, []);
}
if (stage === "deviceentry") {
  assert.deepEqual(changedRuntime.sort(), [
    "app/app/taishan/page.tsx", "components/app/app-nav.tsx", "components/app/app-sidebar.tsx",
    "components/app/dashboard-grid.tsx", "lib/module-help.ts",
  ]);
  assert.deepEqual(newRuntime, []);
}
const manifest = { release: names[stage], stage, previousPlatform: previous.release,
  previousWorker: stage === "audit" ? previous.release : stage === "deviceentry" ? names.pricefreeze : names.audit,
  previousRetrieval: ["dashboard", "pricefreeze", "deviceentry"].includes(stage) ? names.audit : "20260927-controlled-ingestion-v1", gitCommit: ref,
  sourceSha256: hashes, artifacts, toolSha256: toolHashes, changedRuntime, newRuntime,
  excluded: ["database migration", "OSS write", "model settings", "Gateway", "Runner", "VibeBoard", "EDA manager", "nginx"] };
writeFileSync(path.join(release, "RELEASE.json"), JSON.stringify(manifest, null, 2));
const archive = path.join(output, `vibehard-${names[stage]}.tar.gz`);
const result = spawnSync("tar", ["--no-xattrs", "-czf", archive, "-C", output, names[stage]], { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } });
assert.equal(result.status, 0, "tar failed");
console.log(JSON.stringify({ archive, sha256: hash(archive), sourceFiles: files.length, changedRuntime, newRuntime, artifacts }));
