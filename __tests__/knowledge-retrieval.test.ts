import { describe, expect, it } from "vitest";
import { retrieveKnowledge, type RetrievalSource } from "@/lib/agent/knowledge-retrieval";

const source = (content: string, scope: RetrievalSource["scope"] = "platform"): RetrievalSource => ({
  scope, id: crypto.randomUUID(), ...(scope === "project" ? { projectId: crypto.randomUUID() } : {}),
  version: { title: "ESP32-S3 温湿度传感器", source: "经审核的开发记录.md", kind: "sdk", content,
    version: 2, sha256: "a".repeat(64), reviewedBy: crypto.randomUUID(), reviewedAt: new Date().toISOString() },
});
describe("reviewed knowledge retrieval", () => {
  it("matches Chinese requirements, limits excerpts and keeps verifiable provenance", () => {
    const result = retrieveKnowledge("请设计 ESP32-S3 温湿度采集节点", [source("ESP32-S3 使用 I2C 温湿度传感器。".repeat(100))]);
    expect(result.status).toBe("matched");
    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({ version: 2, sha256: "a".repeat(64), scope: "platform" });
    expect(result.references[0].excerpt.length).toBeLessThanOrEqual(240);
    expect(result.context.length).toBeLessThan(1300);
  });
  it("states no match instead of inventing a citation", () => {
    expect(retrieveKnowledge("LoRa 无线通信", [source("普通 LED 闪烁示例")])).toMatchObject({ status: "no-match", references: [], context: "" });
  });
  it("caps the reference and prompt budget even with many matching documents", () => {
    const result = retrieveKnowledge("ESP32-S3 温湿度", Array.from({ length: 20 }, () => source("ESP32-S3 温湿度".repeat(200))));
    expect(result.references.length).toBeLessThanOrEqual(5);
    expect(result.context.length).toBeLessThanOrEqual(3_200);
  });
  it("does not cite a different imported board when the requested board is explicit", () => {
    const rv1106 = source("RV1106 摄像头参考");
    rv1106.version.source = "RV1106/docs/camera-yolo.md#part-1";
    const rv1126b = source("RV1126B 摄像头参考");
    rv1126b.version.source = "RV1126B/docs/hardware-reference.md#part-1";
    const result = retrieveKnowledge("RV1106 摄像头方案", [rv1106, rv1126b]);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].source).toBe(rv1106.version.source);
  });
});
