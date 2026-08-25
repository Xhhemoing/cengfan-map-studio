import { describe, expect, it } from "vitest";
import { AgentSession, type AgentSessionSnapshot } from "./agent-session";
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

describe("agent-conversation-store limits and malformed payloads", () => {
  it("rejects valid JSON payloads over the serialized storage limit", () => {
    const project = createStoreProject();
    const persisted = {
      schemaVersion: 1,
      projectDigest: "{}",
      mode: "conservative",
      activeId: null,
      conversations: [],
      ignored: "x".repeat(256 * 1024),
    };
    expect(loadAssistantConversationState(storage(JSON.stringify(persisted)), project)).toBeNull();
  });

  it("keeps at most twenty records and degrades safely for storage or JSON failures", () => {
    const project = createStoreProject();
    const target = storage();
    const conversations = Array.from({ length: 21 }, (_, index) => record(project, { id: `conversation-${index}` }));
    saveAssistantConversationState(target, project, state(conversations));
    expect(loadAssistantConversationState(target, project)?.conversations).toHaveLength(20);

    const broken = storage("not-json");
    expect(loadAssistantConversationState(broken, project)).toBeNull();
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadAssistantConversationState(throwing, project)).toBeNull();
    expect(() => saveAssistantConversationState(throwing, project, state([]))).not.toThrow();
  });

  it("rejects non-integer and negative persisted step limits", () => {
    const project = createStoreProject();
    const target = storage();
    const persisted = JSON.parse(JSON.stringify({
      schemaVersion: 1,
      projectDigest: JSON.stringify({}),
      mode: "conservative",
      activeId: "conversation-1",
      conversations: [record(project, { steps: [{ id: "step", name: "update_map", arguments: {}, risk: "low" }] })],
    }));
    persisted.conversations[0].steps[0].arguments = { value: "x".repeat(70 * 1024) };
    target.getItem.mockReturnValue(JSON.stringify(persisted));
    expect(loadAssistantConversationState(target, project)).toBeNull();
  });

  it("drops persisted records with malformed snapshots", () => {
    const project = createStoreProject();
    const target = storage(JSON.stringify({
      schemaVersion: 1,
      projectDigest: JSON.stringify(buildProjectDigest(project)),
      mode: "conservative",
      activeId: "conversation-1",
      conversations: [record(project, { snapshot: { schemaVersion: 2 } as unknown as AgentSessionSnapshot })],
    }));
    expect(loadAssistantConversationState(target, project)).toBeNull();
  });

  it("drops persisted records with malformed step fields", () => {
    const project = createStoreProject();
    const target = storage(JSON.stringify({
      schemaVersion: 1,
      projectDigest: JSON.stringify({}),
      mode: "conservative",
      activeId: "conversation-1",
      conversations: [{
        ...record(project),
        steps: [{ id: "bad", name: "update_map", arguments: {}, result: {}, risk: "unknown" }],
      }],
    }));
    expect(loadAssistantConversationState(target, project)).toBeNull();
  });

  it("rejects snapshots with an invalid schema or oversized conversation data", () => {
    const project = createStoreProject();
    const invalidSnapshot = { schemaVersion: 2 } as unknown as AgentSessionSnapshot;
    expect(() => AgentSession.restore(project, invalidSnapshot, { mode: "conservative" })).toThrow();

    const target = storage();
    const huge = record(project, { title: "x".repeat(300 * 1024) });
    saveAssistantConversationState(target, project, state([huge]));
    expect(target.setItem).not.toHaveBeenCalled();
  });
});
