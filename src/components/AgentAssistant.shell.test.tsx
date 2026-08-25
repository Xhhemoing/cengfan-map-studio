import { describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { flushSync } from "react-dom";
import { AgentAssistant, AssistantConversationProvider } from "./AgentAssistant";
import {
  assistantProject,
  clickText,
  installAgentAssistantTestHarness,
  installFetch,
  installResponses,
  mountAssistant,
  openAssistant,
  renderAssistant,
  setMessage,
} from "./agent-assistant-test-harness";

installAgentAssistantTestHarness();

describe("AgentAssistant shell", () => {
  it("renders the active AI workspace inline when docked", async () => {
    const project = assistantProject();
    const { container, root } = mountAssistant(
      <AssistantConversationProvider>
        <AgentAssistant presentation="docked" project={project} assets={[]} onCommit={vi.fn()} />
      </AssistantConversationProvider>,
    );

    expect(container.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
    expect(container.querySelector('.agent-assistant-launcher')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    root.unmount();
  });

  it("initializes the docked workspace under StrictMode without render-phase updates", async () => {
    const project = assistantProject();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container, root } = mountAssistant(
      <StrictMode>
        <AssistantConversationProvider>
          <AgentAssistant presentation="docked" project={project} assets={[]} onCommit={vi.fn()} />
        </AssistantConversationProvider>
      </StrictMode>,
    );

    await vi.waitFor(() => expect(container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    expect(consoleError.mock.calls.some(([message]) => String(message).includes("Cannot update a component"))).toBe(false);
    root.unmount();
  });

  it("starts minimized and opens a dialog from the launcher", () => {
    const project = assistantProject();
    const { container, root } = renderAssistant(project);
    expect(container.querySelector('[aria-label="打开 AI 助手"]')).not.toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="AI 助手"]')).toBeNull();
    openAssistant(container);
    expect(container.querySelector('[role="dialog"][aria-label="AI 助手"]')).not.toBeNull();
    expect((container.querySelector('input[type="radio"]') as HTMLInputElement).checked).toBe(true);
    root.unmount();
  });

  it("keeps hydration and fetch behavior alive under StrictMode", async () => {
    const project = assistantProject();
    installResponses({ kind: "finish", summary: "StrictMode 完成" });
    const { container, root } = renderAssistant(project, vi.fn(), true, true);
    openAssistant(container);
    setMessage(container, "StrictMode 运行");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("StrictMode 完成"));
    expect(fetch).toHaveBeenCalledTimes(1);
    root.unmount();
  });

  it("keeps the launcher accessible name synchronized with pending conversations", () => {
    const project = assistantProject();
    const { container, root } = renderAssistant(project);
    expect(container.querySelector('[aria-label="打开 AI 助手"]')).not.toBeNull();
    root.unmount();
  });

  it("keeps a dragged panel within finite coordinates", () => {
    const project = assistantProject();
    const { container, root } = renderAssistant(project);
    openAssistant(container);
    const header = container.querySelector<HTMLElement>(".agent-assistant-header")!;
    const setPointerCapture = vi.fn();
    const hasPointerCapture = vi.fn(() => true);
    const releasePointerCapture = vi.fn();
    Object.assign(header, { setPointerCapture, hasPointerCapture, releasePointerCapture });
    const event = (type: string, values: Record<string, number>) => {
      const result = new Event(type, { bubbles: true });
      Object.assign(result, values);
      return result;
    };
    flushSync(() => {
      header.dispatchEvent(event("pointerdown", { pointerId: 1, clientX: 20, clientY: 20 }));
      header.dispatchEvent(event("pointermove", { pointerId: 1, clientX: 9999, clientY: 9999 }));
      header.dispatchEvent(event("pointerup", { pointerId: 1 }));
    });
    const panel = container.querySelector<HTMLElement>(".agent-assistant-window")!;
    expect(Number.isFinite(Number.parseFloat(panel.style.left))).toBe(true);
    expect(Number.isFinite(Number.parseFloat(panel.style.top))).toBe(true);
    expect(Number.parseFloat(panel.style.left)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(panel.style.top)).toBeGreaterThanOrEqual(0);
    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
    const beforeControlPointer = panel.style.left;
    flushSync(() => header.querySelector<HTMLButtonElement>('button[aria-label="重置窗口位置"]')?.click());
    expect(panel.style.left).not.toBe(beforeControlPointer);
    root.unmount();
  });

  it("cancels a running session on unmount without committing", async () => {
    const project = assistantProject();
    let signal: AbortSignal | undefined;
    installFetch(vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }));
    const { container, root, onCommit } = renderAssistant(project);
    openAssistant(container);
    setMessage(container, "取消这次任务");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("取消"));
    root.unmount();
    expect(signal?.aborted).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
