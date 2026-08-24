import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AgentAssistant, AssistantConversationProvider, useAssistantProjectSync } from "./AgentAssistant";
import { AgentSession } from "../lib/agent-session";
import { createProjectDocument } from "../lib/project-document";
import { loadAssistantConversationState } from "../lib/agent-conversation-store";
import type { ProjectDocument, ProjectTransaction } from "../lib/project-document";

// StudioApp 里那层登记器的最小替身：只把当前工程报给 Provider，不渲染界面。
function ProjectSync({ project }: { project: ProjectDocument }) {
  useAssistantProjectSync(project);
  return null;
}

// 停靠助手在挂载副作用里补出首条草稿对话；交互前先把副作用刷干净，
// 否则点击句柄仍持有 active=null 的旧闭包。
async function settle() {
  await act(async () => {});
}

async function renderAssistant(project: ReturnType<typeof createProjectDocument>, onCommit = vi.fn(), clearStorage = true, strict = false) {
  if (clearStorage) window.localStorage.clear();
  const container = document.createElement("div");
  const root = createRoot(container);
  const assistant = <AssistantConversationProvider><AgentAssistant project={project} assets={[]} onCommit={onCommit} /></AssistantConversationProvider>;
  flushSync(() => root.render(strict ? <StrictMode>{assistant}</StrictMode> : assistant));
  await settle();
  return { container, root, onCommit };
}

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
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
  // 每个用例自己决定是否复用持久化会话，跨用例残留会污染 hydrate 结果。
  window.localStorage.clear();
});

describe("AgentAssistant", () => {
  it("renders the active AI workspace inline when docked", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <AssistantConversationProvider>
        <AgentAssistant project={project} assets={[]} onCommit={vi.fn()} />
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
          <AgentAssistant project={project} assets={[]} onCommit={vi.fn()} />
        </AssistantConversationProvider>
      </StrictMode>,
    ));

    await vi.waitFor(() => expect(container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    expect(consoleError.mock.calls.some(([message]) => String(message).includes("Cannot update a component"))).toBe(false);
    root.unmount();
  });

  it("exposes the conservative-mode composer without any floating surface", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const { container, root } = await renderAssistant(project);
    expect(container.querySelector('[aria-label="打开 AI 助手"]')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector(".agent-assistant-window")).toBeNull();
    expect(container.querySelector('[data-agent-presentation="docked"]')).not.toBeNull();
    expect((container.querySelector('input[type="radio"]') as HTMLInputElement).checked).toBe(true);
    root.unmount();
  });

  it("keeps hydration and fetch behavior alive under StrictMode", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", summary: "StrictMode 完成" })));
    const { container, root } = await renderAssistant(project, vi.fn(), true, true);
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
    const { container, root, onCommit } = await renderAssistant(project);
    setMessage(container, "调整地图和卡片");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("地图和卡片已完成"));
    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('.agent-assistant--docked input[type="checkbox"]'));
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
      .mockResolvedValueOnce(response({ kind: "tool-call", taskId: "task-private", budgetReceipt: "v1.receipt.private", calls: [{ id: "private-step", name: "update_cards", arguments: { patch: { showCount: false } } }], assistantMessage: { role: "assistant", content: "可手动应用的方案", tool_calls: [{ id: "private-call", type: "function", function: { name: "update_cards", arguments: "{}" } }] }, budget: { usedTokens: 12, maxTokens: 60000, rounds: 1, maxRounds: 20 } }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-private", budgetReceipt: "v1.receipt.private", summary: "可恢复方案" }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await renderAssistant(project);
    setMessage(first.container, "保存隐私方案");
    clickText(first.container, "开始规划");
    await vi.waitFor(() => expect(first.container.textContent).toContain("可恢复方案"));
    await vi.waitFor(() => expect(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")).toContain("private-step"));
    const serialized = window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!;
    expect(serialized).not.toContain("隐私学生姓名");
    expect(serialized).not.toContain("private-asset-data");
    expect(serialized).not.toContain("可手动应用的方案");
    expect(serialized).not.toContain('"tool_calls"');
    // 续聊闭环需要回执随快照落盘；它只带签名后的预算计数，不含学生数据或模型原文。
    expect(JSON.parse(serialized).conversations[0].snapshot).toMatchObject({ schemaVersion: 3, taskId: "task-private", budgetReceipt: "v1.receipt.private" });
    await vi.waitFor(() => {
      const persisted = JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!);
      expect(persisted.conversations[0]).toMatchObject({ status: "completed", selectedStepIds: ["private-step"] });
    });
    const loadedBeforeRemount = loadAssistantConversationState(window.localStorage, project);
    expect(loadedBeforeRemount?.conversations[0]).toMatchObject({ status: "completed", selectedStepIds: ["private-step"] });
    first.root.unmount();

    const onCommit = vi.fn();
    const restored = await renderAssistant(project, onCommit, false);
    await vi.waitFor(() => expect(restored.container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
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
    const first = await renderAssistant(project);
    setMessage(first.container, "保存这个提案");
    clickText(first.container, "开始规划");
    await vi.waitFor(() => expect(first.container.textContent).toContain("可恢复"));
    await vi.waitFor(() => {
      const persisted = JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1") ?? "null");
      expect(persisted?.conversations?.[0]?.status).toBe("completed");
    });
    first.root.unmount();

    const onCommit = vi.fn();
    const restored = await renderAssistant(project, onCommit, false);
    const saved = window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1");
    expect(saved).toContain("saved-step");
    expect(JSON.parse(saved!).conversations[0].status).toBe("completed");
    expect(JSON.parse(saved!).conversations[0].steps).toHaveLength(1);
    await vi.waitFor(() => expect(restored.container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
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
    await settle();
    setMessage(container, "旧项目请求");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    flushSync(() => root.render(<AssistantConversationProvider><AgentAssistant project={changed} assets={[]} onCommit={onCommit} onPreview={onPreview} /></AssistantConversationProvider>));
    release(response({ kind: "tool-call", calls: [{ id: "late-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: "过期模型文本" } }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(container.querySelectorAll('.agent-assistant--docked input[type="checkbox"]')).toHaveLength(0);
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
    const rendered = await renderAssistant(project);
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
    await settle();
    setMessage(container, "保存提案");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("已保存"));
    expect(container.querySelectorAll('.agent-assistant--docked input[type="checkbox"]')).toHaveLength(1);

    flushSync(() => root.render(<AssistantConversationProvider><AgentAssistant project={changed} assets={[]} onCommit={vi.fn()} /></AssistantConversationProvider>));

    await vi.waitFor(() => expect(container.textContent).toContain("保存提案"));
    await vi.waitFor(() => expect(container.querySelectorAll('.agent-assistant--docked input[type="checkbox"]')).toHaveLength(0));
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
    const rendered = await renderAssistant(project);
    setMessage(rendered.container, "不要留下提案");
    clickText(rendered.container, "开始规划");
    await vi.waitFor(() => expect(rendered.container.textContent).toContain("会话无法保存"));
    expect(rendered.container.querySelectorAll('.agent-assistant--docked input[type="checkbox"]')).toHaveLength(0);
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
    const first = await renderAssistant(original);
    setMessage(first.container, "保存提案");
    clickText(first.container, "开始规划");
    await vi.waitFor(() => expect(first.container.textContent).toContain("已保存"));

    first.root.unmount();
    const refreshed = await renderAssistant(changed, vi.fn(), false);
    await vi.waitFor(() => expect(JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!).conversations[0].steps).toEqual([]));
    refreshed.root.unmount();

    const restored = await renderAssistant(changed, vi.fn(), false);
    await vi.waitFor(() => expect(restored.container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    expect(restored.container.querySelectorAll('.agent-assistant--docked input[type="checkbox"]')).toHaveLength(0);
    const saved = JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!).conversations[0];
    expect(saved.projectDigest).not.toBeUndefined();
    expect(saved.snapshot.steps).toEqual([]);
    restored.root.unmount();
  });

  it("opens a persisted v2 conversation read-only and starts a new task instead of continuing", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", taskId: "task-v2", budgetReceipt: "v1.receipt.v2", calls: [{ id: "v2-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-v2", budgetReceipt: "v1.receipt.v2", summary: "旧版本完成" }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-new", budgetReceipt: "v1.receipt.new", summary: "新任务完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await renderAssistant(project);
    setMessage(first.container, "旧版本会话");
    clickText(first.container, "开始规划");
    await vi.waitFor(() => expect(first.container.textContent).toContain("旧版本完成"));
    await vi.waitFor(() => expect(JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!).conversations[0].snapshot.budgetReceipt).toBe("v1.receipt.v2"));
    first.root.unmount();

    // 旧版本写下的快照没有回执：降级成 v2 后必须仍能只读打开。
    const saved = JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!);
    delete saved.conversations[0].snapshot.taskId;
    delete saved.conversations[0].snapshot.budgetReceipt;
    saved.conversations[0].snapshot.schemaVersion = 2;
    window.localStorage.setItem("cengfan-map-studio:ai-conversations:v1", JSON.stringify(saved));

    const restored = await renderAssistant(project, vi.fn(), false);
    await vi.waitFor(() => expect(restored.container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    clickText(restored.container, "AI 对话");
    expect(restored.container.textContent).toContain("历史会话已只读恢复");
    expect(restored.container.textContent).not.toContain("继续对话");
    expect(restored.container.querySelector('[aria-label="确认应用"]')).not.toBeNull();

    setMessage(restored.container, "换个方向");
    clickText(restored.container, "新开任务");
    await vi.waitFor(() => expect(restored.container.textContent).toContain("新任务完成"));
    const newTaskBody = JSON.parse(String(((fetchMock.mock.calls[2] as unknown[])[1] as RequestInit).body)) as { taskId?: string; budgetReceipt?: string; messages: Array<{ role: string }> };
    expect(newTaskBody.taskId).toBeUndefined();
    expect(newTaskBody.budgetReceipt).toBeUndefined();
    expect(newTaskBody.messages.every((entry) => entry.role === "user")).toBe(true);
    restored.root.unmount();
  });

  it("switches to a fresh task after the server reports an expired budget receipt", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-expiry", budgetReceipt: "v1.receipt.expiry", summary: "第一轮完成" }))
      // 台账 TTL 到点后服务端只会回这个新错误码，旧的 AI_VALIDATION_ERROR 文案对用户毫无意义。
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { code: "AI_RECEIPT_EXPIRED", message: "会话预算回执已过期或已被使用，请新开一个 AI 任务" } }) })
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-fresh", budgetReceipt: "v1.receipt.fresh", summary: "新任务完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = await renderAssistant(project);
    setMessage(container, "第一轮");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第一轮完成"));

    setMessage(container, "半小时后继续");
    clickText(container, "继续对话");
    await vi.waitFor(() => expect(container.textContent).toContain("会话预算回执已过期或已被使用"));
    expect(container.textContent).toContain("发送新需求会新开一个 AI 任务");
    expect(container.textContent).not.toContain("请求内容未通过校验");
    expect(container.textContent).not.toContain("继续对话");
    // 回执过期与瞬时失败不同：这段会话再也续不上，只能新开任务。
    expect(container.textContent).not.toContain("重试并继续");

    setMessage(container, "换个方向");
    clickText(container, "新开任务");
    await vi.waitFor(() => expect(container.textContent).toContain("新任务完成"));
    const freshBody = JSON.parse(String(((fetchMock.mock.calls[2] as unknown[])[1] as RequestInit).body)) as { taskId?: string; budgetReceipt?: string; messages: Array<{ role: string }> };
    expect(freshBody.taskId).toBeUndefined();
    expect(freshBody.budgetReceipt).toBeUndefined();
    expect(freshBody.messages).toEqual([{ role: "user", content: "换个方向" }]);
    root.unmount();
  });

  it("retries a transient continuation failure on the same session instead of opening a new task", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-transient", budgetReceipt: "v1.receipt.transient", summary: "第一轮完成" }))
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: { code: "AI_UPSTREAM_UNAVAILABLE", message: "上游不可用" } }) })
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-transient", budgetReceipt: "v1.receipt.transient-2", summary: "重试完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = await renderAssistant(project);
    setMessage(container, "第一轮");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第一轮完成"));

    setMessage(container, "继续调整");
    clickText(container, "继续对话");
    await vi.waitFor(() => expect(container.textContent).toContain("AI 服务暂时不可用"));
    // 超时/限流/上游不可用是瞬时故障，会话与预算都还在，入口不该退回"开始规划"。
    expect(container.textContent).toContain("重试并继续");
    expect(container.textContent).toContain("重试会沿用原有上下文与预算");
    expect(container.textContent).not.toContain("开始规划");
    expect(container.textContent).not.toContain("新开任务");

    clickText(container, "重试并继续");
    await vi.waitFor(() => expect(container.textContent).toContain("重试完成"));
    const retryBody = JSON.parse(String(((fetchMock.mock.calls[2] as unknown[])[1] as RequestInit).body)) as { taskId?: string; budgetReceipt?: string; messages: Array<{ role: string; content: string }> };
    expect(retryBody.taskId).toBe("task-transient");
    expect(retryBody.budgetReceipt).toBe("v1.receipt.transient");
    // 失败那一轮压入的提问已经弹出，重试的历史里只有一条"继续调整"，前面还接着上一轮的总结。
    expect(retryBody.messages).toEqual([
      { role: "user", content: "第一轮" },
      { role: "assistant", content: "第一轮完成" },
      { role: "user", content: "继续调整" },
    ]);
    root.unmount();
  });

  it("does not auto-commit a low-risk continuation of a restored smart conversation", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", taskId: "task-smart", budgetReceipt: "v1.receipt.smart-1", calls: [{ id: "first", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-smart", budgetReceipt: "v1.receipt.smart-2", summary: "第一轮完成" }))
      .mockResolvedValueOnce(response({ kind: "tool-call", taskId: "task-smart", budgetReceipt: "v1.receipt.smart-3", calls: [{ id: "second", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 2 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-smart", budgetReceipt: "v1.receipt.smart-4", summary: "继续完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await renderAssistant(project);
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
    const restored = await renderAssistant(project, onCommit, false);
    await vi.waitFor(() => expect(restored.container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    clickText(restored.container, "AI 对话");
    setMessage(restored.container, "继续调整");    clickText(restored.container, "继续对话");
    await vi.waitFor(() => expect(restored.container.textContent).toContain("继续完成"));
    expect(onCommit).not.toHaveBeenCalled();
    expect(restored.container.querySelector('[aria-label="确认应用"]')).not.toBeNull();
    const continuationBody = JSON.parse(String(((fetchMock.mock.calls[2] as unknown[])[1] as RequestInit).body)) as Record<string, unknown>;
    expect(continuationBody).toMatchObject({ taskId: "task-smart", budgetReceipt: "v1.receipt.smart-2" });
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
    await settle();
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
    const first = await renderAssistant(original);
    setMessage(first.container, "保留这段上下文");
    clickText(first.container, "开始规划");
    await vi.waitFor(() => expect(first.container.textContent).toContain("第一轮完成"));
    first.root.unmount();

    const restored = await renderAssistant(changed, vi.fn(), false);
    await vi.waitFor(() => expect(restored.container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    clickText(restored.container, "AI 对话");
    setMessage(restored.container, "继续使用上下文");    clickText(restored.container, "继续对话");
    await vi.waitFor(() => expect(restored.container.textContent).toContain("继续完成"));
    const continuationBody = JSON.parse(String((fetchMock.mock.calls[2] as unknown[])[1] && ((fetchMock.mock.calls[2] as unknown[])[1] as RequestInit).body));
    expect(continuationBody.messages.some((entry: { content?: string }) => entry.content === "保留这段上下文" || entry.content === "旧方案说明")).toBe(false);
    expect(continuationBody.messages.some((entry: { role?: string; tool_calls?: unknown[]; tool_call_id?: string }) => entry.role === "tool" || entry.tool_calls || entry.tool_call_id === "old-call")).toBe(false);
    // 项目换了不代表换了 AI 任务：预算回执要跟着文本历史一起带回去。
    expect(continuationBody.taskId).toBe("old-task");
    expect(continuationBody.budgetReceipt).toBe("old-receipt");
    expect(continuationBody.budget).toBeUndefined();
    expect(restored.container.querySelectorAll('.agent-assistant--docked input[type="checkbox"]')).toHaveLength(0);
    restored.root.unmount();
  });

  it("keeps completed conversations in history and shows one pending badge", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "call-one", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 2 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "第一段完成" }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "第二段完成" })));
    const { container, root } = await renderAssistant(project);
    setMessage(container, "第一段");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第一段完成"));
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="新建对话"]')?.click());
    setMessage(container, "第二段");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第二段完成"));
    // 两段对话 + 新建对话入口；只有第一段留下待应用步骤。
    expect(container.querySelectorAll(".agent-assistant-history button")).toHaveLength(3);
    expect(container.querySelectorAll(".agent-assistant-history small")).toHaveLength(1);
    expect(container.querySelector(".agent-assistant-history small")?.textContent).toBe("待应用");
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
    const { container, root } = await renderAssistant(project);
    setMessage(container, "第一轮");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第一轮完成"));
    setMessage(container, "继续调整");
    expect(container.textContent).toContain("继续对话");
    clickText(container, "继续对话");
    await vi.waitFor(() => expect(container.textContent).toContain("继续完成"));
    expect(container.querySelectorAll('.agent-assistant--docked input[type="checkbox"]')).toHaveLength(2);
    const continuationBody = JSON.parse(String((fetchMock.mock.calls[2] as unknown[])[1] && ((fetchMock.mock.calls[2] as unknown[])[1] as RequestInit).body));
    expect(continuationBody.messages.some((entry: { content?: string }) => entry.content === "第一轮")).toBe(true);
    root.unmount();
  });

  it("refuses to start a second run while another conversation is still running", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let release!: (value: ReturnType<typeof response>) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<ReturnType<typeof response>>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const { container, root } = await renderAssistant(project);
    const historyButtons = () => Array.from(container.querySelectorAll<HTMLButtonElement>(".agent-assistant-history button"));
    // 先备好第二段对话的草稿，再回到第一段开跑。
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="新建对话"]')?.click());
    setMessage(container, "第二段");
    flushSync(() => historyButtons()[0]!.click());
    setMessage(container, "第一段");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    flushSync(() => historyButtons()[1]!.click());
    const runButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("开始规划"));
    // 第二路一旦发出去就会顶掉 activeRunRef，第一路的结果会被吞掉并永远卡在 running。
    flushSync(() => runButton!.click());
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(runButton?.disabled).toBe(true);
    expect(container.textContent).toContain("另一个对话正在运行");

    // 进行中的那段仍可回去取消，结果也仍然回写得到本人。
    flushSync(() => historyButtons()[0]!.click());
    expect(container.querySelector('[aria-label="取消 AI 会话"]')).not.toBeNull();
    release(response({ kind: "finish", summary: "第一段完成" }));
    await vi.waitFor(() => expect(container.textContent).toContain("第一段完成"));
    expect(container.querySelector('[aria-label="取消 AI 会话"]')).toBeNull();

    // 跑完之后第二段重新可发送。
    flushSync(() => historyButtons()[1]!.click());
    expect(container.textContent).not.toContain("另一个对话正在运行");
    const secondRunButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("开始规划"));
    expect(secondRunButton?.disabled).toBe(false);
    root.unmount();
  });

  it("does not let a conversation persisted mid-run lock the assistant after reload", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", summary: "第一轮完成" }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "重开后完成" })));
    const first = await renderAssistant(project);
    setMessage(first.container, "关页面前的会话");
    clickText(first.container, "开始规划");
    await vi.waitFor(() => expect(first.container.textContent).toContain("第一轮完成"));
    await vi.waitFor(() => expect(JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!).conversations[0].status).toBe("completed"));
    first.root.unmount();

    // 页面在会话跑到一半时关掉，落盘的状态就停在 running。
    const saved = JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1")!);
    saved.conversations[0].status = "running";
    window.localStorage.setItem("cengfan-map-studio:ai-conversations:v1", JSON.stringify(saved));

    const restored = await renderAssistant(project, vi.fn(), false);
    await vi.waitFor(() => expect(restored.container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    expect(restored.container.querySelector('[aria-label="取消 AI 会话"]')).toBeNull();
    expect(restored.container.textContent).toContain("页面刷新，任务已中止");
    // 没有任何请求在飞，助手不该被这条幽灵会话锁死。
    expect(restored.container.textContent).not.toContain("另一个对话正在运行");
    setMessage(restored.container, "重开后继续用");
    clickText(restored.container, "开始规划");
    await vi.waitFor(() => expect(restored.container.textContent).toContain("重开后完成"));
    restored.root.unmount();
  });

  it("keeps steps unchecked by the user unchecked after a continuation", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "first", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "第一轮完成" }))
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "second", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 2 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "继续完成" })));
    const { container, root, onCommit } = await renderAssistant(project);
    setMessage(container, "第一轮");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第一轮完成"));
    const checkboxes = () => Array.from(container.querySelectorAll<HTMLInputElement>('.agent-assistant--docked input[type="checkbox"]'));
    expect(checkboxes()[0]!.checked).toBe(true);
    flushSync(() => checkboxes()[0]!.click());
    expect(checkboxes()[0]!.checked).toBe(false);

    setMessage(container, "继续调整");
    clickText(container, "继续对话");
    await vi.waitFor(() => expect(container.textContent).toContain("继续完成"));
    expect(checkboxes()).toHaveLength(2);
    // 续聊只并入本轮新增的写步骤：上一轮被取消勾选的那条不该被静默勾回。
    expect(checkboxes()[0]!.checked).toBe(false);
    expect(checkboxes()[1]!.checked).toBe(true);
    expect(container.textContent).toContain("1/2 项已选");

    clickText(container, "确认应用");
    expect(onCommit).toHaveBeenCalledTimes(1);
    const applied = onCommit.mock.calls[0]![0].apply(project) as ProjectDocument;
    expect(applied.cards.fontSize).toBe(project.cards.fontSize + 2);
    expect(applied.map.scale).toBe(project.map.scale);
    root.unmount();
  });

  it("keeps an applied conversation terminal and hides proposal controls", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "first", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const { container, root, onCommit } = await renderAssistant(project);
    setMessage(container, "应用地图");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("完成"));
    clickText(container, "确认应用");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.agent-assistant--docked input[type="checkbox"]')).toHaveLength(0);
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
    await settle();
    setMessage(container, "应用后更新项目");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("已应用"));
    clickText(container, "确认应用");
    expect(onCommit).toHaveBeenCalledTimes(1);

    render();
    await vi.waitFor(() => expect(container.textContent).toContain("已应用"));
    expect(container.querySelectorAll('.agent-assistant--docked input[type="checkbox"]')).toHaveLength(0);
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
    const { container, root } = await renderAssistant(project);
    root.render(<AssistantConversationProvider><AgentAssistant project={project} assets={[]} onCommit={vi.fn()} onPendingCountChange={pending} /></AssistantConversationProvider>);
    await settle();
    const smart = container.querySelector<HTMLInputElement>('input[type="radio"][value="smart"]');
    expect(smart).not.toBeNull();
    flushSync(() => smart?.click());
    setMessage(container, "智能修改");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("已应用"));
    expect(pending).toHaveBeenLastCalledWith(0);
    root.unmount();
  });

  it("drops every floating-window control from the docked surface", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const { container, root } = await renderAssistant(project);

    for (const label of ["最小化 AI 助手", "关闭 AI 助手", "重置窗口位置", "打开 AI 助手"]) {
      expect(container.querySelector(`[aria-label="${label}"]`)).toBeNull();
    }
    expect(container.querySelector(".agent-assistant-window")).toBeNull();
    expect(container.querySelector('button[aria-label="新建对话"]')).not.toBeNull();
    root.unmount();
  });

  it("keeps a running session alive when only the assistant unmounts and shows the result on remount", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let signal: AbortSignal | undefined;
    let release!: (value: ReturnType<typeof response>) => void;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<ReturnType<typeof response>>((resolve, reject) => {
        release = resolve;
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }));
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    // 抽屉打开/关闭只挂载与卸载 AgentAssistant，Provider 始终存活。
    const renderDrawer = (open: boolean) => flushSync(() => root.render(
      <AssistantConversationProvider>
        {open ? <AgentAssistant project={project} assets={[]} onCommit={onCommit} /> : null}
      </AssistantConversationProvider>,
    ));
    renderDrawer(true);
    await settle();
    setMessage(container, "抽屉关闭也要跑完");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    renderDrawer(false);
    expect(signal?.aborted).toBe(false);
    release(response({ kind: "finish", summary: "关抽屉后仍然完成" }));
    await settle();

    renderDrawer(true);
    await vi.waitFor(() => expect(container.textContent).toContain("关抽屉后仍然完成"));
    expect(container.querySelector('[aria-label="取消 AI 会话"]')).toBeNull();
    expect(onCommit).not.toHaveBeenCalled();
    root.unmount();
  });

  it("drops a run that lands after the project changed while the assistant was unmounted", async () => {
    const original = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const changed = { ...original, map: { ...original.map, width: original.map.width + 1 } };
    let release!: (value: ReturnType<typeof response>) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "stale-preview", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: "旧快照方案" } }))
      // 中止不影响这一次回执：模拟服务端已经算完、结果正在路上的竞态。
      .mockImplementationOnce(() => new Promise<ReturnType<typeof response>>((resolve) => { release = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    // 抽屉只挂载/卸载助手；登记器与 Provider 一样常驻，对应 StudioApp 那一层。
    const renderTree = (project: ProjectDocument, assistantOpen: boolean) => flushSync(() => root.render(
      <AssistantConversationProvider>
        <ProjectSync project={project} />
        {assistantOpen ? <AgentAssistant project={project} assets={[]} onCommit={onCommit} onPreview={onPreview} /> : null}
      </AssistantConversationProvider>,
    ));
    renderTree(original, true);
    await settle();
    setMessage(container, "关抽屉后工程还会改");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    renderTree(original, false);
    renderTree(changed, false);
    release(response({ kind: "finish", summary: "旧工程上的结论" }));
    await settle();

    expect(onPreview).not.toHaveBeenCalledWith(expect.objectContaining({ map: expect.objectContaining({ scale: 0.9 }) }));
    expect(onCommit).not.toHaveBeenCalled();

    // 重开抽屉：会话被判过期归 draft，既不留可应用步骤，也不会卡在 running。
    renderTree(changed, true);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    expect(container.querySelectorAll('.agent-assistant--docked input[type="checkbox"]')).toHaveLength(0);
    expect(container.querySelector('[aria-label="取消 AI 会话"]')).toBeNull();
    expect(container.querySelector('[aria-label="确认应用"]')).toBeNull();
    expect(container.textContent).not.toContain("旧工程上的结论");
    // draft 才会显示"开始规划"；"继续对话"意味着它还被当成已完成的可续聊会话。
    expect(container.textContent).toContain("开始规划");
    expect(container.textContent).not.toContain("继续对话");
    root.unmount();
  });

  it("keeps the running conversation cancellable after the assistant remounts", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }));
    const container = document.createElement("div");
    const root = createRoot(container);
    const renderDrawer = (open: boolean) => flushSync(() => root.render(
      <AssistantConversationProvider>
        {open ? <AgentAssistant project={project} assets={[]} onCommit={vi.fn()} /> : null}
      </AssistantConversationProvider>,
    ));
    renderDrawer(true);
    await settle();
    setMessage(container, "先关抽屉再取消");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    renderDrawer(false);
    renderDrawer(true);
    // 会话状态仍是 running，取消入口指向 Provider 里那个仍在跑的会话。
    const cancelButton = container.querySelector<HTMLButtonElement>('[aria-label="取消 AI 会话"]');
    expect(cancelButton).not.toBeNull();
    expect(signal?.aborted).toBe(false);
    flushSync(() => cancelButton!.click());
    expect(signal?.aborted).toBe(true);
    await vi.waitFor(() => expect(container.textContent).toContain("已取消，预览未应用"));
    root.unmount();
  });

  it("cancels a running session when the provider unmounts, without committing", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }));
    const { container, root, onCommit } = await renderAssistant(project);
    setMessage(container, "取消这次任务");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("取消"));
    root.unmount();
    expect(signal?.aborted).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
