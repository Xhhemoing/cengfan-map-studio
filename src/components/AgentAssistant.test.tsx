import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AgentAssistant } from "./AgentAssistant";
import { createProjectDocument } from "../lib/project-document";

function renderAssistant(project: ReturnType<typeof createProjectDocument>, onCommit: () => void) {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(<AgentAssistant project={project} assets={[]} onCommit={onCommit} />));
  return { container, root };
}

function apiResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AgentAssistant", () => {
  it("defaults to conservative mode", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const { container, root } = renderAssistant(project, () => undefined);
    expect((container.querySelector('input[type="radio"]') as HTMLInputElement).checked).toBe(true);
    root.unmount();
  });

  it("does not commit before confirmation", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(apiResponse({ kind: "tool-call", calls: [{ id: "c1", name: "update_map", arguments: { patch: { width: 640 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(apiResponse({ kind: "finish", summary: "完成" })));
    const commit = vi.fn();
    const { container, root } = renderAssistant(project, commit);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    const start = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("开始规划"))!;
    const textareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    flushSync(() => {
      textareaSetter?.call(textarea, "地图小一点");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    });
    flushSync(() => start.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await vi.waitFor(() => expect(container.textContent).toContain("update_map"));
    expect(commit).not.toHaveBeenCalled();
    const confirm = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("确认应用"))!;
    flushSync(() => confirm.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(commit).toHaveBeenCalledTimes(1);
    root.unmount();
  });
});
