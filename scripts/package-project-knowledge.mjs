import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, chmodSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = "/private/tmp/vibehard-knowledge-release-iyznZR";
const staging = `${root}/20260919-project-knowledge`;
assert.ok(!existsSync(staging));
mkdirSync(staging, { mode: 0o755 });
for (const [source, target] of [[".next/standalone", "standalone"], ["dist/services", "services"], ["drizzle", "drizzle"], ["scripts", "scripts"]]) cpSync(source, `${staging}/${target}`, { recursive: true, verbatimSymlinks: true });
const files = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
assert.equal(files.status, 0);
for (const file of files.stdout.split("\0").filter(Boolean)) {
  if (/(^|\/)\.env($|\.)/.test(file)) continue;
  if (existsSync(file)) cpSync(file, `${staging}/source/${file}`, { recursive: true, verbatimSymlinks: true });
}
writeFileSync(`${staging}/release.json`, JSON.stringify({ release: "20260919-project-knowledge", baseCommit: "54fa2ca", source: "Complete working-tree snapshot; pending commit", protectedFrontend: ["app/demo", "public/demo", "next.config.ts", "app/app/pcb", "components/pcb"], migration: "0004_project_knowledge", previousRelease: "20260919-engineering-workflow" }, null, 2));
chmodSync(staging, 0o755);
const result = spawnSync("tar", ["--no-xattrs", "-czf", `${root}/vibehard-20260919-project-knowledge.tar.gz`, "-C", root, "20260919-project-knowledge"], { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } });
assert.equal(result.status, 0);
console.log(`${root}/vibehard-20260919-project-knowledge.tar.gz`);
