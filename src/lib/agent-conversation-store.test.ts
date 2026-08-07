import { describe, expect, it, vi } from "vitest";
import { AgentSession, type AgentSessionSnapshot } from "./agent-session";
import {
  ASSISTANT_CONVERSATION_STORAGE_KEY,
  loadAssistantConversationState,
  saveAssistantConversationState,
  type AssistantConversationRecord,
  type AssistantConversationState,
} from "./agent-conversation-store";
import { createProjectDocument } from "./project-document";
import { buildProjectDigest } from "./project-digest";

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next; }),
    value: () => value,
  };
}

function record(project: ReturnType<typeof createProjectDocument>, overrides: Partial<AssistantConversationRecord> = {}): AssistantConversationRecord {
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

function state(conversations: AssistantConversationRecord[]): AssistantConversationState {
  return { mode: "conservative", activeId: conversations[0]?.id ?? null, conversations };
}

describe("agent-conversation-store", () => {
  it("round-trips bounded conversation state with a project binding", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const target = storage();
    const running = record(project, { status: "running" });

    saveAssistantConversationState(target, project, state([running]));

    expect(loadAssistantConversationState(target, project)?.conversations[0]).toMatchObject({
      status: "cancelled",
      summary: "页面刷新，任务已中止，预览未应用",
    });
  });

  it("normalizes omitted auto-layout mode for durable round-trip and replay", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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

  it("sanitizes prompts, model text, student facts, and continuation secrets before durable storage", () => {
    const project = createProjectDocument({
      students: [{ id: "student-secret-id", name: "学生秘密姓名", university: "秘密大学", city: "秘密城市", province: "秘密省份", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    const target = storage();
    const source = record(project, {
      title: "用户提示中的秘密标题",
      request: "用户提示 SECRET_PROMPT",
      summary: "模型输出 SECRET_ASSISTANT_TEXT",
      error: "原始错误 SECRET_RAW_OUTPUT",
      steps: [
        { id: "safe-step", name: "update_map", arguments: { patch: { scale: 0.9 } }, risk: "low" },
        { id: "student-step", name: "manage_students", arguments: { action: "update_fact", studentId: "student-secret-id", fields: { name: "学生秘密姓名", university: "秘密大学", city: "秘密城市" } }, risk: "high" },
      ],
      selectedStepIds: ["safe-step", "student-step"],
      snapshot: {
        ...new AgentSession(project, { mode: "conservative" }).exportSnapshot(),
        conversation: [
          { role: "user", content: "用户提示 SECRET_PROMPT" },
          { role: "assistant", content: "模型输出 SECRET_ASSISTANT_TEXT" },
        ],
        steps: [
          { id: "safe-step", name: "update_map", arguments: { patch: { scale: 0.9 } }, risk: "low" },
          { id: "student-step", name: "manage_students", arguments: { action: "update_fact", studentId: "student-secret-id", fields: { name: "学生秘密姓名" } }, risk: "high" },
        ],
      },
    });

    saveAssistantConversationState(target, project, state([source]));

    const serialized = target.value()!;
    for (const forbidden of ["用户提示 SECRET_PROMPT", "模型输出 SECRET_ASSISTANT_TEXT", "学生秘密姓名", "秘密大学", "秘密城市", "student-secret-id", "SECRET_RAW_OUTPUT"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toContain("manage_students");
    expect(serialized).not.toContain("safe-step");
  });

  it.each([
    { projectMatches: true, label: "matching" },
    { projectMatches: false, label: "mismatching" },
  ])("normalizes a completed snapshot:null conversation to a non-continuable failed state ($label project)", ({ projectMatches }) => {
    const original = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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

  it("rejects recursive URLs and suspicious factual keys even on otherwise safe tools", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const target = storage();
    const snapshot = new AgentSession(project, { mode: "conservative" }).exportSnapshot();
    const unsafeStep = {
      id: "recursive-unsafe",
      name: "update_map",
      arguments: { patch: { heatScale: { min: 0, max: 1, note: "https://private.example" }, title: 42 } },
      risk: "low" as const,
    };
    saveAssistantConversationState(target, project, state([record(project, { steps: [unsafeStep], selectedStepIds: [unsafeStep.id], snapshot: { ...snapshot, steps: [unsafeStep] } })]));

    const serialized = target.value()!;
    expect(serialized).not.toContain("private.example");
    expect(serialized).not.toContain('"title":42');
    expect(loadAssistantConversationState(target, project)?.conversations[0]).toMatchObject({ status: "failed", steps: [], selectedStepIds: [], snapshot: null });
  });

  it.each([
    {
      tool: "update_canvas",
      arguments: { patch: { backgroundImageSrc: "data:image/png;base64,CANVAS_PRIVATE_DATA" } },
      forbidden: "CANVAS_PRIVATE_DATA",
    },
    {
      tool: "update_guests",
      arguments: { patch: { people: [{ name: "GUEST_PERSONAL_NAME", avatar: "blob:GUEST_AVATAR" }], content: "GUEST_PRIVATE_TEXT" } },
      forbidden: "GUEST_PERSONAL_NAME",
    },
    {
      tool: "update_text",
      arguments: { id: "text-private", patch: { content: "TEXT_PRIVATE_CONTENT" } },
      forbidden: "TEXT_PRIVATE_CONTENT",
    },
    {
      tool: "update_asset",
      arguments: { id: "asset-private", patch: { assetId: "PRIVATE_ASSET_ID", src: "https://private.example/upload" } },
      forbidden: "PRIVATE_ASSET_ID",
    },
    {
      tool: "update_province",
      arguments: { province: "PRIVATE_PROVINCE", patch: { appearance: { assetId: "PRIVATE_PROVINCE_ASSET" }, textureSrc: "data:image/png;base64,PROVINCE_PRIVATE_DATA" } },
      forbidden: "PRIVATE_PROVINCE_ASSET",
    },
  ])("does not persist sensitive replay arguments for $tool", ({ tool, arguments: args, forbidden }) => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const target = storage();
    const snapshot = new AgentSession(project, { mode: "conservative" }).exportSnapshot();
    const unsafeStep = { id: `unsafe-${tool}`, name: tool, arguments: args, risk: "low" as const };
    saveAssistantConversationState(target, project, state([record(project, {
      steps: [unsafeStep],
      selectedStepIds: [unsafeStep.id],
      snapshot: { ...snapshot, steps: [unsafeStep] },
    })]));

    const serialized = target.value()!;
    const loaded = loadAssistantConversationState(target, project)?.conversations[0];

    expect(serialized).not.toContain(forbidden);
    expect(serialized).not.toMatch(/(?:data:|blob:|https?:)/);
    expect(loaded).toMatchObject({ status: "failed", steps: [], selectedStepIds: [], snapshot: null });
  });

  it("persists safe boolean and numeric style fields", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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

  it("rebuilds safe update arguments without persisting adversarial top-level values", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const target = storage();
    const snapshot = new AgentSession(project, { mode: "conservative" }).exportSnapshot();
    const wrappedStep = {
      id: "safe-wrapped-patch",
      name: "update_map",
      arguments: {
        patch: { scale: 0.9 },
        privateNote: "PRIVATE_NOTE",
        studentName: "PRIVATE_STUDENT_NAME",
        dataUrl: "data:image/png;base64,PRIVATE_DATA_URL",
      },
      risk: "low" as const,
    };
    const directStep = {
      id: "safe-direct-patch",
      name: "update_canvas",
      arguments: {
        width: 900,
        privateNote: "PRIVATE_DIRECT_NOTE",
        studentName: "PRIVATE_DIRECT_STUDENT_NAME",
        dataUrl: "data:image/png;base64,PRIVATE_DIRECT_DATA_URL",
      },
      risk: "low" as const,
    };
    saveAssistantConversationState(target, project, state([record(project, {
      steps: [wrappedStep, directStep],
      selectedStepIds: [wrappedStep.id, directStep.id],
      snapshot: { ...snapshot, steps: [wrappedStep, directStep] },
    })]));

    const serialized = target.value()!;
    for (const forbidden of ["PRIVATE_NOTE", "PRIVATE_STUDENT_NAME", "PRIVATE_DATA_URL", "PRIVATE_DIRECT_NOTE", "PRIVATE_DIRECT_STUDENT_NAME", "PRIVATE_DIRECT_DATA_URL"]) {
      expect(serialized).not.toContain(forbidden);
    }
    const loaded = loadAssistantConversationState(target, project)?.conversations[0];
    expect(loaded).toMatchObject({ status: "completed", selectedStepIds: [wrappedStep.id, directStep.id] });
    expect(loaded?.snapshot?.steps.map((step) => step.arguments)).toEqual([{ patch: { scale: 0.9 } }, { width: 900 }]);

    const restored = AgentSession.restore(project, loaded!.snapshot!, { mode: "conservative" });
    expect(restored.shadowProject.map.scale).toBe(0.9);
    expect(restored.shadowProject.canvas.width).toBe(900);
  });

  it("rejects unrecognized fields on otherwise safe operations", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const target = storage();
    const snapshot = new AgentSession(project, { mode: "conservative" }).exportSnapshot();
    const unsafeStep = {
      id: "hidden-unsafe",
      name: "set_data_view",
      arguments: { view: "province", note: "PERSONAL_TEXT" },
      risk: "low" as const,
    };
    saveAssistantConversationState(target, project, state([record(project, { steps: [unsafeStep], selectedStepIds: [unsafeStep.id], snapshot: { ...snapshot, steps: [unsafeStep] } })]));

    expect(target.value()).not.toContain("PERSONAL_TEXT");
    expect(loadAssistantConversationState(target, project)?.conversations[0]).toMatchObject({ status: "failed", steps: [], selectedStepIds: [], snapshot: null });
  });

  it("preserves only textual history when the project binding changes", () => {
    const original = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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
    const original = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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

  it("rejects valid JSON payloads over the serialized storage limit", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const invalidSnapshot = { schemaVersion: 2 } as unknown as AgentSessionSnapshot;
    expect(() => AgentSession.restore(project, invalidSnapshot, { mode: "conservative" })).toThrow();

    const target = storage();
    const huge = record(project, { title: "x".repeat(300 * 1024) });
    saveAssistantConversationState(target, project, state([huge]));
    expect(target.setItem).not.toHaveBeenCalled();
  });
});
