import { vi } from "vitest";
import { AgentSession } from "./agent-session";
import type { AssistantConversationRecord, AssistantConversationState } from "./agent-conversation-store";
import type { Student } from "./project-data";
import { createProjectDocument, type ProjectDocument } from "./project-document";

/** In-memory `Storage` double: spies on the two methods the store uses, and exposes the last written payload. */
export function createStorageDouble(initial: string | null = null) {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next; }),
    value: () => value,
  };
}

/** The default project every persistence case binds to; pass students when the case needs facts to redact. */
export function createStoreProject(students: Student[] = []): ProjectDocument {
  return createProjectDocument({ students, templateId: "original", dataView: "province" });
}

export function createConversationRecord(project: ProjectDocument, overrides: Partial<AssistantConversationRecord> = {}): AssistantConversationRecord {
  return {
    id: "conversation-1",
    title: "调整地图",
    request: "调整地图",
    status: "completed",
    summary: "完成",
    error: "",
    steps: [],
    selectedStepIds: [],
    mode: "conservative",
    provider: "",
    snapshot: new AgentSession(project, { mode: "conservative" }).exportSnapshot(),
    ...overrides,
  };
}

export function createConversationState(conversations: AssistantConversationRecord[]): AssistantConversationState {
  return { mode: "conservative", activeId: conversations[0]?.id ?? null, conversations };
}
