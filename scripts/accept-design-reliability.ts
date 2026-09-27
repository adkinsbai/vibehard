// Root-only launcher, then isolated child. Production access is limited to one
// read of model settings. Keys cross an anonymous stdin pipe, never argv/logs/files.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";
import { closeDb, requireDb } from "@/lib/db";
import { sharedKnowledge, users } from "@/lib/db/schema";
import { runtimeLlm } from "@/lib/server/llm-settings";
import { callLlm } from "@/lib/server/llm-client";
import { processNextDesign } from "@/lib/server/design-job-worker";
import { claimDesign, enqueueDesign, finishDesign, getDesign, saveDesignDiagnostics } from "@/lib/server/design-job-store";
import { retrieveDesignKnowledge } from "@/lib/server/design-knowledge";
import { closeIndexedKnowledge } from "@/lib/server/oss-knowledge-index";
import type { RuntimeLlm } from "@/lib/agent/llm";

const state = "/opt/vibehard/test-state/20260925-rag-proof";
function isolated(name: string) {
  const directory = name === "vibehard_reliability_test" ? "/opt/vibehard/test-state/20260927-design-reliability" : state;
  const lines = readFileSync(`${directory}/${name}.env`, "utf8").trim().split("\n");
  const env = Object.fromEntries(lines.map(line => { const p = line.indexOf("="); return [line.slice(0, p), line.slice(p + 1)]; }));
  const url = new URL(env.DATABASE_URL); assert.equal(url.pathname, `/${name}`); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.username, name);
  url.port = "5432"; return { ...env, DATABASE_URL: url.toString() };
}
async function main() {
  assert.equal(process.env.ALLOW_DESIGN_ACCEPTANCE, "12-isolated-requests");
  if (process.argv[2] !== "child") {
    assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/vibehard");
    const config = await runtimeLlm("design"); assert.ok(config); await closeDb();
    const child = spawn(process.execPath, [process.argv[1], "child"], { env: { ...process.env, ...isolated("vibehard_reliability_test") }, stdio: ["pipe", "inherit", "inherit"] });
    child.stdin.end(JSON.stringify(config));
    const status = await new Promise<number | null>(resolve => child.on("exit", resolve));
    assert.equal(status, 0, "Isolated model acceptance did not pass; see stage evidence"); return;
  }
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, "/vibehard_reliability_test");
  const input: Buffer[] = []; for await (const chunk of process.stdin) input.push(Buffer.from(chunk));
  const config: RuntimeLlm = JSON.parse(Buffer.concat(input).toString());
  const corpus = postgres(isolated("vibehard_rag_test").DATABASE_URL, { max: 1 });
  const reviewed = new Map<string, { sha256: string; content: string; source: string }>();
  try {
    const rows = await corpus`select id, category, document from shared_knowledge`;
    assert.equal(rows.length, 95, "Reviewed isolated corpus must be intact");
    for (const row of rows) {
      const version = row.document.versions.find((v: { version: number }) => v.version === row.document.publishedVersion);
      if (version) reviewed.set(row.id, version);
      await requireDb().insert(sharedKnowledge).values({ id: row.id, category: row.category, document: row.document }).onConflictDoNothing();
    }
  } finally { await corpus.end(); }
  const actor = (await requireDb().insert(users).values({ email: `design-acceptance-${randomUUID()}@example.invalid`, passwordHash: "disabled-synthetic-account", role: "member" }).returning())[0];
  const index = new DatabaseSync(process.env.VIBEHARD_OSS_INDEX_PATH!, { readOnly: true });
  index.exec("PRAGMA query_only=ON; PRAGMA trusted_schema=OFF");
  const report: unknown[] = []; let failures = 0;
  const cases = [
    { name: "no-match", input: "QZTR987654" },
    { name: "reviewed", input: "基于 RV1106 和 GC1084 摄像头设计一个 USB 供电的图像采集节点，参考已有手册列出 BOM、接口与风险。" },
    { name: "auto-indexed", input: "请为 ESP32-S3-Touch-LCD-2.8C 设计一个 USB 供电的触摸屏演示节点，参考该型号原理图列出 BOM、I2C/SPI/电源接口待核实约束。" },
  ];
  try {
    for (const test of cases) for (let iteration = 1; iteration <= 4; iteration++) {
      const queued = await enqueueDesign(actor.id, { requestId: randomUUID(), requirement: test.input });
      const start = Date.now();
      await processNextDesign({ claimDesign, finishDesign, saveDesignDiagnostics, retrieveDesignKnowledge, callLlm, runtimeLlm: async () => config });
      const job = await getDesign(actor.id, queued.id); assert.ok(job);
      const elapsedMs = Date.now() - start; let passed = job.status === "completed" && elapsedMs < 90_000;
      const refs = job.result?.retrieval?.references ?? [];
      if (test.name === "no-match") passed &&= job.result?.retrieval?.status === "no-match" && refs.length === 0;
      else passed &&= refs.length > 0;
      if (test.name === "auto-indexed") passed &&= refs.some(r => r.reviewStatus === "auto-indexed");
      for (const ref of refs) {
        if (ref.reviewStatus === "auto-indexed") {
          const pos = /#page=(\d+)&part=(\d+)$/.exec(ref.source);
          const chunk = pos ? index.prepare("select text from chunks where source_sha=? and page=? and part=?").get(ref.sha256, Number(pos[1]), Number(pos[2])) as { text: string } | undefined : undefined;
          passed &&= Boolean(chunk?.text.includes(ref.excerpt));
        } else {
          const version = reviewed.get(ref.id);
          passed &&= /file SHA256 [a-f0-9]{64}/i.test(ref.source) && /#(?:page-\d+-)?part-\d+/.test(ref.source)
            && version?.sha256 === ref.sha256 && version?.source === ref.source && Boolean(version?.content.includes(ref.excerpt));
        }
      }
      if (!passed) failures++;
      const row = { case: test.name, iteration, jobId: job.id, status: job.status, elapsedMs, passed, diagnostics: job.diagnostics,
        references: refs.map(({ excerpt, ...ref }) => { void excerpt; return ref; }) };
      report.push(row); console.log(JSON.stringify(row));
    }
    console.log(JSON.stringify({ acceptance: "design-reliability-v1", total: report.length, failures, passed: failures === 0, model: config.model, revision: config.revision, rssMiB: process.memoryUsage().rss / 1024 ** 2 }));
    if (failures) process.exitCode = 1;
  } finally { index.close(); closeIndexedKnowledge(); await closeDb(); }
}
void main().catch(() => { console.error("Isolated acceptance failed (details suppressed; inspect retained stage diagnostics)"); process.exitCode = 1; });
