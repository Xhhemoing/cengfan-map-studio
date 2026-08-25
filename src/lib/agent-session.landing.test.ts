import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTransaction, createProjectDocument, type ProjectDocument } from "./project-document";
import { AgentSession } from "./agent-session";
import { documentWithHistory, readonlyHistoryView, response } from "./agent-session-test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AgentSession landing", () => {
  it("executes scene tools on a shadow copy", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "update_map", arguments: { patch: { width: 640 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "地图已缩小" })));
    const session = new AgentSession(project, { mode: "conservative" });
    const outcome = await session.run("地图小一点");
    expect(outcome.kind).toBe("finish");
    expect(session.shadowProject.map.width).toBe(640);
    expect(project.map.width).not.toBe(640);
    expect(session.landingPreview().needsConfirmation).toBe(true);
    const applied = session.transaction().apply(project);
    expect(applied.map.width).toBe(640);
    expect(applied.history).toEqual(project.history);
  });

  it("accepts map boundary clearance patches instead of rejecting them as unknown props", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "update_map", arguments: { patch: { mapBoundaryMargin: 32 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "已加大展示框安全边距" })));
    const session = new AgentSession(project, { mode: "conservative" });
    const outcome = await session.run("展示框离地图远一点");
    expect(outcome.kind).toBe("finish");
    expect(session.shadowProject.map.mapBoundaryMargin).toBe(32);
  });

  it("builds a selected-step transaction without applying deselected writes", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const originalFontSize = project.cards.fontSize;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
        { id: "call-cards", name: "update_cards", arguments: { patch: { fontSize: originalFontSize + 4 } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("调整地图和卡片");

    const transaction = session.transactionForSteps(new Set(["call-map"]));
    expect(transaction).not.toBeNull();
    const changed = transaction!.apply(project);
    expect(changed.map.scale).toBe(0.9);
    expect(changed.cards.fontSize).toBe(originalFontSize);
  });

  it("replays selected writes onto the current project without overwriting other fields", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("调整地图");

    const current = {
      ...project,
      cards: { ...project.cards, fontSize: project.cards.fontSize + 6 },
    };
    const transaction = session.transactionForSteps(new Set(["call-map"]));

    expect(transaction).not.toBeNull();
    const changed = transaction!.apply(current);
    expect(changed.map.scale).toBe(0.9);
    expect(changed.cards.fontSize).toBe(current.cards.fontSize);
  });

  it("preserves a manual edit to a different student when the AI confirms an update_fact", async () => {
    const project = createProjectDocument({
      students: [
        { id: "A", name: "甲", university: "大学", city: "广州", province: "广东", visibility: true },
        { id: "B", name: "乙", university: "大学", city: "北京", province: "北京", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-fact", name: "manage_students", arguments: { action: "update_fact", studentId: "A", fields: { city: "深圳" } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("把甲同学的城市改到深圳");

    const current = {
      ...project,
      students: project.students.map((student) => student.id === "B" ? { ...student, name: "乙改" } : student),
    };
    const transaction = session.transactionForSteps(new Set(["call-fact"]));

    expect(transaction).not.toBeNull();
    const applied = transaction!.apply(current);
    expect(applied.students).toHaveLength(2);
    expect(applied.students.find((student) => student.id === "A")?.city).toBe("深圳");
    expect(applied.students.find((student) => student.id === "B")?.name).toBe("乙改");
    expect(current.students.find((student) => student.id === "A")?.city).toBe("广州");
  });

  it("returns no selected-step transaction for an empty selection", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("调整地图");

    expect(session.transactionForSteps(new Set())).toBeNull();
  });

  it("replays selected steps in session order rather than Set insertion order", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-first", name: "update_map", arguments: { patch: { scale: 0.9 } } },
        { id: "call-second", name: "update_map", arguments: { patch: { scale: 0.8 } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("调整地图");

    const transaction = session.transactionForSteps(new Set(["call-second", "call-first"]));
    expect(transaction).not.toBeNull();
    expect(transaction!.apply(project).map.scale).toBe(0.8);
  });

  it("lands nothing and records the failure when a selected step no longer replays on the live document", async () => {
    const project = createProjectDocument({
      students: [
        { id: "A", name: "甲", university: "大学", city: "广州", province: "广东", visibility: true },
        { id: "B", name: "乙", university: "大学", city: "北京", province: "北京", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
        { id: "call-fact", name: "manage_students", arguments: { action: "update_fact", studentId: "A", fields: { city: "深圳" } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("缩小地图并把甲同学改到深圳");

    const live = { ...project, students: project.students.filter((student) => student.id !== "A") };
    const transaction = session.transactionForSteps(new Set(["call-map", "call-fact"]));
    const applied = transaction!.apply(live);

    expect(applied).toBe(live);
    expect(applied.map.scale).toBe(project.map.scale);
    expect(applied.students).toHaveLength(1);
    expect(session.lastReplayFailure).toMatchObject({ stepId: "call-fact", name: "manage_students" });
    expect(session.lastReplayFailure?.content).toContain("找不到指定学生");
    expect(session.shadowProject.map.scale).toBe(0.9);

    const partial = session.transactionForSteps(new Set(["call-map"]));
    expect(partial!.apply(live).map.scale).toBe(0.9);
    expect(session.lastReplayFailure).toBeNull();
  });

  it("lands nothing when a selected step targets a text element removed from the live document", async () => {
    const project = createProjectDocument({
      students: [],
      templateId: "original",
      dataView: "province",
      textElements: [{ id: "note-1", content: "备注", x: 40, y: 40, fontSize: 24, color: "#111111" }],
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.75 } } },
        { id: "call-text", name: "update_text", arguments: { id: "note-1", patch: { fontSize: 40 } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("放大备注");
    expect(session.shadowProject.textElements.find((element) => element.id === "note-1")?.fontSize).toBe(40);

    const live = { ...project, textElements: project.textElements.filter((element) => element.id !== "note-1") };
    const applied = session.transactionForSteps(new Set(["call-map", "call-text"]))!.apply(live);

    expect(applied).toBe(live);
    expect(applied.map.scale).toBe(project.map.scale);
    expect(session.lastReplayFailure).toMatchObject({ stepId: "call-text", name: "update_text" });
    expect(session.lastReplayFailure?.content).toContain("SCENE_TARGET_MISSING");
  });

  it("still rejects a concurrent run after a rejected landing apply", async () => {
    const project = createProjectDocument({
      students: [{ id: "A", name: "甲", university: "大学", city: "广州", province: "广东", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-fact", name: "manage_students", arguments: { action: "update_fact", studentId: "A", fields: { city: "深圳" } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("把甲同学改到深圳");

    const live = { ...project, students: [] };
    expect(session.transactionForSteps(new Set(["call-fact"]))!.apply(live)).toBe(live);

    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))));
    const running = session.continue("再试一次");
    await expect(session.run("并发")).rejects.toThrow(/进行中/);
    session.cancel();
    expect((await running).kind).toBe("cancelled");
  });

  it("lands an AI transaction through applyTransaction on a document whose history is a proxy", async () => {
    const base = createProjectDocument({
      students: [{ id: "A", name: "甲", university: "大学", city: "广州", province: "广东", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
        { id: "call-fact", name: "manage_students", arguments: { action: "update_fact", studentId: "A", fields: { city: "深圳" } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(base, { mode: "conservative" });
    await session.run("缩小地图并把甲同学改到深圳");

    const live = documentWithHistory(base);
    const transaction = session.transactionForSteps(new Set(["call-map", "call-fact"]))!;
    const landed = applyTransaction(live, transaction);

    expect(landed.map.scale).toBe(0.9);
    expect(landed.students.find((student) => student.id === "A")?.city).toBe("深圳");
    expect(landed.cards.fontSize).toBe(live.cards.fontSize);
    expect(landed.version).toBe(live.version + 1);
    expect(landed.history.past.at(-1)).toMatchObject({ id: transaction.id, source: "ai" });
    expect(session.lastReplayFailure).toBeNull();
    expect(live.map.scale).not.toBe(0.9);
    expect(live.students.find((student) => student.id === "A")?.city).toBe("广州");
    expect(() => structuredClone(landed)).not.toThrow();
  });

  it("leaves the document untouched when applyTransaction lands a rejected replay", async () => {
    const base = createProjectDocument({
      students: [
        { id: "A", name: "甲", university: "大学", city: "广州", province: "广东", visibility: true },
        { id: "B", name: "乙", university: "大学", city: "北京", province: "北京", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
        { id: "call-fact", name: "manage_students", arguments: { action: "update_fact", studentId: "A", fields: { city: "深圳" } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(base, { mode: "conservative" });
    await session.run("缩小地图并把甲同学改到深圳");

    const seeded = documentWithHistory(base);
    const live = { ...seeded, students: seeded.students.filter((student) => student.id !== "A") };
    const transaction = session.transactionForSteps(new Set(["call-map", "call-fact"]))!;
    const landed = applyTransaction(live, transaction);

    expect(landed.map).toEqual(live.map);
    expect(landed.students).toEqual(live.students);
    expect(landed.cards).toEqual(live.cards);
    expect(session.lastReplayFailure).toMatchObject({ stepId: "call-fact", name: "manage_students" });
    // The refusal reaches project-document as the input document returned by identity, so the
    // commit is skipped entirely: no version bump and no no-op entry on the undo stack.
    expect(landed).toBe(live);
    expect(landed.version).toBe(live.version);
    expect(landed.history.past).toHaveLength(live.history.past.length);
    expect(landed.history.past.at(-1)?.id).not.toBe(transaction.id);
  });

  it("clones a project whose history is a proxy instead of throwing DataCloneError", () => {
    const base = createProjectDocument({
      students: [{ id: "A", name: "甲", university: "大学", city: "广州", province: "广东", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    const seeded = documentWithHistory(base);
    const proxied: ProjectDocument = { ...seeded, history: readonlyHistoryView(seeded.history) };
    expect(() => structuredClone(proxied)).toThrow();

    const session = new AgentSession(proxied, { mode: "conservative" });
    expect(session.shadowProject.history).toEqual({ past: [], future: [] });
    expect(session.shadowProject.students).toEqual(seeded.students);
    expect(session.shadowProject.cards.fontSize).toBe(seeded.cards.fontSize);
    expect(() => structuredClone(session.shadowProject)).not.toThrow();
  });
});
