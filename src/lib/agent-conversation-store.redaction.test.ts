import { describe, expect, it } from "vitest";
import { AgentSession } from "./agent-session";
import {
  loadAssistantConversationState,
  saveAssistantConversationState,
} from "./agent-conversation-store";
import {
  createConversationRecord as record,
  createConversationState as state,
  createStorageDouble as storage,
  createStoreProject,
} from "./agent-conversation-store-test-fixtures";

describe("agent-conversation-store redaction", () => {
  it("sanitizes prompts, model text, student facts, and continuation secrets before durable storage", () => {
    const project = createStoreProject([
      { id: "student-secret-id", name: "学生秘密姓名", university: "秘密大学", city: "秘密城市", province: "秘密省份", visibility: true },
    ]);
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

  it("rejects recursive URLs and suspicious factual keys even on otherwise safe tools", () => {
    const project = createStoreProject();
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
    const project = createStoreProject();
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

  it("rebuilds safe update arguments without persisting adversarial top-level values", () => {
    const project = createStoreProject();
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
    const project = createStoreProject();
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
});
