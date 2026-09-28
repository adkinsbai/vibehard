import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DashboardGrid } from "@/components/app/dashboard-grid";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));

it("shows actual project state and exposes the independent RV1126B entry without claiming system flashing", () => {
  render(<DashboardGrid projects={[{ id: "project-1", name: "我的工程", updatedAt: "2026-09-28T00:00:00Z" }]}
    jobs={[{ id: "job-1", projectName: "我的工程", status: "completed", createdAt: "2026-09-28T00:00:00Z" }]} />);
  expect(screen.getByText("1 个")).toBeInTheDocument();
  expect(screen.getByText("已完成")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /设备开发 · RV1126B/ })).toHaveAttribute("href", "/app/taishan");
  expect(screen.getByRole("link", { name: /我的工程/ })).toHaveAttribute("href", "/app/agent?project=project-1");
  expect(screen.queryByText(/配额88%|本周使用12次/)).not.toBeInTheDocument();
});
