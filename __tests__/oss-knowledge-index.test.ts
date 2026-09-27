// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { retrieveKnowledge } from "@/lib/agent/knowledge-retrieval";
import { designMessages } from "@/lib/agent/design-prompt";
import { closeIndexedKnowledge, searchIndexedKnowledge } from "@/lib/server/oss-knowledge-index";

let directory: string;
let indexPath: string;
let boardAssociations: { indexSha256: string; manifestSha256: string; boards: Record<string, { sourceSha256: string; citationPath: string; category: string }[]> };
const sourceSha = "a".repeat(64);
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "vibehard-oss-index-test-"));
  indexPath = join(directory, "index.sqlite");
  const db = new DatabaseSync(indexPath);
  db.exec('CREATE TABLE chunks (id TEXT PRIMARY KEY, source_sha TEXT, source_path TEXT, category TEXT, page INTEGER, part INTEGER, method TEXT, text TEXT)');
  db.exec('CREATE VIRTUAL TABLE chunks_fts USING fts5(text, source_path, content="chunks", content_rowid="rowid", tokenize="trigram")');
  const rows = [
    ["esp-page-3", sourceSha, "ESP32-S3资料包/显示屏/触摸屏手册.pdf", "manuals", 3, 1, "text", "ESP32-S3 触摸屏 I2C 地址为 0x38，仍需核对实际模组版本。"],
    ["esp-page-4", sourceSha, "ESP32-S3资料包/显示屏/触摸屏手册.pdf", "manuals", 4, 1, "text", "ESP32-S3 触摸屏 使用 I2C 上拉电阻。"],
    ["esp-page-5", sourceSha, "ESP32-S3资料包/显示屏/触摸屏手册.pdf", "manuals", 5, 1, "text", "ESP32-S3 触摸屏 另一个页面。"],
    ["esp-other", "b".repeat(64), "ESP32-S3资料包/通信/模组.pdf", "manuals", 2, 1, "text", "ESP32-S3 SIM7670 通信模组。"],
    ["lcd-base", "c".repeat(64), "LCD屏/ESP32-S3-LCD-1.9/1. 硬件资料/ESP32-S3-LCD-1.9-Schematic.pdf", "schematics", 1, 1, "ocr", "ESP32-S3-LCD-1.9 原理图及引脚"],
    ["lcd-wrong-touch", "d".repeat(64), "LCD屏/ESP32-S3-LCD-1.9/1. 硬件资料/ESP32-S3-Touch-LCD-1.9-Schematic.pdf", "schematics", 1, 1, "ocr", "触摸版原理图"],
    ["lcd-other-variant", "e".repeat(64), "LCD屏/ESP32-S3-LCD-2.8C/1. 硬件资料/ESP32-S3-Touch-LCD-2.8C_schematic_diagram.pdf", "schematics", 1, 1, "ocr", "触摸版原理图"],
    ["lcd-touch", "f".repeat(64), "LCD触摸屏/ESP32-S3-Touch-LCD-2/1. 硬件资料/ESP32-S3-Touch-LCD-2.pdf", "schematics", 1, 1, "ocr", "ESP32-S3-Touch-LCD-2 原理图及引脚"],
    ["lcd-aliased-manual", "1".repeat(64), "LCD屏/ESP32-S3-LCD-2.8B/2. 技术手册/部件.pdf", "manuals", 1, 1, "text", "ESP32-S3 通用器件手册"],
  ] as const;
  const insert = db.prepare("INSERT INTO chunks VALUES (?,?,?,?,?,?,?,?)");
  const fts = db.prepare("INSERT INTO chunks_fts(rowid,text,source_path) VALUES (last_insert_rowid(),?,?)");
  for (const row of rows) { insert.run(...row); fts.run(row[7], row[2]); }
  db.close();
  const indexSha256 = createHash("sha256").update(readFileSync(indexPath)).digest("hex");
  writeFileSync(`${indexPath}.meta.json`, JSON.stringify({ batchId: "6cf96eea-af45-4e7d-96c0-c99afbe8c192",
    manifestSha256: "3cc6440aa480c470183f49ed61b296d6168e64080241c5672a9538727011c7a1",
    sqliteSha256: indexSha256, indexedChunks: rows.length }));
  boardAssociations = { indexSha256, manifestSha256: "3cc6440aa480c470183f49ed61b296d6168e64080241c5672a9538727011c7a1", boards: {
    "other": [
      { sourceSha256: sourceSha, citationPath: "ESP32-S3资料包/显示屏/触摸屏手册.pdf", category: "manuals" },
      { sourceSha256: "b".repeat(64), citationPath: "ESP32-S3资料包/通信/模组.pdf", category: "manuals" },
    ],
    "ESP32-S3-LCD-1.9": [{ sourceSha256: "c".repeat(64), citationPath: "LCD屏/ESP32-S3-LCD-1.9/1. 硬件资料/ESP32-S3-LCD-1.9-Schematic.pdf", category: "schematics" }],
    "ESP32-S3-LCD-2.8C": [{ sourceSha256: "1".repeat(64), citationPath: "LCD屏/ESP32-S3-LCD-2.8C/2. 技术手册/部件.pdf", category: "manuals" }],
    "ESP32-S3-Touch-LCD-2": [{ sourceSha256: "f".repeat(64), citationPath: "LCD触摸屏/ESP32-S3-Touch-LCD-2/1. 硬件资料/ESP32-S3-Touch-LCD-2.pdf", category: "schematics" }],
    "ESP32-S3-Touch-LCD-2.8C": [{ sourceSha256: "e".repeat(64), citationPath: "LCD触摸屏/ESP32-S3-Touch-LCD-2.8C/1. 硬件资料/ESP32-S3-Touch-LCD-2.8C_schematic_diagram.pdf", category: "schematics" }],
  } };
});
afterAll(() => { closeIndexedKnowledge(); rmSync(directory, { recursive: true, force: true }); });

describe("restricted private FTS retrieval", () => {
  it("returns bounded page/part and source-hash citations for the design prompt", async () => {
    const hits = await searchIndexedKnowledge("ESP32-S3 触摸屏 I2C", indexPath, boardAssociations);
    expect(hits.length).toBeLessThanOrEqual(3);
    expect(hits.filter(hit => hit.version.sha256 === sourceSha)).toHaveLength(2);
    const retrieval = retrieveKnowledge("ESP32-S3 触摸屏 I2C", hits);
    expect(retrieval.method).toBe("keyword-chunks-fts5-v1");
    expect(retrieval.references[0]).toMatchObject({ scope: "platform", reviewStatus: "auto-indexed", sha256: sourceSha });
    expect(retrieval.references[0].source).toMatch(/#page=\d+&part=1$/);
    expect(retrieval.context).toContain("未人工复核");
    expect(designMessages("ESP32-S3 触摸屏 I2C", retrieval).prompt).toContain("文件 SHA256");
  });
  it("rejects explicit other-board searches and short/no-match terms", async () => {
    expect(await searchIndexedKnowledge("RV1106 触摸屏 I2C", indexPath)).toEqual([]);
    expect(await searchIndexedKnowledge("LED", indexPath, boardAssociations)).toEqual([]);
  });
  it("prioritizes a named board's own source path and excludes a verified wrong-variant schematic", async () => {
    const hits = await searchIndexedKnowledge("ESP32-S3-LCD-1.9 原理图", indexPath, boardAssociations);
    expect(hits.map(hit => hit.version.sha256)).toContain("c".repeat(64));
    expect(hits.map(hit => hit.version.sha256)).not.toContain("d".repeat(64));
    expect(hits.every(hit => hit.version.source.includes("/ESP32-S3-LCD-1.9/"))).toBe(true);
    expect(retrieveKnowledge("ESP32-S3-LCD-1.9 原理图", hits).references[0].source).toContain("ESP32-S3-LCD-1.9-Schematic.pdf#page=1&part=1");
  });
  it("uses a verified alias of deduplicated material without citing a wrong sibling schematic", async () => {
    expect(await searchIndexedKnowledge("ESP32-S3-LCD-2.8C 原理图", indexPath, boardAssociations)).toEqual([]);
    const base = await searchIndexedKnowledge("ESP32-S3-LCD-2.8C 开发方案", indexPath, boardAssociations);
    expect(base.map(hit => hit.version.sha256)).toEqual(["1".repeat(64)]);
    expect(base[0].version.source).toContain("/ESP32-S3-LCD-2.8C/");
    expect((await searchIndexedKnowledge("ESP32-S3-LCD-2.8C 引脚", indexPath, boardAssociations)).map(hit => hit.version.sha256)).toEqual(["1".repeat(64)]);
    const hits = await searchIndexedKnowledge("ESP32-S3-Touch-LCD-2 原理图", indexPath, boardAssociations);
    expect(hits.map(hit => hit.version.sha256)).toEqual(["f".repeat(64)]);
    const misfiled = await searchIndexedKnowledge("ESP32-S3-Touch-LCD-2.8C 原理图", indexPath, boardAssociations);
    expect(misfiled.map(hit => hit.version.sha256)).toEqual(["e".repeat(64)]);
    expect(misfiled[0].version.source).toContain("/ESP32-S3-Touch-LCD-2.8C/");
  });
  it("fails closed when the board association snapshot belongs to a different index", async () => {
    await expect(searchIndexedKnowledge("ESP32-S3-LCD-1.9 原理图", indexPath,
      { ...boardAssociations, indexSha256: "0".repeat(64) })).rejects.toThrow("do not match");
  });
  it("does not return an unassociated wrong-variant source through a generic query", async () => {
    const hits = await searchIndexedKnowledge("触摸版原理图", indexPath, boardAssociations);
    expect(hits.map(hit => hit.version.sha256)).not.toContain("d".repeat(64));
    expect(hits.map(hit => hit.version.sha256)).toContain("e".repeat(64));
  });
  it("detects a swapped index before returning any result", async () => {
    closeIndexedKnowledge();
    const metadata = `${indexPath}.meta.json`;
    const original = readFileSync(metadata, "utf8");
    try {
      writeFileSync(metadata, original.replace(/"sqliteSha256":"[a-f0-9]{64}"/, `"sqliteSha256":"${"f".repeat(64)}"`));
      await expect(searchIndexedKnowledge("ESP32-S3 触摸屏", indexPath, boardAssociations)).rejects.toThrow("checksum mismatch");
    } finally { writeFileSync(metadata, original); }
  });
});
