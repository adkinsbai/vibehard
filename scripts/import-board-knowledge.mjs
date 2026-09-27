#!/usr/bin/env node
// Small, allowlisted RV1106/RV1126B proof batch. Dry-run by default.
// Run with `node --import tsx`; PDF extraction additionally needs pdfplumber.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const specs = [
  { board: "RV1106", path: "docs/hardware-reference.md", title: "Echo-Mate RV1106 硬件参考", category: "boards", kind: "product" },
  { board: "RV1106", path: "docs/camera-yolo.md", title: "Echo-Mate RV1106 摄像头与 YOLO 实测", category: "experience", kind: "sdk" },
  { board: "RV1106", path: "reference/echo-mate/RV1106-datasheet-v2.0.pdf", title: "RV1106 数据手册 v2.0", category: "manuals", kind: "manual" },
  { board: "RV1126B", path: "docs/hardware/BOARD.md", title: "Luckfox Aura RV1126B 实物板卡档案", category: "boards", kind: "product" },
  { board: "RV1126B", path: "docs/hardware/PINMAP.md", title: "Luckfox Aura RV1126B 引脚台账", category: "boards", kind: "schematic" },
  { board: "RV1126B", path: "docs/hardware/PITFALLS.md", title: "Luckfox Aura RV1126B 上板坑清单", category: "experience", kind: "sdk" },
  { board: "RV1126B", path: "docs/hardware-reference.md", title: "Luckfox Aura RV1126B 硬件参考", category: "boards", kind: "product" },
  { board: "RV1126B", path: "docs/software-development.md", title: "Luckfox Aura RV1126B 软件开发基线", category: "firmware", kind: "sdk" },
  { board: "RV1126B", path: "upstream/luckfox-aura-docs/Docs/datasheets/Rockchip_RV1126B_Datasheet_V1.1-20250428.pdf", title: "RV1126B 数据手册 v1.1", category: "manuals", kind: "manual" },
];

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const rootPaths = { RV1106: option("--rv1106-root"), RV1126B: option("--rv1126b-root") };
if (!rootPaths.RV1106 || !rootPaths.RV1126B) {
  throw new Error("必须指定 --rv1106-root 和 --rv1126b-root；默认只预览，不写数据库");
}
const apply = args.includes("--apply");
const allowed = new Set(["--rv1106-root", "--rv1126b-root", "--apply", "--actor-id", "--database-name", "--confirm-batch"]);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw new Error(`未知参数：${args[i]}`);
  if (args[i] !== "--apply") i++;
}

const { prepareKnowledgeSource, directPublishedKnowledgeDocument } = await import("../lib/knowledge-import-batch.ts");
const { retrieveKnowledge } = await import("../lib/agent/knowledge-retrieval.ts");
const realRoots = Object.fromEntries(await Promise.all(Object.entries(rootPaths).map(async ([board, path]) => [board, await realpath(path)])));
const entries = [];
const sources = [];
for (const spec of specs) {
  const root = realRoots[spec.board];
  const fullPath = resolve(root, spec.path);
  if (!fullPath.startsWith(root + sep)) throw new Error("资料路径逃逸");
  const [resolved, metadata] = await Promise.all([realpath(fullPath), lstat(fullPath)]);
  if (resolved !== fullPath || !metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 15_000_000) {
    throw new Error(`资料必须是根目录下的小型普通文件：${spec.board}/${spec.path}`);
  }
  const bytes = await readFile(fullPath);
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  let pages;
  if (spec.path.endsWith(".pdf")) {
    const python = process.env.KNOWLEDGE_PDF_PYTHON || "python3";
    const extractor = join(fileURLToPath(new URL(".", import.meta.url)), "extract-knowledge-pdf.py");
    const result = spawnSync(python, [extractor, fullPath], { encoding: "utf8", maxBuffer: 12_000_000, timeout: 90_000 });
    if (result.error || result.status !== 0) throw new Error(`PDF 提取失败：${spec.board}/${spec.path}；${result.error?.message ?? result.stderr.trim()}`);
    pages = JSON.parse(result.stdout);
  } else {
    const text = bytes.toString("utf8");
    if (text.includes("\ufffd")) throw new Error(`Markdown 编码无效：${spec.board}/${spec.path}`);
    pages = [{ page: null, text }];
  }
  const prepared = prepareKnowledgeSource({ path: `${spec.board}/${spec.path}`, title: spec.title, category: spec.category, kind: spec.kind, fileSha256, pages });
  sources.push({ path: `${spec.board}/${spec.path}`, fileSha256, pages: pages.length, entries: prepared.length });
  entries.push(...prepared);
}
if (!entries.length || entries.length > 150 || new Set(entries.map(entry => entry.id)).size !== entries.length) {
  throw new Error("首批知识条目数超出安全范围或 ID 重复");
}
const batchHash = createHash("sha256").update(JSON.stringify(entries.map(({ id, category, draft }) => [id, category, draft.source, createHash("sha256").update(draft.content).digest("hex")]))).digest("hex");
const retrievalSources = entries.map(entry => ({ scope: "platform", id: entry.id, version: {
  ...entry.draft, version: 1, sha256: createHash("sha256").update(entry.draft.content).digest("hex"), reviewedBy: "batch", reviewedAt: "batch",
} }));
const smoke = ["RV1106 GC1084 摄像头 ISP 和 YOLO", "RV1126B eMMC GPIO 硬件设计"].map(query => {
  const found = retrieveKnowledge(query, retrievalSources);
  return { query, status: found.status, references: found.references.map(item => ({ title: item.title, source: item.source })) };
});
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", sourceFiles: sources, entries: entries.length, batchHash, smoke }, null, 2));
if (!apply) process.exit(0);

const actorId = option("--actor-id");
const databaseName = option("--database-name");
const confirmedHash = option("--confirm-batch");
if (!/^[0-9a-f-]{36}$/i.test(actorId ?? "") || !databaseName || confirmedHash !== batchHash || !process.env.DATABASE_URL) {
  throw new Error("正式写入必须提供管理员/开发者 UUID、目标数据库名、当前批次哈希及 DATABASE_URL");
}
if (decodeURIComponent(new URL(process.env.DATABASE_URL).pathname) !== `/${databaseName}`) throw new Error("目标数据库名不匹配，拒绝写入");

const [{ requireDb, closeDb }, { sharedKnowledge, users, auditLogs }, { isKnowledgeReviewer }, { eq, sql }] = await Promise.all([
  import("../lib/db/index.ts"), import("../lib/db/schema.ts"), import("../lib/agent/knowledge.ts"), import("drizzle-orm"),
]);
try {
  const result = await requireDb().transaction(async tx => {
    const [actor] = await tx.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1);
    if (!isKnowledgeReviewer(actor?.role)) throw new Error("指定账号不是管理员/开发者，拒绝导入");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('vibehard:shared-knowledge'))`);
    const existing = await tx.select({ id: sharedKnowledge.id, category: sharedKnowledge.category, document: sharedKnowledge.document }).from(sharedKnowledge);
    const byId = new Map(existing.map(item => [item.id, item]));
    const newCount = entries.filter(item => !byId.has(item.id)).length;
    if (existing.length + newCount > 200) throw new Error("平台知识库 200 份上限不足，未写入任何条目");
    let inserted = 0, skipped = 0;
    for (const entry of entries) {
      const prior = byId.get(entry.id);
      if (prior) {
        const version = prior.document.versions.find(item => item.version === prior.document.publishedVersion);
        if (prior.category !== entry.category || !version || ["title", "content", "source", "kind"].some(key => version[key] !== entry.draft[key])) {
          throw new Error(`已有同 ID 资料与本批次不一致，拒绝覆盖：${entry.id}`);
        }
        skipped++; continue;
      }
      const document = directPublishedKnowledgeDocument(entry, actorId);
      await tx.insert(sharedKnowledge).values({ id: entry.id, category: entry.category, document, createdBy: actorId });
      inserted++;
    }
    await tx.insert(auditLogs).values({ userId: actorId, action: "sharedKnowledge.authorizedDirectImport", metadata: { batchHash, inserted, skipped, sourceFiles: sources.map(item => item.path), manualReview: false } });
    return { inserted, skipped };
  });
  console.log(JSON.stringify({ applied: true, batchHash, ...result }));
} finally { await closeDb(); }
