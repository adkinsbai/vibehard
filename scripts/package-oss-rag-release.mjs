import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const output = process.argv[2];
assert.match(output ?? "", /^\/private\/tmp\/vibehard-oss-rag-release-[A-Za-z0-9]+$/);
const name = "20260926-esp32-fts-v1";
const release = path.join(output, name);
assert.ok(!existsSync(release) && existsSync(".next/standalone/server.js") && existsSync("dist/services/design-worker.cjs"));
mkdirSync(release, { mode: 0o755 });
cpSync(".next/standalone", `${release}/standalone`, { recursive: true, verbatimSymlinks: true });
cpSync(".next/static", `${release}/standalone/.next/static`, { recursive: true, verbatimSymlinks: true });
cpSync("public", `${release}/standalone/public`, { recursive: true, verbatimSymlinks: true });
const modules = `${release}/standalone/node_modules/.pnpm`;
for (const entry of readdirSync(modules).filter(item => item.startsWith("@swc+helpers@"))) {
  const source = `node_modules/.pnpm/${entry}/node_modules/@swc/helpers/esm`;
  if (existsSync(source)) cpSync(source, `${modules}/${entry}/node_modules/@swc/helpers/esm`, { recursive: true });
}
mkdirSync(`${release}/services`);
copyFileSync("dist/services/design-worker.cjs", `${release}/services/design-worker.cjs`);
const listed = spawnSync("git", ["ls-files", "-z"], { encoding: "buffer" });
assert.equal(listed.status, 0);
const files = listed.stdout.toString("utf8").split("\0").filter(Boolean);
const commit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
assert.equal(commit.status, 0);
const hashes = {};
for (const file of files) {
  assert.ok(!file.startsWith("/") && !file.split("/").includes(".."));
  mkdirSync(path.dirname(`${release}/source/${file}`), { recursive: true });
  copyFileSync(file, `${release}/source/${file}`);
  hashes[file] = createHash("sha256").update(readFileSync(file)).digest("hex");
}
const required = ["app/app/eda/page.tsx", "lib/eda/kicad.ts", "app/app/pcb/page.tsx", "app/demo/page.tsx",
  "lib/server/design-knowledge.ts", "lib/server/oss-knowledge-index.ts", "components/app/design-result.tsx",
  "scripts/verify-frontend-release.mjs", "scripts/verify-oss-knowledge-index.ts"];
for (const file of required) assert.ok(hashes[file], `Release source missing ${file}`);
const workerHash = createHash("sha256").update(readFileSync(`${release}/services/design-worker.cjs`)).digest("hex");
writeFileSync(`${release}/RELEASE.json`, JSON.stringify({ release: name, previousPlatform: "20260926-eda-grid-v1",
  previousWorker: "20260925-board-rag-v3", gitCommit: commit.stdout.trim(), indexManifestSha256: "3cc6440aa480c470183f49ed61b296d6168e64080241c5672a9538727011c7a1",
  indexSqliteSha256: "cb18cf9cc8b92d0a8f125376f8e7b06aee0f2776b478dbc69b3114f19f2a4eb9",
  services: ["vibehard.service", "vibehard-design-worker.service"], excluded: ["Runner", "Gateway", "VibeBoard", "nginx", "EDA manager", "model settings", "database migration"],
  workerSha256: workerHash, sourceSha256: hashes }, null, 2));
const archive = path.join(output, `vibehard-${name}.tar.gz`);
const tar = spawnSync("tar", ["-czf", archive, "-C", output, name], { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } });
assert.equal(tar.status, 0);
console.log(JSON.stringify({ archive, sha256: createHash("sha256").update(readFileSync(archive)).digest("hex"), files: files.length, workerSha256: workerHash }));
