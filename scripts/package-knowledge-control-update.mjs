// Package the reviewed batch-control CLI without changing a running service.
// Usage: node scripts/package-knowledge-control-update.mjs <git-commit> <output-dir>
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const [commit, output] = process.argv.slice(2);
const releaseName = "20260928-knowledge-control-v2";
assert.match(commit ?? "", /^[a-f0-9]{40}$/);
assert.match(output ?? "", /^\/private\/tmp\/vibehard-control-release\.[A-Za-z0-9]+$/);
const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
assert.equal(result.status, 0);
assert.equal(result.stdout.trim(), commit, "Build must use the checked-out commit");
const status = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
assert.equal(status.status, 0);
assert.equal(status.stdout.trim(), "", "Release source must be committed and clean");
const release = path.join(output, releaseName);
assert.ok(!existsSync(release), "Release directory already exists");
mkdirSync(path.join(release, "services"), { recursive: true });
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const artifact = path.join(release, "services/knowledge-batch-control.cjs");
await build({
  entryPoints: ["scripts/knowledge-batch-control.ts"], outfile: artifact,
  bundle: true, platform: "node", target: "node22", format: "cjs",
  minify: false, logLevel: "warning",
});
const manifest = {
  release: releaseName,
  stage: "knowledge-control-cli",
  gitCommit: commit,
  previousControl: "20260927-controlled-ingestion-v1",
  compatibleRetrieval: "20260928-audit-fixes-v1",
  artifacts: { "knowledge-batch-control.cjs": hash(artifact) },
  serviceUnitsChanged: [],
};
writeFileSync(path.join(release, "RELEASE.json"), JSON.stringify(manifest, null, 2));
const archive = path.join(output, `${releaseName}.tar.gz`);
const packed = spawnSync("tar", ["--no-xattrs", "-czf", archive, "-C", output, releaseName], {
  stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" },
});
assert.equal(packed.status, 0);
console.log(JSON.stringify({ archive, sha256: hash(archive), manifest }));
