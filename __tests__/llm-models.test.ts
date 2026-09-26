// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hideCredentialEcho, parseProviderModels } from "@/lib/server/llm-models";

describe("provider model discovery", () => {
  it("uses supported model IDs, friendly names and deduplicates", () => {
    expect(parseProviderModels(JSON.stringify({ object: "list", data: [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "deepseek-flash" },
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "bad id", name: "Invalid" },
    ] }))).toEqual([
      { id: "deepseek-flash", name: "deepseek-flash" },
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
    ]);
  });
  it("rejects non-JSON and nonstandard list formats without returning provider bodies", () => {
    expect(() => parseProviderModels("secret not-json")).toThrow("有效 JSON");
    expect(() => parseProviderModels(JSON.stringify({ error: "secret" }))).toThrow("GET /models");
  });
  it("drops model metadata that echoes a stored credential", () => {
    expect(hideCredentialEcho([
      { id: "secret-123", name: "Leak" }, { id: "valid-model", name: "valid-model" },
      { id: "other-model", name: "secret-123" },
    ], "secret-123")).toEqual([{ id: "valid-model", name: "valid-model" }]);
  });
});
