// Package the reviewed September 28 audit and BOM releases from immutable Git trees.
// Usage: node scripts/package-staged-platform.mjs <source-dir> <git-ref> <audit|bom> <output-dir> <previous-RELEASE.json>
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [source, ref, stage, output, previousManifestPath] = process.argv.slice(2);
const names = { audit: "20260928-audit-fixes-v1", bom: "20260928-bom-pricing-v2" };
assert.ok(stage in names);
assert.match(output ?? "", /^\/private\/tmp\/vibehard-staged-release\.[A-Za-z0-9]+$/);
assert.ok(path.isAbsolute(source) && existsSync(previousManifestPath));
const release = path.join(output, names[stage]);
assert.ok(!existsSync(release), "Never overwrite an existing release");
const previous = JSON.parse(readFileSync(previousManifestPath, "utf8"));
assert.equal(previous.release, stage === "audit" ? "20260927-unified-retrieval-v1" : names.audit);
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 120_000 });
  assert.equal(result.status, 0, `${command} failed`);
  return result.stdout.trim();
};
assert.equal(run("git", ["rev-parse", ref], process.cwd()), ref);
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
} else {
  for (const file of ["lib/server/project-bom.ts", "lib/bom-price-snapshots.ts", "app/api/projects/[id]/bom/route.ts"]) assert.ok(existsSync(path.join(source, file)));
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
if (stage === "audit") {
  mkdirSync(path.join(release, "services"));
  for (const name of ["design-worker.cjs", "knowledge-retrieval.cjs"]) {
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
  const original = path.join(process.cwd(), "scripts", file);
  assert.ok(existsSync(original), file);
  copyFileSync(original, path.join(release, "scripts", file));
  toolHashes[file] = hash(original);
}
const runtime = file => /^(?:app|components|lib|public|runner|gateway|drizzle)\//.test(file) || ["package.json", "pnpm-lock.yaml", "next.config.ts", "proxy.ts", "instrumentation.ts"].includes(file);
const changedRuntime = Object.entries(previous.sourceSha256).filter(([file, digest]) => runtime(file) && hashes[file] !== digest).map(([file]) => file);
const newRuntime = files.filter(file => runtime(file) && !previous.sourceSha256[file]);
const manifest = { release: names[stage], stage, previousPlatform: previous.release,
  previousWorker: stage === "audit" ? previous.release : names.audit,
  previousRetrieval: "20260927-controlled-ingestion-v1", gitCommit: ref,
  sourceSha256: hashes, artifacts, toolSha256: toolHashes, changedRuntime, newRuntime,
  excluded: ["database migration", "OSS write", "model settings", "Gateway", "Runner", "VibeBoard", "EDA manager", "nginx"] };
writeFileSync(path.join(release, "RELEASE.json"), JSON.stringify(manifest, null, 2));
const archive = path.join(output, `vibehard-${names[stage]}.tar.gz`);
const result = spawnSync("tar", ["--no-xattrs", "-czf", archive, "-C", output, names[stage]], { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } });
assert.equal(result.status, 0, "tar failed");
console.log(JSON.stringify({ archive, sha256: hash(archive), sourceFiles: files.length, changedRuntime, newRuntime, artifacts }));
