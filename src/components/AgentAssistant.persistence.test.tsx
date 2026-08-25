import { describe, expect, it, vi } from "vitest";
import { AgentSession } from "../lib/agent-session";
import { loadAssistantConversationState } from "../lib/agent-conversation-store";
import {
  assistantProject,
  clickText,
  installAgentAssistantTestHarness,
  installResponses,
  openAssistant,
  renderAssistant,
  setMessage,
} from "./agent-assistant-test-harness";

installAgentAssistantTestHarness();

describe("AgentAssistant persistence", () => {
  it("persists only minimized replay data while preserving matching-project manual apply after reload", async () => {
    const project = assistantProject({
      students: [{ id: "student-privacy", name: "隐私学生姓名", university: "大学", city: "城市", province: "省份", visibility: true }],
    });
    project.assetElements = [{ ...project.assetElements[0]!, id: "private-asset", src: "data:image/png;base64,private-asset-data", label: "私有素材" }];
    installResponses(
      { kind: "tool-call", taskId: "secret-task-id", budgetReceipt: "secret-budget-receipt", calls: [{ id: "private-step", name: "update_cards", arguments: { patch: { showCount: false } } }], assistantMessage: { role: "assistant", content: "可手动应用的方案", tool_calls: [{ id: "private-call", type: "function", function: { name: "update_cards", arguments: "{}" } }] }, budget: { usedTokens: 12, maxTokens: 60000, rounds: 1, maxRounds: 20 } },
      { kind: "finish", taskId: "secret-task-id", budgetReceipt: "secret-budget-receipt", summary: "可恢复方案" },
    );
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
    const project = assistantProject();
    installResponses(
      { kind: "tool-call", calls: [{ id: "saved-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "可恢复" },
    );
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

  it("debounced persistence does not write after unmount", async () => {
    vi.useFakeTimers();
    const project = assistantProject();
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

  it("clears visible and persisted proposals when a snapshot export fails", async () => {
    const project = assistantProject();
    installResponses(
      { kind: "tool-call", calls: [{ id: "failed-save", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "完成" },
    );
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
});
