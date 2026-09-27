// Execute on the deployment host as root. Candidate uses only disposable RAG
// DB credentials and a loopback port; it never receives production secrets.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const root = "/opt/vibehard/test-state/20260925-rag-proof";
const release = "/opt/vibehard/releases/20260925-board-rag-v3";
const envFile = `${root}/candidate.env`;
const unit = "vibehard-rag-candidate.service";
const mode = process.argv[2];
assert.equal(process.getuid(), 0);
assert.ok(["start", "stop"].includes(mode));
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  assert.equal(result.status, 0, `${command} failed; output suppressed`);
  return result.stdout.trim();
}
if (mode === "start") {
  assert.ok(existsSync(`${release}/standalone/server.js`));
  const vars = Object.fromEntries(readFileSync(`${root}/vibehard_rag_test.env`, "utf8").trim().split("\n").map(line => {
    const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)];
  }));
  const url = new URL(vars.DATABASE_URL);
  assert.equal(url.username, "vibehard_rag_test"); assert.equal(url.pathname, "/vibehard_rag_test");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "15432");
  url.port = "5432";
  const expected = `DATABASE_URL=${url}\nSESSION_SECRET=${vars.SESSION_SECRET}\nDEFAULT_RUNNER_KEY=local-runner\n`;
  if (existsSync(envFile)) assert.equal(readFileSync(envFile, "utf8"), expected, "Existing candidate environment differs");
  else writeFileSync(envFile, expected, { flag: "wx", mode: 0o600 });
  run("systemd-run", ["--unit=vibehard-rag-candidate", "--property=Type=simple",
    `--property=WorkingDirectory=${release}/standalone`, `--property=EnvironmentFile=${envFile}`,
    "--property=MemoryMax=768M", "--property=CPUQuota=100%", "--property=NoNewPrivileges=yes",
    "--setenv=HOSTNAME=127.0.0.1", "--setenv=PORT=3211", "--setenv=NODE_ENV=production",
    "/usr/local/bin/node", "server.js"]);
  console.log(JSON.stringify({ candidate: unit, port: 3211, database: "vibehard_rag_test", productionSecretsLoaded: false }));
}
if (mode === "stop") {
  run("systemctl", ["stop", unit]);
  run("systemctl", ["reset-failed", unit]);
  console.log(JSON.stringify({ stopped: unit, envFileRetained: envFile }));
}
