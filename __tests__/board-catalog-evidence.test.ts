import { describe, expect, it } from "vitest";
import { verifiedBoardCatalog } from "@/lib/server/verified-board-catalog";
import boards from "@/lib/server/data/board-catalog.json";
import evidence from "@/lib/server/data/board-catalog-evidence.json";
import specifications from "@/lib/server/data/board-spec-evidence.json";

const snapshot = evidence as Parameters<typeof verifiedBoardCatalog>[1];
const specs = specifications as Parameters<typeof verifiedBoardCatalog>[2];

describe("private OSS board catalog evidence", () => {
  it("has a sealed source/index batch and no storage credentials or object keys", () => {
    expect(snapshot.schema).toBe("vibehard-board-evidence/v1");
    expect(snapshot.counts).toMatchObject({ sourceBoards: 63, sourceReferences: 1076,
      withoutPath: 268, rawReferences: 808, indexed: 573, partlyIndexed: 88,
      rawOnly: 106, processedQuarantined: 35, invalidRaw: 6,
      visibleBoards: 61, visibleReferences: 767 });
    expect(JSON.stringify(snapshot)).not.toMatch(/knowledge\/raw\/v1|OSS_ACCESS|accessKey|secret/i);
  });

  it("removes unsupported and quarantined directory claims without inventing downloads", () => {
    const verified = verifiedBoardCatalog(boards, snapshot, specs);
    expect(verified).toHaveLength(61);
    const resources = verified.flatMap(board => board.resources);
    expect(resources).toHaveLength(762);
    expect(resources.every(resource => resource.path && resource.evidence &&
      /^[a-f0-9]{64}$/.test(resource.evidence.sha256))).toBe(true);
    expect(verified.some(board => board.name === "ESP32-S3-Touch-LCD-3.5B1")).toBe(false);
    expect(verified.some(board => board.name === "ESP32-S3-ePaper-13.3E67")).toBe(false);
    expect(verified.find(board => board.name === "ESP32-S3-LCD-1.9")?.features).not.toContain("触摸屏");
    expect(verified.find(board => board.name === "ESP32-S3-LCD-2.8")?.features).toContain("触摸屏");
    expect(verified.find(board => board.name === "ESP32-S3-AMOLED-1.91")?.category).toBe("AMOLED屏");
    expect(verified.find(board => board.name === "ESP32-S3-Touch-LCD-1.85C")?.features).not.toContain("六轴 IMU");
    expect(verified.find(board => board.name === "ESP32-S3-LCD-1.9")?.resources.some(resource => resource.path.includes("Touch-LCD-1.9-Schematic"))).toBe(false);
    expect(verified.every(board => board.specSourceUrl?.startsWith("https://docs.waveshare.com/"))).toBe(true);
  });

  it("fails closed when the catalog or evidence snapshot drifts", () => {
    const changed = structuredClone(snapshot);
    changed.counts.visibleReferences++;
    expect(() => verifiedBoardCatalog(boards, changed, specs)).toThrow("do not match");
    expect(() => verifiedBoardCatalog(boards.slice(1), snapshot, specs)).toThrow("do not match");
    const badSpecs = structuredClone(specs);
    badSpecs.boards[0].excludedResources.push("not/a/real/file.pdf");
    expect(() => verifiedBoardCatalog(boards, snapshot, badSpecs)).toThrow("specification is invalid");
  });
});
