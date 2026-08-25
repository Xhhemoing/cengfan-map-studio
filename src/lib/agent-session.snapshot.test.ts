import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./project-document";
import { AgentReplayError, AgentSession, type AgentSessionSnapshot } from "./agent-session";
import { response } from "./agent-session-test-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AgentSession snapshots", () => {
  it("exports only replay data and restores it by replaying on the current project", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "snapshot-step", name: "update_map", arguments: { patch: { width: 640 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const source = new AgentSession(project, { mode: "conservative" });
    await source.run("调整地图");

    const snapshot = source.exportSnapshot();
    const restored = AgentSession.restore(project, snapshot, { mode: "conservative" });
    expect(snapshot).not.toHaveProperty("shadowProject");
    expect(snapshot).not.toHaveProperty("budget");
    expect(snapshot).not.toHaveProperty("taskId");
    expect(snapshot).not.toHaveProperty("budgetReceipt");
    expect(snapshot.conversation).toEqual([{ role: "user", content: "调整地图" }]);
    expect(snapshot.steps[0]?.arguments).toEqual({ patch: { width: 640 } });
    expect(snapshot.steps[0]).not.toHaveProperty("result");
    expect(restored.shadowProject.map.width).toBe(640);
    expect(restored.steps[0]?.arguments).toEqual({ patch: { width: 640 } });
    expect(restored.canContinue).toBe(true);
    expect(() => AgentSession.restore(project, { ...snapshot, schemaVersion: 3 } as unknown as AgentSessionSnapshot, { mode: "conservative" })).toThrow();
  });

  it("does not restore active execution state", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { release = () => resolve(response({ kind: "finish", summary: "完成" })); })));
    const source = new AgentSession(project, { mode: "conservative" });
    const running = source.run("执行");
    const snapshot = source.exportSnapshot();
    const restored = AgentSession.restore(project, snapshot, { mode: "conservative" });
    release();
    await running;
    expect(restored.canContinue).toBe(false);
    expect(restored.steps).toEqual([]);
  });

  it.each([
    { rounds: -1 },
    { rounds: 1.5 },
    { usedTokens: -1 },
    { usedTokens: 1.5 },
  ])("rejects invalid metric values in a snapshot: %o", (metrics) => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const snapshot = new AgentSession(project, { mode: "conservative" }).exportSnapshot();
    expect(() => AgentSession.restore(project, { ...snapshot, metrics: { ...snapshot.metrics, ...metrics } }, { mode: "conservative" })).toThrow();
  });

  it("keeps shadow and live state consistent across exportSnapshot and restore after a rejected apply", async () => {
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
    await session.run("把甲同学改到深圳");

    const live = { ...project, students: project.students.filter((student) => student.id !== "A") };
    expect(session.transactionForSteps(new Set(["call-fact"]))!.apply(live)).toBe(live);
    expect(session.lastReplayFailure).not.toBeNull();

    const snapshot = session.exportSnapshot();
    expect(snapshot.steps.map((step) => step.id)).toEqual(["call-fact"]);
    expect(session.shadowProject.students.find((student) => student.id === "A")?.city).toBe("深圳");
    expect(project.students.find((student) => student.id === "A")?.city).toBe("广州");

    const restored = AgentSession.restore(project, snapshot, { mode: "conservative" });
    expect(restored.shadowProject.students.find((student) => student.id === "A")?.city).toBe("深圳");
    expect(restored.lastReplayFailure).toBeNull();

    const failure = (() => {
      try {
        AgentSession.restore(live, snapshot, { mode: "conservative" });
        return null;
      } catch (cause) {
        return cause;
      }
    })();
    expect(failure).toBeInstanceOf(AgentReplayError);
    expect((failure as AgentReplayError).failure).toMatchObject({ stepId: "call-fact", name: "manage_students" });
    expect(live.students).toHaveLength(1);
  });
});
