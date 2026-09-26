// @vitest-environment node
import { mkdtemp, mkdir, symlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chunkKnowledgeText, classifyKnowledgeFile, knowledgeRawObjectKey } from "@/lib/knowledge-import";
import { inspectKnowledgeCorpus } from "@/lib/server/knowledge-corpus-preflight";
import { assessOssKnowledgeReadiness } from "@/lib/server/oss-knowledge-readiness";

const temporary: string[] = [];
afterEach(async () => { for (const directory of temporary.splice(0)) await rm(directory, { recursive: true, force: true }); });
describe("8 GB corpus preflight primitives", () => {
  it("separates indexable text, PDF extraction, OCR, EDA and archives", () => {
    expect(classifyKnowledgeFile("manuals/chip.pdf").mode).toBe("pdf");
    expect(classifyKnowledgeFile("docs/bringup.md").mode).toBe("text");
    expect(classifyKnowledgeFile("pcb/board.kicad_pcb").mode).toBe("eda");
    expect(classifyKnowledgeFile("scans/page.png").mode).toBe("image");
    expect(classifyKnowledgeFile("sdk.zip").mode).toBe("archive");
    expect(classifyKnowledgeFile(".env").mode).toBe("reject");
    expect(classifyKnowledgeFile("id_rsa").mode).toBe("reject");
    expect(classifyKnowledgeFile("secrets.json").mode).toBe("reject");
  });
  it("produces bounded, overlapping, hash-addressable passages", () => {
    const text = "# 温度节点\n" + "通过 I2C 读取传感器。\n".repeat(180);
    const chunks = chunkKnowledgeText(text, 500, 50);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every(chunk => chunk.text.length <= 500 && /^[a-f0-9]{64}$/.test(chunk.sha256))).toBe(true);
    expect(chunks[1].start).toBeLessThan(chunks[0].end);
    expect(() => chunkKnowledgeText("x".repeat(2_000_001))).toThrow("流式分段");
  });
  it("derives stable, Bucket-independent original object keys", () => {
    const batchId = "180912d5-25c5-4943-8470-11865ca4991a";
    const assetId = "d91da643-d21d-4ddb-87ce-0188412afd26";
    const hash = "A".repeat(64);
    expect(knowledgeRawObjectKey(batchId, assetId, hash)).toBe(
      `knowledge/raw/v1/${batchId}/${assetId}/${"a".repeat(64)}`,
    );
    expect(() => knowledgeRawObjectKey("../other-bucket", assetId, hash)).toThrow("无效");
    expect(() => knowledgeRawObjectKey(batchId, assetId, "bad-hash")).toThrow("无效");
  });
  it("reads a directory without following symlinks or including credentials, and detects duplicates", async () => {
    const root = await mkdtemp(join(tmpdir(), "vibehard-corpus-")); temporary.push(root);
    await mkdir(join(root, "manuals"));
    await writeFile(join(root, "manuals", "a.md"), "同一份审核资料");
    await writeFile(join(root, "manuals", "b.md"), "同一份审核资料");
    await writeFile(join(root, ".env"), "TEST_SECRET=not-for-index");
    await writeFile(join(root, "manuals", "chip.pdf"), "%PDF fake fixture");
    await symlink(join(root, ".env"), join(root, "manuals", "linked-secret.md"));
    const result = await inspectKnowledgeCorpus(root, { hash: true });
    expect(result.entries.map(entry => entry.path)).toEqual(["manuals/a.md", "manuals/b.md", "manuals/chip.pdf"]);
    expect(result.skippedSymlinks).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.counts).toMatchObject({ text: 2, pdf: 1 });
    expect(JSON.stringify(result)).not.toContain("TEST_SECRET");
  });
  it("checks OSS preparation without echoing secrets or claiming a live upload", () => {
    const secret = "test-secret-not-real";
    const report = assessOssKnowledgeReadiness({ OSS_KNOWLEDGE_BUCKET: "private-bucket", OSS_KNOWLEDGE_REGION: "oss-cn-hangzhou", OSS_KNOWLEDGE_STS_ROLE_ARN: "acs:ram::123:role/upload", OSS_KNOWLEDGE_ALLOWED_ORIGIN: "https://ldcx.tech", OSS_KNOWLEDGE_ACCESS_KEY_SECRET: secret });
    expect(report.configurationComplete).toBe(true);
    expect(report.liveBucketChecked).toBe(false);
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(JSON.stringify(report)).not.toContain("private-bucket");
    expect(assessOssKnowledgeReadiness({}).missing).toHaveLength(4);
  });
});
