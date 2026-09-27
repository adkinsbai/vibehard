// Package only the verified active-source overlay and the new design worker.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ragReleaseOverlay } from "./rag-release-overlay.mjs";

const root = process.argv[2];
assert.match(root ?? "", /^\/private\/tmp\/vibehard-rag-release-[A-Za-z0-9]+$/);
const build = `${root}/build`, name = "20260925-board-rag-v3", release = `${root}/${name}`;
assert.ok(existsSync(`${build}/.next/standalone/server.js`));
assert.ok(existsSync(`${build}/dist/services/design-worker.cjs`));
assert.ok(!existsSync(release));
mkdirSync(release, { mode: 0o755 });
cpSync(`${build}/.next/standalone`, `${release}/standalone`, { recursive: true, verbatimSymlinks: true });
cpSync(`${build}/.next/static`, `${release}/standalone/.next/static`, { recursive: true, verbatimSymlinks: true });
cpSync(`${build}/public`, `${release}/standalone/public`, { recursive: true, verbatimSymlinks: true });
const modules = `${release}/standalone/node_modules/.pnpm`;
for (const entry of readdirSync(modules).filter(item => item.startsWith("@swc+helpers@"))) {
  const source = `${build}/node_modules/.pnpm/${entry}/node_modules/@swc/helpers/esm`;
  if (existsSync(source)) cpSync(source, `${modules}/${entry}/node_modules/@swc/helpers/esm`, { recursive: true });
}
const omit = new Set(["node_modules", ".next", ".git", "dist", "out", "next-env.d.ts"]);
cpSync(build, `${release}/source`, { recursive: true, verbatimSymlinks: true, filter: file =>
  !omit.has(path.basename(file)) && !path.basename(file).startsWith(".env") && !file.endsWith(".tsbuildinfo") });
mkdirSync(`${release}/services`);
cpSync(`${build}/dist/services/design-worker.cjs`, `${release}/services/design-worker.cjs`);
cpSync(`${build}/dist/services/migrate.cjs`, `${release}/services/migrate.cjs`);
const activeScripts = `${root}/active-release-scripts/scripts`;
assert.ok(existsSync(`${activeScripts}/verify-taishan-integration.mjs`));
assert.ok(existsSync(`${activeScripts}/verify-llm-model-discovery.mjs`));
cpSync(activeScripts, `${release}/scripts`, { recursive: true, verbatimSymlinks: true });
for (const file of ["verify-design-knowledge.mjs", "import-board-knowledge.mjs", "extract-knowledge-pdf.py"]) {
  copyFileSync(`${build}/scripts/${file}`, `${release}/scripts/${file}`);
}
for (const file of ["deploy-board-rag.mjs", "cloud-rag-candidate.mjs"]) copyFileSync(`scripts/${file}`, `${release}/scripts/${file}`);
const hashes = {};
function walk(dir, prefix = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix + entry.name, full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, relative + "/");
    else { assert.ok(entry.isFile(), `Unexpected source link: ${relative}`); hashes[relative] = createHash("sha256").update(readFileSync(full)).digest("hex"); }
  }
}
walk(`${release}/source`);
const base = JSON.parse(readFileSync(`${root}/BASE_RELEASE.json`, "utf8"));
const changed = Object.keys(hashes).filter(file => base.sourceSha256[file] !== hashes[file]).sort();
assert.ok(changed.length >= 30, "RAG overlay unexpectedly small");
for (const file of changed) assert.ok(ragReleaseOverlay.includes(file), `Out-of-scope source change: ${file}`);
for (const file of Object.keys(base.sourceSha256)) assert.ok(file in hashes, `Baseline file missing: ${file}`);
for (const protectedPath of ["app/demo", "public/demo", "next.config.ts", "app/app/pcb", "components/pcb"]) {
  for (const [file, hash] of Object.entries(base.sourceSha256)) {
    if (file === protectedPath || file.startsWith(protectedPath + "/")) assert.equal(hashes[file], hash, `Protected source changed: ${file}`);
  }
}
writeFileSync(`${release}/RELEASE.json`, JSON.stringify({ release: name, previousRelease: base.release,
  source: "Verified active model-discovery source plus allowlisted design/RAG runtime and test overlays",
  sourceOverlay: changed,
  protectedFrontend: base.protectedFrontend, migrations: ["0005_design_jobs", "0006_shared_knowledge"],
  services: ["vibehard.service", "vibehard-design-worker.service"],
  excludes: ["Runner/Gateway/VibeBoard/nginx changes", "raw PDF hosting and 8 GB bulk import"],
  sourceSha256: hashes }, null, 2));
const archive = `${root}/vibehard-${name}.tar.gz`;
assert.equal(spawnSync("tar", ["--no-xattrs", "-czf", archive, "-C", root, name], { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } }).status, 0);
console.log(JSON.stringify({ archive, sha256: createHash("sha256").update(readFileSync(archive)).digest("hex"), sourceFiles: Object.keys(hashes).length }));
