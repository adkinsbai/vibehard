import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesignResult } from "@/components/app/design-result";
import type { DesignResult as Result } from "@/lib/agent/llm";

const basic: Result = { architecture: ["I2C"], bom: [{ item: "传感器", model: "SHT40", qty: 1, estCost: "¥10（估算）" }], interfaces: ["I2C"], risks: [{ level: "低", desc: "核对地址" }] };
describe("design retrieval provenance", () => {
  it("clearly distinguishes no matching reviewed data from an old untracked result", () => {
    const { rerender } = render(<DesignResult result={{ ...basic, retrieval: { status: "no-match", method: "keyword-chunks-v1", references: [] } }} />);
    expect(screen.getByText(/未检索到匹配的可用资料/)).toBeVisible();
    rerender(<DesignResult result={basic} />);
    expect(screen.getByText(/历史方案没有记录检索来源/)).toBeVisible();
  });
  it("shows the server-recorded source, version and reviewed scope", () => {
    render(<DesignResult result={{ ...basic, retrieval: { status: "matched", method: "keyword-chunks-v1", references: [{ scope: "platform", id: crypto.randomUUID(), title: "SHT40 开发记录", source: "notes.md", version: 3, sha256: "a".repeat(64), excerpt: "I2C 接口说明" }] } }} />);
    expect(screen.getByText(/SHT40 开发记录 · v3/)).toBeVisible();
    expect(screen.getByText('平台已发布')).toBeVisible();
    expect(screen.getByText(/I2C 接口说明/)).toBeVisible();
  });
  it("labels auto-indexed evidence without implying human review", () => {
    render(<DesignResult result={{ ...basic, retrieval: { status: "matched", method: "keyword-chunks-fts5-v1", references: [
      { scope: "platform", reviewStatus: "auto-indexed", id: crypto.randomUUID(), title: "ESP32-S3 手册", source: "ESP32-S3/manual.pdf#page=3&part=1",
        version: 1, sha256: "b".repeat(64), excerpt: "I2C 引脚需核对" },
    ] } }} />);
    expect(screen.getByText(/ESP32-S3 手册 · v1/)).toBeVisible();
    expect(screen.getByText('平台自动入库 · 未人工复核')).toBeVisible();
    expect(screen.queryByText('平台已发布')).not.toBeInTheDocument();
  });
});
