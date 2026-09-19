import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkflowEvidence } from "@/components/app/workflow-evidence";
import { conversationMessages } from "@/lib/agent/messages";

describe("workflow evidence UI", () => {
  it("keeps terminal reports on refresh without exposing markup as HTML", () => {
    const report = "# Evidence\n<script>bad()</script>";
    const event = { eventId: "1", sequence: 1, type: "task.completed", data: { workflowReport: report }, timestamp: "now" };
    expect(conversationMessages([event])).toHaveLength(1);
    expect(conversationMessages([{ ...event, data: {} }])).toHaveLength(0);
    const { container } = render(<WorkflowEvidence data={event.data} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("pre")?.textContent).toBe(report);
  });
  it("downloads only the report as a local markdown file", () => {
    const create = vi.fn(() => "blob:report");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
    vi.useFakeTimers();
    try {
      render(<WorkflowEvidence data={{ workflowReport: "evidence" }} />);
      fireEvent.click(screen.getByText("下载报告"));
      expect(create).toHaveBeenCalledWith(expect.any(Blob));
      expect(click).toHaveBeenCalledOnce();
      expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe("cloud-workflow-report.md");
      vi.runAllTimers();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:report");
    } finally { click.mockRestore(); vi.unstubAllGlobals(); vi.useRealTimers(); }
  });
});
