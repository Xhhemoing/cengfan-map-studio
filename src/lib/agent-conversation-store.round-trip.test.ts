import { describe, expect, it } from "vitest";
import { AgentSession } from "./agent-session";
import {
  ASSISTANT_CONVERSATION_STORAGE_KEY,
  loadAssistantConversationState,
  saveAssistantConversationState,
} from "./agent-conversation-store";
import {
  createConversationRecord as record,
  createConversationState as state,
  createStorageDouble as storage,
  createStoreProject,
} from "./agent-conversation-store-test-fixtures";

describe("agent-conversation-store round-trip", () => {
  it("round-trips bounded conversation state with a project binding", () => {
    const project = createStoreProject();
    const target = storage();
    const source = state([record(project)]);

    saveAssistantConversationState(target, project, source);
    const loaded = loadAssistantConversationState(target, project);

    expect(target.setItem).toHaveBeenCalledWith(ASSISTANT_CONVERSATION_STORAGE_KEY, expect.any(String));
    expect(loaded?.mode).toBe(source.mode);
    expect(loaded?.activeId).toBe(source.activeId);
    expect(loaded?.conversations[0]).toMatchObject({ title: "AI 对话", request: "已保存的 AI 对话", status: "completed", summary: "已保存对话" });
    expect(loaded).not.toBe(source);
  });

  it("converts persisted running conversations to cancelled without retaining executable state", () => {
    const project = createStoreProject();
    const target = storage();
    const running = record(project, { status: "running" });

    saveAssistantConversationState(target, project, state([running]));

    expect(loadAssistantConversationState(target, project)?.conversations[0]).toMatchObject({
      status: "cancelled",
      summary: "页面刷新，任务已中止，预览未应用",
    });
  });

  it("normalizes omitted auto-layout mode for durable round-trip and replay", () => {
    const project = createStoreProject();
    const target = storage();
    const step = { id: "auto-layout-default", name: "auto_layout", arguments: {}, risk: "low" as const };
    const snapshot = new AgentSession(project, { mode: "conservative" }).exportSnapshot();
    const source = record(project, {
      steps: [step],
      selectedStepIds: [step.id],
      snapshot: { ...snapshot, steps: [step], completed: true },
    });

    saveAssistantConversationState(target, project, state([source]));

    const loaded = loadAssistantConversationState(target, project)?.conversations[0];
    expect(loaded).toMatchObject({ status: "completed", selectedStepIds: [step.id] });
    expect(loaded?.steps[0]?.arguments).toEqual({ mode: "quadrant" });
    expect(loaded?.snapshot?.steps[0]?.arguments).toEqual({ mode: "quadrant" });

    const restored = AgentSession.restore(project, loaded!.snapshot!, { mode: "conservative" });
    expect(restored.steps[0]?.arguments).toEqual({ mode: "quadrant" });
  });

  it.each(["quadrant", "radial", "right-stack", "grid"] as const)("round-trips and replays update_cards layoutMode %s", (layoutMode) => {
    const project = createStoreProject();
    const target = storage();
    const step = { id: `cards-layout-${layoutMode}`, name: "update_cards", arguments: { patch: { layoutMode } }, risk: "medium" as const };
    const snapshot = new AgentSession(project, { mode: "conservative" }).exportSnapshot();
    const source = record(project, {
      steps: [step],
      selectedStepIds: [step.id],
      snapshot: { ...snapshot, steps: [step], completed: true },
    });

    saveAssistantConversationState(target, project, state([source]));

    const loaded = loadAssistantConversationState(target, project)?.conversations[0];
    expect(loaded).toMatchObject({ status: "completed", selectedStepIds: [step.id] });
    expect(loaded?.steps[0]?.arguments).toEqual({ patch: { layoutMode } });
    expect(loaded?.snapshot?.steps[0]?.arguments).toEqual({ patch: { layoutMode } });

    const restored = AgentSession.restore(project, loaded!.snapshot!, { mode: "conservative" });
    expect(restored.shadowProject.cards.layoutMode).toBe(layoutMode);
  });

  it("persists safe boolean and numeric style fields", () => {
    const project = createStoreProject();
    const target = storage();
    const snapshot = new AgentSession(project, { mode: "conservative" }).exportSnapshot();
    const safeStep = {
      id: "safe-style",
      name: "update_canvas",
      arguments: { patch: { width: 900, backgroundOpacity: 0.8, lineHeight: 1.2 } },
      risk: "low" as const,
    };
    saveAssistantConversationState(target, project, state([record(project, { steps: [safeStep], selectedStepIds: [safeStep.id], snapshot: { ...snapshot, steps: [safeStep] } })]));

    expect(target.value()).toContain("safe-style");
    expect(loadAssistantConversationState(target, project)?.conversations[0]).toMatchObject({ status: "completed", selectedStepIds: ["safe-style"] });
  });
});
