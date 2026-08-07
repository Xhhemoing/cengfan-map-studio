import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AgentAssistant, AssistantConversationProvider } from "./AgentAssistant";
import { AgentSession } from "../lib/agent-session";
import { createProjectDocument } from "../lib/project-document";
import { loadAssistantConversationState } from "../lib/agent-conversation-store";
import type { ProjectTransaction } from "../lib/project-document";

function renderAssistant(project: ReturnType<typeof createProjectDocument>, onCommit = vi.fn(), clearStorage = true, strict = false) {
  if (clearStorage) window.localStorage.clear();
  const container = document.createElement("div");
  const root = createRoot(container);
  const assistant = <AssistantConversationProvider><AgentAssistant project={project} assets={[]} onCommit={onCommit} /></AssistantConversationProvider>;
  flushSync(() => root.render(strict ? <StrictMode>{assistant}</StrictMode> : assistant));
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
  if (!button) throw new Error(`button missing: ${text}; text=${container.textContent}`);
  flushSync(() => button.click());
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AgentAssistant", () => {
  it("renders the active AI workspace inline when docked", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <AssistantConversationProvider>
        <AgentAssistant presentation="docked" project={project} assets={[]} onCommit={vi.fn()} />
      </AssistantConversationProvider>,
    ));

    expect(container.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
    expect(container.querySelector('.agent-assistant-launcher')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await vi.waitFor(() => expect(container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    root.unmount();
  });

  it("initializes the docked workspace under StrictMode without render-phase updates", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <StrictMode>
        <AssistantConversationProvider>
          <AgentAssistant presentation="docked" project={project} assets={[]} onCommit={vi.fn()} />
        </AssistantConversationProvider>
      </StrictMode>,
    ));

    await vi.waitFor(() => expect(container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    expect(consoleError.mock.calls.some(([message]) => String(message).includes("Cannot update a component"))).toBe(false);
    root.unmount();
  });

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

  it("keeps hydration and fetch behavior alive under StrictMode", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", summary: "StrictMode 完成" })));
    const { container, root } = renderAssistant(project, vi.fn(), true, true);
    openAssistant(container);
    setMessage(container, "StrictMode 运行");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("StrictMode 完成"));
    expect(fetch).toHaveBeenCalledTimes(1);
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

  it("persists only minimized replay data while preserving matching-project manual apply after reload", async () => {
    const project = createProjectDocument({
      students: [{ id: "student-privacy", name: "隐私学生姓名", university: "大学", city: "城市", province: "省份", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    project.assetElements = [{ ...project.assetElements[0]!, id: "private-asset", src: "data:image/png;base64,private-asset-data", label: "私有素材" }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", taskId: "secret-task-id", budgetReceipt: "secret-budget-receipt", calls: [{ id: "private-step", name: "update_cards", arguments: { patch: { showCount: false } } }], assistantMessage: { role: "assistant", content: "可手动应用的方案", tool_calls: [{ id: "private-call", type: "function", function: { name: "update_cards", arguments: "{}" } }] }, budget: { usedTokens: 12, maxTokens: 60000, rounds: 1, maxRounds: 20 } }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "secret-task-id", budgetReceipt: "secret-budget-receipt", summary: "可恢复方案" }));
    vi.stubGlobal("fetch", fetchMock);
    const first = renderAssistant(project);
    openAssistant(first.container);
    setMessage(first.container, "保存隐私方案");
    clickText(first.container, "开始规划");
    await vi.waitFor(() => expect(first.container.textContent).toContain("可恢复方案"));
    await vi.waitFor(() => expect(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")).toContain("private-step"));
    const serialized = window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!;
    expect(serialized).not.toContain("隐私学生姓名");
    expect(serialized).not.toContain("private-asset-data");
    expect(serialized).not.toContain("secret-task-id");
    expect(serialized).not.toContain("secret-budget-receipt");
    expect(serialized).not.toContain('"tool_calls"');
    await vi.waitFor(() => {
      const persisted = JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!);
      expect(persisted.conversations[0]).toMatchObject({ status: "completed", selectedStepIds: ["private-step"] });
    });
    const loadedBeforeRemount = loadAssistantConversationState(window.localStorage, project);
    expect(loadedBeforeRemount?.conversations[0]).toMatchObject({ status: "completed", selectedStepIds: ["private-step"] });
    first.root.unmount();

    const onCommit = vi.fn();
    const restored = renderAssistant(project, onCommit, false);
    await vi.waitFor(() => expect(restored.container.querySelector('.agent-assistant-launcher')).not.toBeNull());
    openAssistant(restored.container);
    clickText(restored.container, "AI 对话");
    await vi.waitFor(() => expect(restored.container.querySelector('[aria-label="确认应用"]')).not.toBeNull(), { timeout: 2_000 });
    clickText(restored.container, "确认应用");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0].apply(project).cards.showCount).toBe(false);
    restored.root.unmount();
  });

  it("hydrates a saved proposal after remount without auto-committing it", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "saved-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "可恢复" })));
    const first = renderAssistant(project);
    openAssistant(first.container);
    setMessage(first.container, "保存这个提案");
    clickText(first.container, "开始规划");
    await vi.waitFor(() => expect(first.container.textContent).toContain("可恢复"));
    await vi.waitFor(() => {
      const persisted = JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1") ?? "null");
      expect(persisted?.conversations?.[0]?.status).toBe("completed");
    });
    first.root.unmount();

    const onCommit = vi.fn();
    const restored = renderAssistant(project, onCommit, false);
    const saved = window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1");
    expect(saved).toContain("saved-step");
    expect(JSON.parse(saved!).conversations[0].status).toBe("completed");
    expect(JSON.parse(saved!).conversations[0].steps).toHaveLength(1);
    await vi.waitFor(() => expect(restored.container.querySelector('.agent-assistant-launcher')).not.toBeNull());
    openAssistant(restored.container);
    expect(restored.container.textContent).toContain("AI 对话");
    expect(onCommit).not.toHaveBeenCalled();
    restored.root.unmount();
  });

  it("discards a late response after a same-provider project change", async () => {
    const original = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const changed = { ...original, map: { ...original.map, width: original.map.width + 1 } };
    let release!: (value: ReturnType<typeof response>) => void;
    const fetchMock = vi.fn(() => new Promise<ReturnType<typeof response>>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<AssistantConversationProvider><AgentAssistant project={original} assets={[]} onCommit={onCommit} onPreview={onPreview} /></AssistantConversationProvider>));
    openAssistant(container);
    setMessage(container, "旧项目请求");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    flushSync(() => root.render(<AssistantConversationProvider><AgentAssistant project={changed} assets={[]} onCommit={onCommit} onPreview={onPreview} /></AssistantConversationProvider>));
    release(response({ kind: "tool-call", calls: [{ id: "late-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: "过期模型文本" } }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(0);
    expect(container.textContent).not.toContain("过期模型文本");
    expect(onPreview).not.toHaveBeenCalledWith(expect.objectContaining({ map: expect.objectContaining({ scale: 0.9 }) }));
    expect(onCommit).not.toHaveBeenCalled();
    root.unmount();
  });

  it("debounced persistence does not write after unmount", async () => {
    vi.useFakeTimers();
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const storage = window.localStorage;
    const setItem = vi.spyOn(storage, "setItem");
    const rendered = renderAssistant(project);
    openAssistant(rendered.container);
    setMessage(rendered.container, "待取消持久化");
    rendered.root.unmount();
    setItem.mockClear();
    await vi.runOnlyPendingTimersAsync();
    expect(setItem).not.toHaveBeenCalledWith("cengfan-map-studio:ai-conversations:v1", expect.any(String));
  });

  it("rebases executable state when the project changes under the same provider", async () => {
    const original = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const changed = { ...original, cards: { ...original.cards, positions: { 北京市: { x: 18, y: 24 } } } };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "stale-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: "旧文本历史" } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "已保存" })));
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<AssistantConversationProvider><AgentAssistant project={original} assets={[]} onCommit={vi.fn()} /></AssistantConversationProvider>));
    openAssistant(container);
    setMessage(container, "保存提案");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("已保存"));
    expect(container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(1);

    flushSync(() => root.render(<AssistantConversationProvider><AgentAssistant project={changed} assets={[]} onCommit={vi.fn()} /></AssistantConversationProvider>));

    await vi.waitFor(() => expect(container.textContent).toContain("保存提案"));
    await vi.waitFor(() => expect(container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(0));
    expect(container.querySelector('[aria-label="确认应用"]')).toBeNull();
    expect(container.textContent).not.toContain("继续对话");
    root.unmount();
  });

  it("clears visible and persisted proposals when a snapshot export fails", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "failed-save", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const exportSnapshot = vi.spyOn(AgentSession.prototype, "exportSnapshot").mockImplementation(() => { throw new Error("snapshot too large"); });
    const rendered = renderAssistant(project);
    openAssistant(rendered.container);
    setMessage(rendered.container, "不要留下提案");
    clickText(rendered.container, "开始规划");
    await vi.waitFor(() => expect(rendered.container.textContent).toContain("会话无法保存"));
    expect(rendered.container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(0);
    expect(rendered.container.querySelector('[aria-label="确认应用"]')).toBeNull();
    const saved = JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!);
    expect(saved.conversations[0]).toMatchObject({ status: "failed", steps: [], selectedStepIds: [], snapshot: null });
    exportSnapshot.mockRestore();
    rendered.root.unmount();
  });

  it("clears persisted executable state when the project changes before a provider remount", async () => {
    const original = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const changed = { ...original, map: { ...original.map, width: original.map.width + 1 } };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "stale-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "已保存" })));
    const first = renderAssistant(original);
    openAssistant(first.container);
    setMessage(first.container, "保存提案");
    clickText(first.container, "开始规划");
    await vi.waitFor(() => expect(first.container.textContent).toContain("已保存"));

    first.root.unmount();
    const refreshed = renderAssistant(changed, vi.fn(), false);
    await vi.waitFor(() => expect(JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!).conversations[0].steps).toEqual([]));
    refreshed.root.unmount();

    const restored = renderAssistant(changed, vi.fn(), false);
    await vi.waitFor(() => expect(restored.container.querySelector('.agent-assistant-launcher')).not.toBeNull());
    openAssistant(restored.container);
    expect(restored.container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(0);
    const saved = JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!).conversations[0];
    expect(saved.projectDigest).not.toBeUndefined();
    expect(saved.snapshot.steps).toEqual([]);
    expect(saved.snapshot.taskId).toBeUndefined();
    expect(saved.snapshot.budgetReceipt).toBeUndefined();
    restored.root.unmount();
  });

  it("does not auto-commit a low-risk continuation of a restored smart conversation", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "first", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "第一轮完成" }))
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "second", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 2 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "继续完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const first = renderAssistant(project);
    openAssistant(first.container);
    setMessage(first.container, "第一轮");
    clickText(first.container, "开始规划");
    await vi.waitFor(() => expect(first.container.textContent).toContain("第一轮完成"));
    await vi.waitFor(() => {
      const persisted = JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1") ?? "null");
      expect(persisted?.conversations?.[0]?.status).toBe("completed");
    });
    first.root.unmount();

    const saved = JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!);
    saved.mode = "smart";
    saved.conversations[0].mode = "smart";
    window.localStorage.setItem("cengfan-map-studio:ai-conversations:v1", JSON.stringify(saved));
    const onCommit = vi.fn();
    const restored = renderAssistant(project, onCommit, false);
    await vi.waitFor(() => expect(restored.container.querySelector('.agent-assistant-launcher')).not.toBeNull());
    openAssistant(restored.container);
    clickText(restored.container, "AI 对话");
    setMessage(restored.container, "继续调整");    clickText(restored.container, "继续对话");
    await vi.waitFor(() => expect(restored.container.textContent).toContain("继续完成"));
    expect(onCommit).not.toHaveBeenCalled();
    expect(restored.container.querySelector('[aria-label="确认应用"]')).not.toBeNull();
    restored.root.unmount();
  });

  it("does not preview a conversation selected with a stale project digest", async () => {
    const original = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const changed = { ...original, map: { ...original.map, width: original.map.width + 1 } };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "stale-selection", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "待选方案" })));
    const onPreview = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<AssistantConversationProvider><AgentAssistant project={original} assets={[]} onCommit={vi.fn()} onPreview={onPreview} /></AssistantConversationProvider>));
    openAssistant(container);
    setMessage(container, "保存待选方案");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("待选方案"));
    flushSync(() => root.render(<AssistantConversationProvider><AgentAssistant project={changed} assets={[]} onCommit={vi.fn()} onPreview={onPreview} /></AssistantConversationProvider>));
    const historyButtons = container.querySelectorAll<HTMLButtonElement>(".agent-assistant-history button");
    historyButtons[0]?.click();
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(onPreview).not.toHaveBeenCalledWith(expect.objectContaining({ map: expect.objectContaining({ scale: 0.9 }) }));
    root.unmount();
  });

  it("keeps only textual history for continuation after a digest mismatch", async () => {
    const original = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const changed = { ...original, map: { ...original.map, width: original.map.width + 1 } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", taskId: "old-task", budgetReceipt: "old-receipt", calls: [{ id: "old-call", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: "旧方案说明", tool_calls: [{ id: "old-call", type: "function", function: { name: "update_map", arguments: "{}" } }] }, budget: { usedTokens: 12, maxTokens: 60000, rounds: 1, maxRounds: 20 } }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "old-task", budgetReceipt: "old-receipt", summary: "第一轮完成", budget: { usedTokens: 12, maxTokens: 60000, rounds: 1, maxRounds: 20 } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "继续完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const first = renderAssistant(original);
    openAssistant(first.container);
    setMessage(first.container, "保留这段上下文");
    clickText(first.container, "开始规划");
    await vi.waitFor(() => expect(first.container.textContent).toContain("第一轮完成"));
    first.root.unmount();

    const restored = renderAssistant(changed, vi.fn(), false);
    await vi.waitFor(() => expect(restored.container.querySelector('.agent-assistant-launcher')).not.toBeNull());
    openAssistant(restored.container);
    clickText(restored.container, "AI 对话");
    setMessage(restored.container, "继续使用上下文");    clickText(restored.container, "继续对话");
    await vi.waitFor(() => expect(restored.container.textContent).toContain("继续完成"));
    const continuationBody = JSON.parse(String((fetchMock.mock.calls[2] as unknown[])[1] && ((fetchMock.mock.calls[2] as unknown[])[1] as RequestInit).body));
    expect(continuationBody.messages.some((entry: { content?: string }) => entry.content === "保留这段上下文" || entry.content === "旧方案说明")).toBe(false);
    expect(continuationBody.messages.some((entry: { role?: string; tool_calls?: unknown[]; tool_call_id?: string }) => entry.role === "tool" || entry.tool_calls || entry.tool_call_id === "old-call")).toBe(false);
    expect(continuationBody.taskId).toBeUndefined();
    expect(continuationBody.budgetReceipt).toBeUndefined();
    expect(restored.container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(0);
    restored.root.unmount();
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

  it("keeps an applied conversation terminal when onCommit updates the project prop", async () => {
    let project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onCommit = vi.fn((transaction: ProjectTransaction) => {
      project = transaction.apply(project);
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "applied-project-update", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "已应用" })));
    const container = document.createElement("div");
    const root = createRoot(container);
    const render = () => flushSync(() => root.render(<AssistantConversationProvider><AgentAssistant project={project} assets={[]} onCommit={onCommit} /></AssistantConversationProvider>));
    render();
    openAssistant(container);
    setMessage(container, "应用后更新项目");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("已应用"));
    clickText(container, "确认应用");
    expect(onCommit).toHaveBeenCalledTimes(1);

    render();
    await vi.waitFor(() => expect(container.textContent).toContain("已应用"));
    expect(container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(0);
    expect(container.querySelector('[aria-label="确认应用"]')).toBeNull();
    expect(container.querySelector('button[aria-label="确认应用"]')).toBeNull();
    const runButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("开始规划") || button.textContent?.includes("继续对话"));
    expect(runButton).toBeDefined();
    expect(runButton?.disabled).toBe(true);
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
