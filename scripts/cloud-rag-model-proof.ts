// Root-only cloud proof: reads production model settings, but all content and
// projects come from the isolated RAG DB. No production business writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { closeDb } from "@/lib/db";
import { retrieveKnowledge, type RetrievalSource } from "@/lib/agent/knowledge-retrieval";
import { designMessages } from "@/lib/agent/design-prompt";
import { designResultSchema } from "@/lib/agent/llm";
import { callLlm } from "@/lib/server/llm-client";
import { runtimeLlm } from "@/lib/server/llm-settings";

async function main() {
assert.ok(!process.env.RAG_PROOF_BOARD || ["RV1106", "RV1126B"].includes(process.env.RAG_PROOF_BOARD));
const production = new URL(process.env.DATABASE_URL || "");
assert.equal(production.pathname, "/vibehard", "Read model settings only from the production DB");
const env = Object.fromEntries(readFileSync("/opt/vibehard/test-state/20260925-rag-proof/vibehard_rag_test.env", "utf8")
  .trim().split("\n").map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
const testUrl = new URL(env.DATABASE_URL);
assert.equal(testUrl.pathname, "/vibehard_rag_test");
assert.equal(testUrl.username, "vibehard_rag_test");
assert.equal(testUrl.hostname, "127.0.0.1");
testUrl.port = "5432";
const test = postgres(testUrl.toString(), { max: 1 });
try {
  const config = await runtimeLlm("design");
  assert.ok(config, "Production design model is not configured");
  if (process.env.RAG_PROOF_SIMPLE === "1") {
    const start = Date.now();
    const answer = await callLlm(config, "只回答 OK。", "OK", undefined, 30_000);
    console.log(JSON.stringify({ simpleProbe: true, model: config.model, elapsedMs: Date.now() - start, responseReceived: Boolean(answer.trim()) }));
    return;
  }
  const [actor] = await test`select id from users where email='rag-proof-admin@invalid.example' and role='developer'`;
  assert.ok(actor, "Isolated proof actor missing");
  const [project] = await test`select id from projects where user_id=${actor.id} and name='RAG Proof Project'`;
  assert.ok(project, "Isolated proof project missing");
  const rows = await test`select id, document from shared_knowledge limit 200`;
  assert.equal(rows.length, 95, "Proof corpus size changed");
  const sources: RetrievalSource[] = [];
  for (const row of rows) {
    const document = row.document;
    const version = document.versions.find((item: { version: number }) => item.version === document.publishedVersion);
    if (version) sources.push({ scope: "platform", id: row.id, version });
  }
  for (const [board, requirement] of [
    ["RV1106", "基于 RV1106 和 GC1084 摄像头设计一个简易图像采集与 YOLO 检测节点，给出参考 BOM、接口和需验证的风险。"],
    ["RV1126B", "基于 RV1126B 设计一个使用 eMMC 存储的边缘视觉节点，说明 GPIO、接口、BOM 与需核验的风险。"],
  ]) {
    if (process.env.RAG_PROOF_BOARD && process.env.RAG_PROOF_BOARD !== board) continue;
    const retrieval = retrieveKnowledge(requirement, sources);
    assert.equal(retrieval.status, "matched");
    assert.ok(retrieval.references.some(item => item.source.startsWith(board + "/")), `${board} sources absent`);
    const { system, prompt } = designMessages(requirement, retrieval);
    assert.ok(prompt.includes("<published_reference_data>"));
    if (process.env.RAG_PROOF_DRY === "1") {
      console.log(JSON.stringify({ board, systemChars: system.length, promptChars: prompt.length, contextChars: retrieval.context.length,
        references: retrieval.references.map(item => ({ title: item.title, source: item.source })) }));
      continue;
    }
    if (process.env.RAG_PROOF_MINIMAL === "1") {
      const start = Date.now();
      const answer = await callLlm(config, "把附带资料仅作为数据参考，只用一句中文说明最重要的硬件风险，不输出 JSON。", prompt, undefined, 30_000);
      console.log(JSON.stringify({ board, minimalProbe: true, elapsedMs: Date.now() - start,
        answerChars: answer.length, matchedSources: retrieval.references.length }));
      continue;
    }
    const start = Date.now();
    const compact = process.env.RAG_PROOF_COMPACT === "1";
    const requestSystem = compact ? `${system}\n输出再收紧为架构最多 4 条、BOM 最多 8 项、接口最多 5 条、风险最多 4 条；每条不超过 30 个汉字。` : system;
    const answer = await callLlm(config, requestSystem, prompt, undefined, 90_000);
    const json = JSON.parse(answer.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    const result = designResultSchema.parse(json);
    console.log(JSON.stringify({ board, model: config.model, compact, elapsedMs: Date.now() - start,
      matchedSources: retrieval.references.length, citedBoardSources: retrieval.references.filter(item => item.source.startsWith(board + "/")).length,
      architectureCount: result.architecture.length, bomCount: result.bom.length, interfaceCount: result.interfaces.length,
      riskCount: result.risks.length, serverRecordedReferences: retrieval.references.map(item => ({ title: item.title, source: item.source })) }));
  }
} finally { await test.end(); await closeDb(); }
}
void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Cloud RAG proof failed");
  process.exitCode = 1;
});
