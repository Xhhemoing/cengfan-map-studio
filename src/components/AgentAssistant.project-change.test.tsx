import { describe, expect, it, vi } from "vitest";
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
  requestBody,
  response,
  setMessage,
} from "./agent-assistant-test-harness";

installAgentAssistantTestHarness();

describe("AgentAssistant project changes", () => {
  it("discards a late response after a same-provider project change", async () => {
    const original = assistantProject();
    const changed = { ...original, map: { ...original.map, width: original.map.width + 1 } };
    let release!: (value: ReturnType<typeof response>) => void;
    const fetchMock = installFetch(vi.fn(() => new Promise<ReturnType<typeof response>>((resolve) => { release = resolve; })));
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    const { container, root } = mountAssistant(<AssistantConversationProvider><AgentAssistant project={original} assets={[]} onCommit={onCommit} onPreview={onPreview} /></AssistantConversationProvider>);
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

  it("rebases executable state when the project changes under the same provider", async () => {
    const original = assistantProject();
    const changed = { ...original, cards: { ...original.cards, positions: { 北京市: { x: 18, y: 24 } } } };
    installResponses(
      { kind: "tool-call", calls: [{ id: "stale-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: "旧文本历史" } },
      { kind: "finish", summary: "已保存" },
    );
    const { container, root } = mountAssistant(<AssistantConversationProvider><AgentAssistant project={original} assets={[]} onCommit={vi.fn()} /></AssistantConversationProvider>);
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

  it("clears persisted executable state when the project changes before a provider remount", async () => {
    const original = assistantProject();
    const changed = { ...original, map: { ...original.map, width: original.map.width + 1 } };
    installResponses(
      { kind: "tool-call", calls: [{ id: "stale-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "已保存" },
    );
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
    const project = assistantProject();
    installResponses(
      { kind: "tool-call", calls: [{ id: "first", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "第一轮完成" },
      { kind: "tool-call", calls: [{ id: "second", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 2 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "继续完成" },
    );
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
    const original = assistantProject();
    const changed = { ...original, map: { ...original.map, width: original.map.width + 1 } };
    installResponses(
      { kind: "tool-call", calls: [{ id: "stale-selection", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "待选方案" },
    );
    const onPreview = vi.fn();
    const { container, root } = mountAssistant(<AssistantConversationProvider><AgentAssistant project={original} assets={[]} onCommit={vi.fn()} onPreview={onPreview} /></AssistantConversationProvider>);
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
    const original = assistantProject();
    const changed = { ...original, map: { ...original.map, width: original.map.width + 1 } };
    const fetchMock = installResponses(
      { kind: "tool-call", taskId: "old-task", budgetReceipt: "old-receipt", calls: [{ id: "old-call", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: "旧方案说明", tool_calls: [{ id: "old-call", type: "function", function: { name: "update_map", arguments: "{}" } }] }, budget: { usedTokens: 12, maxTokens: 60000, rounds: 1, maxRounds: 20 } },
      { kind: "finish", taskId: "old-task", budgetReceipt: "old-receipt", summary: "第一轮完成", budget: { usedTokens: 12, maxTokens: 60000, rounds: 1, maxRounds: 20 } },
      { kind: "finish", summary: "继续完成" },
    );
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
    const continuationBody = requestBody(fetchMock, 2);
    expect(continuationBody.messages.some((entry: { content?: string }) => entry.content === "保留这段上下文" || entry.content === "旧方案说明")).toBe(false);
    expect(continuationBody.messages.some((entry: { role?: string; tool_calls?: unknown[]; tool_call_id?: string }) => entry.role === "tool" || entry.tool_calls || entry.tool_call_id === "old-call")).toBe(false);
    expect(continuationBody.taskId).toBeUndefined();
    expect(continuationBody.budgetReceipt).toBeUndefined();
    expect(restored.container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(0);
    restored.root.unmount();
  });
});
