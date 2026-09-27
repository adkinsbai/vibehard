import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const output = process.argv[2];
const name = "20260927-rag-board-links-v1";
assert.match(output ?? "", /^\/private\/tmp\/vibehard-rag-worker-[A-Za-z0-9]+$/);
const release = path.join(output, name);
assert.ok(!existsSync(release) && existsSync("dist/services/design-worker.cjs"));
mkdirSync(`${release}/services`, { recursive: true, mode: 0o755 });
mkdirSync(`${release}/source`, { mode: 0o755 });
copyFileSync("dist/services/design-worker.cjs", `${release}/services/design-worker.cjs`);
copyFileSync("dist/services/design-worker.cjs.map", `${release}/services/design-worker.cjs.map`);
await build({ entryPoints: ["scripts/verify-oss-rag-board-retrieval.ts"],
  outfile: `${release}/services/rag-board-audit.cjs`, bundle: true, platform: "node", target: "node22",
  format: "cjs", logLevel: "warning" });
const sources = ["lib/server/oss-knowledge-index.ts", "lib/server/data/oss-rag-board-associations.json",
  "scripts/build-oss-rag-board-associations.mjs", "scripts/verify-oss-rag-board-retrieval.ts",
  "scripts/verify-rag-board-production.mjs", "docs/oss-rag-index-refinement-task.md",
  "docs/rag-worker-production-2026-09-27.md"];
const sha = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const sourceSha256 = {};
for (const file of sources) {
  assert.ok(existsSync(file), `Missing release source: ${file}`);
  mkdirSync(path.dirname(`${release}/source/${file}`), { recursive: true });
  copyFileSync(file, `${release}/source/${file}`);
  sourceSha256[file] = sha(file);
}
const commit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
assert.equal(commit.status, 0);
const manifest = { release: name, kind: "worker-only", gitCommit: commit.stdout.trim(),
  previousWorker: "/opt/vibehard/releases/20260926-esp32-fts-v1/services/design-worker.cjs",
  indexSqliteSha256: "cb18cf9cc8b92d0a8f125376f8e7b06aee0f2776b478dbc69b3114f19f2a4eb9",
  indexManifestSha256: "3cc6440aa480c470183f49ed61b296d6168e64080241c5672a9538727011c7a1",
  workerSha256: sha(`${release}/services/design-worker.cjs`),
  auditSha256: sha(`${release}/services/rag-board-audit.cjs`), sourceSha256,
  excluded: ["platform", "Gateway", "Runner", "VibeBoard", "EDA manager", "nginx", "database migration", "OSS writes", "model settings"] };
writeFileSync(`${release}/RELEASE.json`, `${JSON.stringify(manifest, null, 2)}\n`);
const archive = `${output}/vibehard-${name}.tar.gz`;
const tar = spawnSync("tar", ["-czf", archive, "-C", output, name],
  { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } });
assert.equal(tar.status, 0);
console.log(JSON.stringify({ archive, archiveSha256: sha(archive), workerSha256: manifest.workerSha256,
  auditSha256: manifest.auditSha256, sourceFiles: sources.length }));
