import { describe, expect, it } from "vitest";
import { AgentSession } from "./agent-session";
import {
  loadAssistantConversationState,
  saveAssistantConversationState,
} from "./agent-conversation-store";
import { buildProjectDigest } from "./project-digest";
import {
  createConversationRecord as record,
  createConversationState as state,
  createStorageDouble as storage,
  createStoreProject,
} from "./agent-conversation-store-test-fixtures";

describe("agent-conversation-store project rebinding", () => {
  it.each([
    { projectMatches: true, label: "matching" },
    { projectMatches: false, label: "mismatching" },
  ])("normalizes a completed snapshot:null conversation to a non-continuable failed state ($label project)", ({ projectMatches }) => {
    const original = createStoreProject();
    const current = projectMatches ? original : { ...original, map: { ...original.map, width: original.map.width + 1 } };
    const target = storage();
    saveAssistantConversationState(target, original, state([record(original, {
      status: "completed",
      steps: [{ id: "orphan-step", name: "update_map", arguments: { patch: { scale: 0.9 } }, risk: "low" }],
      selectedStepIds: ["orphan-step"],
      snapshot: null,
    })]));

    const loaded = loadAssistantConversationState(target, current)?.conversations[0];

    expect(loaded).toMatchObject({
      status: "failed",
      steps: [],
      selectedStepIds: [],
      snapshot: null,
    });
    expect(loaded?.summary).toBe("会话无法恢复，预览未应用");
  });

  it("normalizes a running snapshot:null conversation without retaining executable state", () => {
    const project = createStoreProject();
    const target = storage();
    saveAssistantConversationState(target, project, state([record(project, {
      status: "running",
      steps: [{ id: "running-orphan", name: "update_map", arguments: { patch: { scale: 0.9 } }, risk: "low" }],
      selectedStepIds: ["running-orphan"],
      snapshot: null,
    })]));

    const loaded = loadAssistantConversationState(target, project)?.conversations[0];

    expect(loaded).toMatchObject({
      status: "cancelled",
      steps: [],
      selectedStepIds: [],
      snapshot: null,
    });
    expect(loaded?.summary).toBe("会话无法恢复，预览未应用");
  });

  it("preserves only textual history when the project binding changes", () => {
    const original = createStoreProject();
    const current = { ...original, map: { ...original.map, width: original.map.width + 1 } };
    const target = storage();
    const snapshot = new AgentSession(original, { mode: "conservative" }).exportSnapshot();
    const persisted = record(original, {
      projectDigest: JSON.stringify(buildProjectDigest(original)),
      steps: [{ id: "step-1", name: "update_map", arguments: {}, risk: "low" }],
      selectedStepIds: ["step-1"],
      snapshot: { ...snapshot, steps: [{ id: "step-1", name: "update_map", arguments: {}, risk: "low" }] },
    });
    saveAssistantConversationState(target, original, state([persisted]));

    const loaded = loadAssistantConversationState(target, current);

    expect(loaded?.conversations[0]).toMatchObject({
      id: persisted.id,
      title: "AI 对话",
      request: "已保存的 AI 对话",
      summary: "已保存对话",
      status: "completed",
      steps: [],
      selectedStepIds: [],
      snapshot: expect.objectContaining({ steps: [], completed: true }),
    });
    expect(loaded?.conversations[0]?.snapshot?.conversation).toEqual([]);
  });

  it("keeps a refreshed running conversation cancelled when the project binding changes", () => {
    const original = createStoreProject();
    const current = { ...original, map: { ...original.map, width: original.map.width + 1 } };
    const target = storage();
    saveAssistantConversationState(target, original, state([record(original, { status: "running" })]));

    expect(loadAssistantConversationState(target, current)?.conversations[0]).toMatchObject({
      status: "cancelled",
      summary: "页面刷新，任务已中止，预览未应用",
      steps: [],
      selectedStepIds: [],
      snapshot: null,
    });
  });
});
