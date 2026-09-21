import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import KnowledgeReviewPage from "@/app/app/knowledge-review/page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("platform knowledge review queue", () => {
  it("links to individual candidates, paginates, and clears privileged results after access is revoked", async () => {
    let allowed = true;
    const fetcher = vi.fn(async (url: string) => ({ ok: allowed, json: async () => allowed ? { projects: [{ id: "project", name: "Board", documents: [{ id: "candidate", title: url.includes("after=") ? "Next candidate" : "Pins", pending: true, rejected: false, publishedVersion: null }, { id: "formal", title: "Formal", pending: false, rejected: false, publishedVersion: 1 }] }], nextCursor: url.includes("after=") ? null : "cursor" } : { error: "仅管理员和开发者可以审核知识库" } }));
    vi.stubGlobal("fetch", fetcher);
    render(<KnowledgeReviewPage />);
    expect(await screen.findByRole("link", { name: "查看资料与审核" })).toHaveAttribute("href", "/app/agent/project/knowledge?document=candidate");
    expect(screen.queryByText("Formal")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText("Formal")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByText("Next candidate");
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain("?after=cursor");
    allowed = false;
    fireEvent.click(screen.getByRole("button", { name: "刷新并返回首页" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("link", { name: "查看资料与审核" })).toBeNull();
  });
  it("shows permission denial without review controls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "仅管理员和开发者可以审核知识库" }) })));
    render(<KnowledgeReviewPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("仅管理员和开发者");
    expect(screen.queryByRole("link", { name: "查看资料与审核" })).toBeNull();
  });
});
