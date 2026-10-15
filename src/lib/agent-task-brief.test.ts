import { describe, expect, it } from "vitest";
import { createTaskBrief, parseTaskBrief, redactTaskBrief } from "./agent-task-brief";
import { loadAssistantConversationState, saveAssistantConversationState } from "./agent-conversation-store";
import { createConversationRecord, createConversationState, createStorageDouble, createStoreProject } from "./agent-conversation-store-test-fixtures";

describe("assistant task brief", () => {
  it("persists explicit goals and preservation requirements across project edits", () => {
    const project = createStoreProject();
    const brief = { ...createTaskBrief(), goal: "readability" as const, preserve: ["data", "positions"] as const };
    const target = createStorageDouble();
    saveAssistantConversationState(target, project, createConversationState([createConversationRecord(project, { taskBrief: { ...brief, preserve: [...brief.preserve] } })]));
    const updated = { ...project, canvas: { ...project.canvas, backgroundColor: "#ff0000" } };
    expect(loadAssistantConversationState(target, updated)?.conversations[0]?.taskBrief).toEqual(brief);
  });
  it("keeps a missing selected scope unresolved instead of broadening it", () => {
    const brief = { ...createTaskBrief(), scope: "selection" as const, selection: { type: "text" as const, id: "private-name" } };
    expect(redactTaskBrief(brief, ["private-name"])).toMatchObject({ scope: "selection", selection: null });
  });
  it("strips arbitrary properties and rejects invalid enums or oversized IDs", () => {
    expect(parseTaskBrief({ ...createTaskBrief(), goal: "__proto__" })).toBeNull();
    expect(parseTaskBrief({ ...createTaskBrief(), preserve: ["erase-roster"] })).toBeNull();
    expect(parseTaskBrief({ ...createTaskBrief(), selection: { type: "text", id: "a".repeat(300) } })).toBeNull();
    expect(parseTaskBrief({ ...createTaskBrief(), selection: { type: "cards", note: "private prompt" } })?.selection).toEqual({ type: "cards" });
  });
  it("stores safe task facts without copying freeform prompt or student values", () => {
    const project = createStoreProject([{ id: "secret-id", name: "保密姓名", university: "保密大学", city: "保密城市", province: "保密省份", visibility: true }]);
    const target = createStorageDouble();
    saveAssistantConversationState(target, project, createConversationState([createConversationRecord(project, { request: "private prompt", taskBrief: { ...createTaskBrief(), scope: "selection", selection: { type: "text", id: "secret-id" } } })]));
    expect(target.value()).not.toContain("private prompt");
    expect(target.value()).not.toContain("secret-id");
    expect(loadAssistantConversationState(target, project)?.conversations[0]?.taskBrief).toMatchObject({ scope: "selection", selection: null });
  });
  it.each(["update_cards", "auto_layout", "apply_card_style"])("never strips scopeIds from a saved %s step", (name) => {
    const project = createStoreProject(); const target = createStorageDouble();
    const record = createConversationRecord(project);
    const args = name === "update_cards" ? { patch: { fontSize: 20 }, scopeIds: ["card-safe-id"] } : name === "auto_layout" ? { scopeIds: ["card-safe-id"], preservePositions: true, goal: "balanced" } : { templateId: "ticket", scopeIds: ["card-safe-id"], mode: "visual" };
    const step = { id: "scoped", name, arguments: args, risk: "medium" as const };
    saveAssistantConversationState(target, project, createConversationState([{ ...record, steps: [step], selectedStepIds: [step.id], snapshot: { ...record.snapshot!, steps: [step] } }]));
    const persisted = JSON.parse(target.value()!) as { conversations: Array<{ steps: Array<{ arguments: { scopeIds?: string[] } }>; snapshot: { steps: Array<{ arguments: { scopeIds?: string[] } }> } }> };
    expect(persisted.conversations[0]!.steps[0]!.arguments.scopeIds).toEqual(["card-safe-id"]);
    expect(persisted.conversations[0]!.snapshot.steps[0]!.arguments.scopeIds).toEqual(["card-safe-id"]);
  });
  it("rejects a personal scope rather than retaining a global executable patch", () => {
    const project = createStoreProject([{ id: "private-card", name: "隐藏姓名", university: "学校", city: "城市", province: "省份", visibility: true }]);
    const target = createStorageDouble(); const record = createConversationRecord(project);
    const step = { id: "scoped", name: "update_cards", arguments: { patch: { fontSize: 20 }, scopeIds: ["private-card"] }, risk: "medium" as const };
    saveAssistantConversationState(target, project, createConversationState([{ ...record, steps: [step], selectedStepIds: [step.id], snapshot: { ...record.snapshot!, steps: [step] } }]));
    expect(target.value()).not.toContain("private-card");
    expect(loadAssistantConversationState(target, project)?.conversations[0]).toMatchObject({ steps: [], snapshot: null, selectedStepIds: [] });
  });
});
