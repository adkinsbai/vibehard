import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
const root = process.argv[2];
assert.match(root ?? "", /^\/private\/tmp\/vibehard-taishan-[A-Za-z0-9]+$/);
const build = `${root}/build`, name = "20260922-taishan-integration", release = `${root}/${name}`;
assert.ok(existsSync(`${build}/.next/standalone/server.js`)); assert.ok(!existsSync(release));
mkdirSync(release, { mode: 0o755 });
cpSync(`${build}/.next/standalone`, `${release}/standalone`, { recursive: true, verbatimSymlinks: true });
cpSync(`${build}/.next/static`, `${release}/standalone/.next/static`, { recursive: true, verbatimSymlinks: true });
cpSync(`${build}/public`, `${release}/standalone/public`, { recursive: true, verbatimSymlinks: true });
// Next's tracer may omit dynamically selected ESM helpers. Preserve the matched package.
const modules = `${release}/standalone/node_modules/.pnpm`;
for (const entry of readdirSync(modules).filter(name => name.startsWith("@swc+helpers@"))) {
  const source = `${build}/node_modules/.pnpm/${entry}/node_modules/@swc/helpers/esm`;
  if (existsSync(source)) cpSync(source, `${modules}/${entry}/node_modules/@swc/helpers/esm`, { recursive: true });
}
const omit = new Set(["node_modules", ".next", ".git", "dist", "out", "next-env.d.ts"]);
cpSync(build, `${release}/source`, { recursive: true, verbatimSymlinks: true, filter: source => !omit.has(path.basename(source)) && !path.basename(source).startsWith(".env") && !source.endsWith(".tsbuildinfo") });
cpSync(`${build}/scripts`, `${release}/scripts`, { recursive: true, verbatimSymlinks: true });
const hashes = {};
function walk(dir, prefix = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix + entry.name, full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, relative + "/");
    else { assert.ok(entry.isFile(), `Unexpected source symlink: ${relative}`); hashes[relative] = createHash("sha256").update(readFileSync(full)).digest("hex"); }
  }
}
walk(`${release}/source`);
writeFileSync(`${release}/RELEASE.json`, JSON.stringify({ release: name, previousRelease: "20260922-homepage", baseCommit: "54fa2ca5fabb386ae853f782fa9dc7cb5bd5b956", source: "Active release source plus allowlisted Taishan integration overlay; not the complete current local branch", protectedFrontend: ["app/demo", "public/demo", "next.config.ts", "app/app/pcb", "components/pcb"], migration: null, services: ["vibehard.service"], proxyChange: null, includes: ["authenticated Taishan entry", "embedded VibeBoard page", "desktop and mobile navigation", "module help"], excludes: ["design background jobs / 0005 migration", "VibeHard/VibeBoard account or project-data synchronization"], sourceSha256: hashes }, null, 2));
const archive = `${root}/vibehard-${name}.tar.gz`;
assert.equal(spawnSync("tar", ["--no-xattrs", "-czf", archive, "-C", root, name], { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } }).status, 0);
console.log(JSON.stringify({ archive, sha256: createHash("sha256").update(readFileSync(archive)).digest("hex") }));
