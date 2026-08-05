import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AgentAssistant, AssistantConversationProvider } from "./AgentAssistant";
import { createProjectDocument } from "../lib/project-document";

function renderAssistant(project: ReturnType<typeof createProjectDocument>, onCommit = vi.fn()) {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(<AssistantConversationProvider><AgentAssistant project={project} assets={[]} onCommit={onCommit} /></AssistantConversationProvider>));
  return { container, root, onCommit };
}

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function openAssistant(container: HTMLElement) {
  flushSync(() => container.querySelector<HTMLButtonElement>('.agent-assistant-launcher')?.click());
}

function setMessage(container: HTMLElement, value: string) {
  const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) throw new Error("assistant textarea missing");
  flushSync(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`button missing: ${text}`);
  flushSync(() => button.click());
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AgentAssistant", () => {
  it("starts minimized and opens a dialog from the launcher", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const { container, root } = renderAssistant(project);
    expect(container.querySelector('[aria-label="打开 AI 助手"]')).not.toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="AI 助手"]')).toBeNull();
    openAssistant(container);
    expect(container.querySelector('[role="dialog"][aria-label="AI 助手"]')).not.toBeNull();
    expect((container.querySelector('input[type="radio"]') as HTMLInputElement).checked).toBe(true);
    root.unmount();
  });

  it("renders a summary and selected write proposals, then applies only selected steps", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
        { id: "call-cards", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 4 } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "地图和卡片已完成" })));
    const { container, root, onCommit } = renderAssistant(project);
    openAssistant(container);
    setMessage(container, "调整地图和卡片");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("地图和卡片已完成"));
    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('.agent-assistant-window input[type="checkbox"]'));
    expect(checkboxes).toHaveLength(2);
    checkboxes[0]!.click();
    checkboxes[1]!.click();
    clickText(container, "确认应用");
    expect(onCommit).not.toHaveBeenCalled();
    checkboxes[0]!.click();
    checkboxes[1]!.click();
    clickText(container, "确认应用");
    expect(onCommit).toHaveBeenCalledTimes(1);
    root.unmount();
  });

  it("keeps completed conversations in history and shows one pending badge", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "call-one", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 2 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "第一段完成" }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "第二段完成" })));
    const { container, root } = renderAssistant(project);
    openAssistant(container);
    setMessage(container, "第一段");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第一段完成"));
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="新建对话"]')?.click());
    setMessage(container, "第二段");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第二段完成"));
    expect(container.querySelector('[aria-label="打开 AI 助手"]')).toBeNull();
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="最小化 AI 助手"]')?.click());
    expect(container.querySelector('button[aria-label="打开 AI 助手，1 个待应用对话"]')?.textContent).toContain("1");
    openAssistant(container);
    expect(container.querySelectorAll('.agent-assistant-history button')).toHaveLength(2);
    root.unmount();
  });

  it("continues a completed conversation and appends new proposals", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "first", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "第一轮完成" }))
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "second", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 2 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "继续完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = renderAssistant(project);
    openAssistant(container);
    setMessage(container, "第一轮");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第一轮完成"));
    setMessage(container, "继续调整");
    expect(container.textContent).toContain("继续对话");
    clickText(container, "继续对话");
    await vi.waitFor(() => expect(container.textContent).toContain("继续完成"));
    expect(container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(2);
    const continuationBody = JSON.parse(String((fetchMock.mock.calls[2] as unknown[])[1] && ((fetchMock.mock.calls[2] as unknown[])[1] as RequestInit).body));
    expect(continuationBody.messages.some((entry: { content?: string }) => entry.content === "第一轮")).toBe(true);
    root.unmount();
  });

  it("keeps an applied conversation terminal and hides proposal controls", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "first", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const { container, root, onCommit } = renderAssistant(project);
    openAssistant(container);
    setMessage(container, "应用地图");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("完成"));
    clickText(container, "确认应用");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(0);
    expect(container.querySelector('[aria-label="确认应用"]')).toBeNull();
    expect(container.textContent).toContain("已应用");
    root.unmount();
  });

  it("uses each conversation mode as the source of truth and reports pending count", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const pending = vi.fn();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "first", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 2 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const { container, root } = renderAssistant(project);
    root.render(<AssistantConversationProvider><AgentAssistant project={project} assets={[]} onCommit={vi.fn()} onPendingCountChange={pending} /></AssistantConversationProvider>);
    openAssistant(container);
    const smart = container.querySelector<HTMLInputElement>('input[type="radio"][value="smart"]');
    expect(smart).not.toBeNull();
    flushSync(() => smart?.click());
    setMessage(container, "智能修改");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("已应用"));
    expect(pending).toHaveBeenLastCalledWith(0);
    root.unmount();
  });

  it("keeps the launcher accessible name synchronized with pending conversations", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const { container, root } = renderAssistant(project);
    expect(container.querySelector('[aria-label="打开 AI 助手"]')).not.toBeNull();
    root.unmount();
  });

  it("keeps a dragged panel within finite coordinates", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
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
