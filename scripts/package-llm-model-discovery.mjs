// Package a platform-only release from the verified active-source build.
// The server reconstructs the complete source from its immutable prior release
// plus the exact allowlisted overlay; the archive does not re-upload 239 MB.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.argv[2];
assert.match(root ?? "", /^\/private\/tmp\/vibehard-model-discovery-[A-Za-z0-9]+$/);
const build = `${root}/build`, base = JSON.parse(readFileSync(`${root}/BASE_RELEASE.json`, "utf8"));
const name = "20260925-llm-model-discovery-v2", release = `${root}/${name}`;
assert.equal(base.release, "20260922-taishan-integration");
assert.ok(existsSync(`${build}/.next/standalone/server.js`) && !existsSync(release));
const digest = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const overlay = [
  "__tests__/llm-model-discovery-route.test.ts", "__tests__/llm-models.test.ts", "__tests__/llm-settings-page.test.tsx",
  "app/api/admin/llm/models/route.ts", "app/app/admin/page.tsx", "components/app/llm-settings.tsx",
  "lib/agent/llm.ts", "lib/server/llm-models.ts", "lib/server/llm-settings.ts",
];
const hashes = { ...base.sourceSha256 };
for (const file of Object.keys(base.sourceSha256)) {
  if (!overlay.includes(file)) assert.equal(digest(`${build}/${file}`), base.sourceSha256[file], `Out-of-scope change: ${file}`);
}
for (const file of overlay) { assert.ok(existsSync(`${build}/${file}`), file); hashes[file] = digest(`${build}/${file}`); }
for (const protectedPath of base.protectedFrontend) {
  for (const [file, hash] of Object.entries(base.sourceSha256)) {
    if (file === protectedPath || file.startsWith(`${protectedPath}/`)) assert.equal(hashes[file], hash, `Protected frontend changed: ${file}`);
  }
}
mkdirSync(release, { mode: 0o755 });
cpSync(`${build}/.next/standalone`, `${release}/standalone`, { recursive: true, verbatimSymlinks: true });
cpSync(`${build}/.next/static`, `${release}/standalone/.next/static`, { recursive: true, verbatimSymlinks: true });
cpSync(`${build}/public`, `${release}/standalone/public`, { recursive: true, verbatimSymlinks: true });
const modules = `${release}/standalone/node_modules/.pnpm`;
for (const entry of readdirSync(modules).filter(item => item.startsWith("@swc+helpers@"))) {
  const source = `${build}/node_modules/.pnpm/${entry}/node_modules/@swc/helpers/esm`;
  if (existsSync(source)) cpSync(source, `${modules}/${entry}/node_modules/@swc/helpers/esm`, { recursive: true });
}
for (const file of overlay) {
  const target = `${release}/source-overlay/${file}`;
  mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(`${build}/${file}`, target);
}
assert.ok(existsSync(`${root}/active-release-scripts/scripts/verify-taishan-integration.mjs`));
cpSync(`${root}/active-release-scripts/scripts`, `${release}/scripts`, { recursive: true });
for (const file of ["deploy-llm-model-discovery.mjs", "verify-llm-model-discovery.mjs"]) {
  copyFileSync(`scripts/${file}`, `${release}/scripts/${file}`);
}
writeFileSync(`${release}/RELEASE.json`, JSON.stringify({ release: name, previousRelease: base.release,
  source: "Verified active Taishan source plus exact admin model-discovery overlay",
  sourceOverlay: overlay, protectedFrontend: base.protectedFrontend,
  migrations: [], services: ["vibehard.service"],
  excludes: ["RAG/design-worker changes", "Runner/Gateway/VibeBoard/nginx changes", "model/key/role/data changes"],
  sourceSha256: hashes }, null, 2));
const archive = `${root}/vibehard-${name}.tar.gz`;
assert.equal(spawnSync("tar", ["--no-xattrs", "-czf", archive, "-C", root, name], { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } }).status, 0);
console.log(JSON.stringify({ archive, sha256: digest(archive), overlayFiles: overlay.length, sourceFiles: Object.keys(hashes).length }));
