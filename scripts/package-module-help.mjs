import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = process.argv[2];
assert.match(root ?? "", /^\/private\/tmp\/vibehard-module-help-[A-Za-z0-9]+$/);
const name = "20260920-module-help", staging = `${root}/${name}`;
assert.ok(!existsSync(staging)); mkdirSync(staging, { mode: 0o755 });
for (const [source, target] of [[".next/standalone", "standalone"], ["dist/services", "services"], ["drizzle", "drizzle"], ["scripts", "scripts"]]) cpSync(source, `${staging}/${target}`, { recursive: true, verbatimSymlinks: true });
const tracked = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
assert.equal(tracked.status, 0);
for (const file of tracked.stdout.split("\0").filter(Boolean)) {
  if (/(^|\/)\.env($|\.)/.test(file)) continue;
  if (existsSync(file)) cpSync(file, `${staging}/source/${file}`, { recursive: true, verbatimSymlinks: true });
}
const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }); assert.equal(head.status, 0);
writeFileSync(`${staging}/RELEASE.json`, JSON.stringify({ release: name, baseCommit: head.stdout.trim(), source: "Complete working-tree snapshot; pending commit", protectedFrontend: ["app/demo", "public/demo", "next.config.ts", "app/app/pcb", "components/pcb"], previousRelease: "20260920-knowledge-review", migration: null, services: ["vibehard.service"], proxyChange: null }, null, 2));
const archive = `${root}/vibehard-${name}.tar.gz`;
assert.equal(spawnSync("tar", ["--no-xattrs", "-czf", archive, "-C", root, name], { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } }).status, 0);
console.log(archive);
