import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { buildCardFacts } from "./render-facts";
import { AgentSession, compactAgentToolResult, type AgentSessionSnapshot } from "./agent-session";
import type { ProjectDigest } from "./project-digest";

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/** 取第 index 次 agent 请求体里的 digest，用来断言分层。 */
function requestDigest(fetchMock: { mock: { calls: unknown[][] } }, index: number): ProjectDigest {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit;
  return (JSON.parse(String(init.body)) as { digest: ProjectDigest }).digest;
}

/** 取第 index 次 agent 请求体里与分层无关的 full 层指纹。 */
function requestDigestFingerprint(fetchMock: { mock: { calls: unknown[][] } }, index: number): string | undefined {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit;
  return (JSON.parse(String(init.body)) as { digestFingerprint?: string }).digestFingerprint;
}

/** 一份带学生与文案的工程：full 层会投影卡片方位与文本明细，core 层应把它们裁空。 */
function digestLayerProject(): ProjectDocument {
  const project = createProjectDocument({
    students: ["广东省", "浙江省", "北京市"].flatMap((province, provinceIndex) => Array.from({ length: 3 - provinceIndex }, (_, index) => ({
      id: `s-${province}-${index}`,
      name: `同学${index}`,
      university: `${province}大学`,
      city: `${province}城市${index}`,
      province,
      visibility: true,
    }))),
    templateId: "original",
    dataView: "province",
  });
  return {
    ...project,
    textElements: [{
      id: "text-0", role: "custom", content: "毕业去向速览", x: 40, y: 40,
      fontSize: 18, color: "#000000", fontWeight: 400, textAlign: "left", maxWidth: 320, visibility: true,
    }],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("AgentSession", () => {
  it("exports only replay data and restores it by replaying on the current project", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", taskId: "task-snapshot", budgetReceipt: "v1.receipt.snapshot", calls: [{ id: "snapshot-step", name: "update_map", arguments: { patch: { width: 640 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-snapshot", budgetReceipt: "v1.receipt.snapshot", summary: "完成" })));
    const source = new AgentSession(project, { mode: "conservative" });
    await source.run("调整地图");

    const snapshot = source.exportSnapshot();
    const restored = AgentSession.restore(project, snapshot, { mode: "conservative" });
    expect(snapshot).not.toHaveProperty("shadowProject");
    expect(snapshot).not.toHaveProperty("budget");
    expect(snapshot.schemaVersion).toBe(3);
    expect(snapshot.taskId).toBe("task-snapshot");
    expect(snapshot.budgetReceipt).toBe("v1.receipt.snapshot");
    expect(snapshot.conversation).toEqual([{ role: "user", content: "调整地图" }, { role: "assistant", content: "完成" }]);
    expect(snapshot.steps[0]?.arguments).toEqual({ patch: { width: 640 } });
    expect(snapshot.steps[0]).not.toHaveProperty("result");
    expect(restored.shadowProject.map.width).toBe(640);
    expect(restored.steps[0]?.arguments).toEqual({ patch: { width: 640 } });
    expect(restored.canContinue).toBe(true);
    expect(() => AgentSession.restore(project, { ...snapshot, schemaVersion: 4 } as unknown as AgentSessionSnapshot, { mode: "conservative" })).toThrow();
  });

  it("sends the restored task id and budget receipt when continuing an exported session", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", taskId: "task-continue", budgetReceipt: "v1.receipt.first", calls: [{ id: "first-step", name: "update_map", arguments: { patch: { width: 640 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-continue", budgetReceipt: "v1.receipt.second", summary: "第一轮完成" }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-continue", budgetReceipt: "v1.receipt.third", summary: "继续完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const source = new AgentSession(project, { mode: "conservative" });
    await source.run("调整地图");

    const restored = AgentSession.restore(project, source.exportSnapshot(), { mode: "conservative" });
    expect(restored.canContinue).toBe(true);
    expect((await restored.continue("再小一点")).kind).toBe("finish");

    const continuationBody = JSON.parse(String(((fetchMock.mock.calls.at(-1) as unknown[])[1] as RequestInit).body)) as Record<string, unknown>;
    expect(continuationBody.taskId).toBe("task-continue");
    expect(continuationBody.budgetReceipt).toBe("v1.receipt.second");
    // 预算由服务端回执决定，客户端镜像已经从请求体里去掉。
    expect(continuationBody).not.toHaveProperty("budget");
    expect(restored.exportSnapshot().budgetReceipt).toBe("v1.receipt.third");
  });

  it("keeps the finish summary in the conversation and replays it after a restore", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-summary", budgetReceipt: "v1.receipt.first", summary: "地图已缩小到 0.85" }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-summary", budgetReceipt: "v1.receipt.second", summary: "继续完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图小一点");

    const snapshot = session.exportSnapshot();
    expect(snapshot.conversation).toEqual([
      { role: "user", content: "地图小一点" },
      { role: "assistant", content: "地图已缩小到 0.85" },
    ]);

    const restored = AgentSession.restore(project, snapshot, { mode: "conservative" });
    await restored.continue("再小一点");
    const continuation = JSON.parse(String(((fetchMock.mock.calls.at(-1) as unknown[])[1] as RequestInit).body)) as { messages: Array<{ role: string; content?: string }> };
    // 模型必须看得到自己上一轮答过什么，否则续聊窗口只剩一串用户提问。
    expect(continuation.messages).toEqual([
      { role: "user", content: "地图小一点" },
      { role: "assistant", content: "地图已缩小到 0.85" },
      { role: "user", content: "再小一点" },
    ]);
  });

  it("keeps the snapshot exportable after many continuations add finish summaries", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn().mockImplementation(async () => response({
      kind: "finish",
      taskId: "task-many",
      budgetReceipt: `v1.receipt.${fetchMock.mock.calls.length}`,
      summary: `第 ${fetchMock.mock.calls.length} 轮完成`,
    }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("第 1 次");
    for (let index = 2; index <= 30; index += 1) await session.continue(`第 ${index} 次`);

    const snapshot = session.exportSnapshot();
    expect(() => session.exportSnapshot()).not.toThrow();
    expect(snapshot.conversation.length).toBeLessThanOrEqual(24);
    expect(snapshot.conversation.filter((message) => message.role === "assistant").length).toBeGreaterThan(0);
    expect(snapshot.conversation.at(-1)).toEqual({ role: "assistant", content: "第 30 轮完成" });
  });

  it("restores a v2 snapshot read-only and refuses to continue it without a receipt", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", taskId: "task-legacy", budgetReceipt: "v1.receipt.legacy", calls: [{ id: "legacy-step", name: "update_map", arguments: { patch: { width: 640 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-legacy", budgetReceipt: "v1.receipt.legacy", summary: "完成" })));
    const source = new AgentSession(project, { mode: "conservative" });
    await source.run("调整地图");
    const { taskId: _taskId, budgetReceipt: _budgetReceipt, ...v2Snapshot } = source.exportSnapshot();

    const restored = AgentSession.restore(project, { ...v2Snapshot, schemaVersion: 2 }, { mode: "conservative" });
    expect(restored.shadowProject.map.width).toBe(640);
    expect(restored.steps[0]?.arguments).toEqual({ patch: { width: 640 } });
    expect(restored.canContinue).toBe(false);
    await expect(restored.continue("再小一点")).rejects.toThrow(/不能继续/);
    expect(restored.exportSnapshot()).not.toHaveProperty("budgetReceipt");
  });

  it.each([
    { label: "v2 携带回执", snapshot: { schemaVersion: 2, taskId: "task-1", budgetReceipt: "v1.receipt" } },
    { label: "taskId 非法", snapshot: { taskId: "task id 带空格", budgetReceipt: "v1.receipt" } },
    { label: "回执过长", snapshot: { taskId: "task-1", budgetReceipt: "r".repeat(2049) } },
  ])("rejects an invalid continuation credential in a snapshot: $label", ({ snapshot: invalid }) => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const snapshot = new AgentSession(project, { mode: "conservative" }).exportSnapshot();
    expect(() => AgentSession.restore(project, { ...snapshot, ...invalid } as AgentSessionSnapshot, { mode: "conservative" })).toThrow();
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

  it("passes an abort signal and cancel preserves preview without committing", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }));
    const session = new AgentSession(project, { mode: "conservative" });
    const running = session.run("地图小一点");
    session.cancel();
    const outcome = await running;
    expect(signal?.aborted).toBe(true);
    expect(outcome.kind).toBe("cancelled");
    expect(session.steps).toHaveLength(0);
  });

  it("returns cancelled without fetching when the external signal is already aborted", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    const outcome = await new AgentSession(project, { mode: "conservative" }).run("地图小一点", { signal: controller.signal });

    expect(outcome).toEqual({ kind: "cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("compacts large tool results before sending them back to the server", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "auto_layout", arguments: {} }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("自动排版");
    const request = JSON.parse(String((fetchMock.mock.calls[1] as unknown[])[1] && ((fetchMock.mock.calls[1] as unknown[])[1] as RequestInit).body));
    const toolMessage = request.messages.find((message: { role: string }) => message.role === "tool");
    expect(JSON.stringify(toolMessage).length).toBeLessThanOrEqual(16 * 1024);
    expect(toolMessage.content).not.toContain("placements");
  });

  it("always returns valid JSON within the UTF-8 tool-result budget", () => {
    const compacted = compactAgentToolResult("generic", JSON.stringify({ text: "界".repeat(20000) }));
    expect(() => JSON.parse(compacted)).not.toThrow();
    expect(new TextEncoder().encode(compacted).byteLength).toBeLessThanOrEqual(16 * 1024);
    const invalid = compactAgentToolResult("generic", "not json");
    expect(() => JSON.parse(invalid)).not.toThrow();
    expect(new TextEncoder().encode(invalid).byteLength).toBeLessThanOrEqual(16 * 1024);
  });

  it.each([
    [429, "请求过于频繁，请稍后重试。"],
    [400, "请求内容未通过校验"],
    [502, "AI 服务暂时不可用"],
    [503, "AI 服务暂时不可用"],
  ])("maps structured HTTP %s errors to actionable Chinese text", async (status, expected) => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ error: { code: status === 400 ? "AI_VALIDATION_ERROR" : status === 429 ? "AI_RATE_LIMITED" : "AI_UPSTREAM_UNAVAILABLE", message: "结构化错误" } }) }));
    const session = new AgentSession(project, { mode: "conservative" });
    await expect(session.run("地图小一点")).resolves.toMatchObject({ kind: "failed", error: expect.stringContaining(expected) });
  });

  it("marks a session unusable for continuation once the server reports an expired receipt", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-ttl", budgetReceipt: "v1.receipt.ttl", summary: "第一轮完成" }))
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { code: "AI_RECEIPT_EXPIRED", message: "会话预算回执已过期或已被使用，请新开一个 AI 任务" } }) });
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图小一点");
    expect(session.canContinue).toBe(true);
    await expect(session.continue("再小一点")).resolves.toMatchObject({ kind: "failed", error: expect.stringContaining("会话预算回执已过期或已被使用") });
    // 过期后不能再续聊，调用方只能新开任务。
    expect(session.canContinue).toBe(false);
  });

  it("pops the pending question after a transient continuation failure and keeps the session continuable", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-retry", budgetReceipt: "v1.receipt.first", summary: "第一轮完成" }))
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: { code: "AI_UPSTREAM_UNAVAILABLE", message: "上游不可用" } }) })
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-retry", budgetReceipt: "v1.receipt.second", summary: "重试完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图小一点");

    await expect(session.continue("再小一点")).resolves.toMatchObject({ kind: "failed", error: expect.stringContaining("AI 服务暂时不可用") });
    // 瞬时失败不改会话状态：仍可续聊，且历史里不能留下这条没被回答的提问。
    expect(session.canContinue).toBe(true);
    expect(session.exportSnapshot().conversation).toEqual([
      { role: "user", content: "地图小一点" },
      { role: "assistant", content: "第一轮完成" },
    ]);

    await expect(session.continue("再小一点")).resolves.toMatchObject({ kind: "finish", summary: "重试完成" });
    const retryBody = JSON.parse(String(((fetchMock.mock.calls[2] as unknown[])[1] as RequestInit).body)) as { taskId?: string; budgetReceipt?: string; messages: Array<{ role: string; content: string }> };
    expect(retryBody.taskId).toBe("task-retry");
    expect(retryBody.budgetReceipt).toBe("v1.receipt.first");
    expect(retryBody.messages).toEqual([
      { role: "user", content: "地图小一点" },
      { role: "assistant", content: "第一轮完成" },
      { role: "user", content: "再小一点" },
    ]);
  });

  it("pops the pending question and stops continuation when the receipt expires", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-expired", budgetReceipt: "v1.receipt.expired", summary: "第一轮完成" }))
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { code: "AI_RECEIPT_EXPIRED", message: "回执已过期" } }) }));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图小一点");
    await expect(session.continue("再小一点")).resolves.toMatchObject({ kind: "failed" });

    expect(session.canContinue).toBe(false);
    expect(session.exportSnapshot().conversation).toEqual([
      { role: "user", content: "地图小一点" },
      { role: "assistant", content: "第一轮完成" },
    ]);
    await expect(session.continue("再试一次")).rejects.toThrow("当前会话不能继续");
  });

  it("aborts a hung round after the client timeout", async () => {
    vi.useFakeTimers();
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))));
    const session = new AgentSession(project, { mode: "conservative" });
    const running = session.run("地图小一点");
    await vi.runOnlyPendingTimersAsync();
    await expect(running).resolves.toMatchObject({ kind: "failed", error: "AI 请求超时，请稍后重试。" });
  });

  it("does not append orphan tool messages after a server-side tool rejection", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-rejected", error: "工具无效", assistantMessage: { role: "assistant", content: "模型工具调用未通过校验" } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "已纠正" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图小一点");
    const request = JSON.parse(String((fetchMock.mock.calls[1] as unknown[])[1] && ((fetchMock.mock.calls[1] as unknown[])[1] as RequestInit).body));
    expect(request.messages.some((entry: { role: string }) => entry.role === "tool")).toBe(false);
    expect(request.messages.at(-1)).toMatchObject({ role: "user" });
  });

  it("compacts a 13-round conversation without isolating tools and keeps four complete recent groups", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: Array<{ role: string; tool_calls?: Array<{ id: string }>; tool_call_id?: string }> };
      if (fetchMock.mock.calls.length <= 13) return response({ kind: "tool-call", calls: [{ id: `round-${fetchMock.mock.calls.length}`, name: "update_map", arguments: { patch: { width: 640 } } }], assistantMessage: { role: "assistant", content: null, tool_calls: [{ id: `round-${fetchMock.mock.calls.length}`, type: "function", function: { name: "update_map", arguments: "{}" } }] } });
      const ids = body.messages.filter((entry) => entry.role === "assistant" && entry.tool_calls).flatMap((entry) => entry.tool_calls!.map((call) => call.id));
      expect(ids).toEqual(expect.arrayContaining(["round-10", "round-11", "round-12", "round-13"]));
      for (let index = 0; index < body.messages.length; index += 1) if (body.messages[index]?.role === "tool") expect(body.messages[index - 1]?.role).toBe("assistant");
      return response({ kind: "finish", summary: "完成" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await new AgentSession(project, { mode: "conservative" }).run("继续");
  });

  it("compacts older conversation entries before exceeding the history cap", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: Array<{ role: string; content?: string; tool_calls?: Array<{ id: string }>; tool_call_id?: string }> };
      const callNumber = fetchMock.mock.calls.length;
      if (callNumber < 13) return response({ kind: "tool-call", calls: [{ id: `c${callNumber}`, name: "update_map", arguments: { patch: { width: 640 + callNumber } } }], assistantMessage: { role: "assistant", content: null, tool_calls: [{ id: `c${callNumber}`, type: "function", function: { name: "update_map", arguments: "{}" } }] } });
      expect(body.messages.length).toBeLessThanOrEqual(24);
      expect(body.messages.some((message) => message.content?.includes("会话摘要"))).toBe(true);
      expect(body.messages.some((message) => message.role === "assistant" && message.tool_calls?.some((call) => call.id === "c12"))).toBe(true);
      for (let index = 0; index < body.messages.length; index += 1) {
        const message = body.messages[index];
        if (message.role !== "tool") continue;
        expect(body.messages[index - 1]?.role).toBe("assistant");
        expect(body.messages[index - 1]?.tool_calls?.some((call) => call.id === message.tool_call_id)).toBe(true);
      }
      return response({ kind: "finish", summary: "完成" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图小一点");
  });

  it("compacts a long user-only continuation history and keeps at most 24 messages", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: Array<{ role: string; content?: string }> };
      expect(body.messages.length).toBeLessThanOrEqual(24);
      if (fetchMock.mock.calls.length <= 81) return response({ kind: "finish", summary: "本轮完成" });
      return response({ kind: "finish", summary: "完成" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("第 1 次");
    for (let index = 2; index <= 81; index += 1) await session.continue(`第 ${index} 次`);

    const lastRequest = JSON.parse(String((fetchMock.mock.calls.at(-1) as unknown[])[1] && ((fetchMock.mock.calls.at(-1) as unknown[])[1] as RequestInit).body)) as { messages: Array<{ role: string; content?: string }> };
    expect(lastRequest.messages).toHaveLength(24);
    expect(lastRequest.messages.some((message) => message.content?.includes("会话摘要"))).toBe(true);
    expect(lastRequest.messages.filter((message) => message.role === "user").length).toBeGreaterThan(0);
  });

  it("keeps the latest complete assistant/tool group when compacting history", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: Array<{ role: string; tool_calls?: Array<{ id: string }>; tool_call_id?: string }> };
      const callNumber = fetchMock.mock.calls.length;
      if (callNumber <= 12) {
        return response({ kind: "tool-call", calls: [{ id: `group-${callNumber}`, name: "update_map", arguments: { patch: { width: 640 + callNumber } } }], assistantMessage: { role: "assistant", content: null, tool_calls: [{ id: `group-${callNumber}`, type: "function", function: { name: "update_map", arguments: "{}" } }] } });
      }
      const assistantIndex = body.messages.findIndex((message) => message.role === "assistant" && message.tool_calls?.some((call) => call.id === "group-12"));
      expect(body.messages.some((message) => message.role === "assistant" && message.tool_calls?.some((call) => call.id === "group-11"))).toBe(true);
      expect(assistantIndex).toBeGreaterThan(-1);
      expect(body.messages[assistantIndex + 1]).toMatchObject({ role: "tool", tool_call_id: "group-12" });
      return response({ kind: "finish", summary: "完成" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图小一点");
  });

  it("rejects empty, non-string, null, and overlong client-side update_fact values", async () => {
    for (const value of ["", "   ", 1, {}, null, "a".repeat(201)]) {
      const project = createProjectDocument({ students: [{ id: "s1", name: "张三", university: "大学", city: "广州", province: "广东", visibility: true }], templateId: "original", dataView: "province" });
      vi.stubGlobal("fetch", vi.fn()
        .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "manage_students", arguments: { action: "update_fact", studentId: "s1", fields: { city: value } } }], assistantMessage: { role: "assistant", content: null } }))
        .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
      const session = new AgentSession(project, { mode: "conservative" });
      await session.run("修改事实");
      expect(session.shadowProject.students[0]?.city).toBe("广州");
      expect(session.steps[0]?.result.content).toContain("TOOL_ARGUMENTS_INVALID");
    }
  });

  it("rejects client-side update_fact fields and does not mutate the shadow", async () => {
    const project = createProjectDocument({ students: [{ id: "s1", name: "张三", university: "大学", city: "广州", province: "广东", visibility: true }], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "manage_students", arguments: { action: "update_fact", studentId: "s1", fields: { province: "北京" } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("修改事实");
    expect(session.shadowProject.students[0]?.province).toBe("广东");
    expect(session.steps[0]?.result.content).toContain("TOOL_ARGUMENTS_INVALID");
  });

  it.each([
    { tool: "update_text", args: { id: "text-missing", patch: { content: "新标题" } } },
    { tool: "update_asset", args: { id: "asset-missing", patch: { x: 10 } } },
  ])("rejects a hallucinated $tool target without touching the shadow", async ({ tool, args }) => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: tool, arguments: args }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("改一个不存在的元素");

    expect(session.steps[0]?.result.ok).toBe(false);
    expect(session.steps[0]?.result.content).toContain("TARGET_NOT_FOUND");
    expect(session.steps[0]?.result.content).toContain("availableIds");
    expect(session.shadowProject.textElements).toEqual(project.textElements);
    expect(session.shadowProject.assetElements).toEqual(project.assetElements);
  });

  it("rejects an unknown province instead of writing an unrenderable province style", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "update_province", arguments: { province: "梦游省", patch: { fill: "#ff0000" } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("把梦游省涂红");

    expect(session.steps[0]?.result.ok).toBe(false);
    expect(session.steps[0]?.result.content).toContain("availableProvinces");
    expect(session.shadowProject.map.provinceStyles?.["梦游省"]).toBeUndefined();
  });

  it("writes a province style under its canonical map name", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "update_province", arguments: { province: "广东", patch: { fill: "#ff0000" } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("把广东涂红");

    expect(session.steps[0]?.result.ok).toBe(true);
    expect(session.shadowProject.map.provinceStyles?.["广东省"]?.fill).toBe("#ff0000");
  });

  it("reads scene values that the digest does not project", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const source = { ...project, cards: { ...project.cards, padding: 17, connectorColor: "#123456" } };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "c1", name: "inspect_project", arguments: { path: "cards.padding" } },
        { id: "c2", name: "inspect_project", arguments: { path: "cards.connectorColor" } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(source, { mode: "conservative" });
    await session.run("卡片内边距是多少");

    expect(JSON.parse(session.steps[0]!.result.content)).toMatchObject({ ok: true, path: "cards.padding", value: 17 });
    expect(JSON.parse(session.steps[1]!.result.content)).toMatchObject({ value: "#123456" });
  });

  it("sends the full digest on the first turn and only the core digest when continuing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-layer", budgetReceipt: "v1.receipt.first", summary: "第一轮完成" }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-layer", budgetReceipt: "v1.receipt.second", summary: "续聊完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(digestLayerProject(), { mode: "conservative" });
    await session.run("先看看现状");
    await session.continue("再把地图调小一点");

    const first = requestDigest(fetchMock, 0);
    const second = requestDigest(fetchMock, 1);
    // 首轮建立上下文：明细必须在场，否则模型没有可对齐的方位与文案。
    expect(first.layer).toBe("full");
    expect(first.layout.cardBlocks.length).toBeGreaterThan(0);
    expect(first.textElements.length).toBeGreaterThan(0);
    // 续聊只发统计与关键几何，明细整段裁掉，但分层标记与总数留着供模型判断「裁了」而非「没有」。
    expect(second.layer).toBe("core");
    expect(second.layout.cardBlocks).toEqual([]);
    expect(second.layout.cardBlockCount).toBe(first.layout.cardBlockCount);
    expect(second.layout.cardBlockCount).toBeGreaterThan(0);
    expect(second.textElements).toEqual([]);
    expect(second.assetElements).toEqual([]);
    expect(second.students).toEqual(first.students);
    expect(second.layout.mapContentBounds).toEqual(first.layout.mapContentBounds);
    expect(second.textElementCount).toBe(first.textElementCount);
    expect(JSON.stringify(second).length).toBeLessThan(JSON.stringify(first).length);
  });

  it("sends a layer-independent digest fingerprint so the server can dedupe across full→core", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-fingerprint", budgetReceipt: "v1.receipt.first", summary: "第一轮完成" }))
      .mockResolvedValueOnce(response({ kind: "tool-call", taskId: "task-fingerprint", budgetReceipt: "v1.receipt.second", calls: [
        { id: "c1", name: "update_map", arguments: { patch: { scale: 0.5 } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-fingerprint", budgetReceipt: "v1.receipt.third", summary: "续聊完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(digestLayerProject(), { mode: "conservative" });
    await session.run("先看看现状");
    await session.continue("再把地图调小一点");

    const first = requestDigestFingerprint(fetchMock, 0);
    const second = requestDigestFingerprint(fetchMock, 1);
    const third = requestDigestFingerprint(fetchMock, 2);
    expect(first).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    // 首轮发 full、续聊发 core，工程没变，指纹必须一样，服务端才能命中短声明。
    expect(requestDigest(fetchMock, 0).layer).toBe("full");
    expect(requestDigest(fetchMock, 1).layer).toBe("core");
    expect(second).toBe(first);
    // 影子工程被工具改过之后指纹必须变，否则模型会拿到过期投影。
    expect(third).not.toBe(first);
  });

  it("still answers core-dropped detail from the shadow project while continuing", async () => {
    const project = digestLayerProject();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-inspect", budgetReceipt: "v1.receipt.first", summary: "第一轮完成" }))
      .mockResolvedValueOnce(response({ kind: "tool-call", taskId: "task-inspect", budgetReceipt: "v1.receipt.second", calls: [
        { id: "c1", name: "inspect_project", arguments: { path: "" } },
        { id: "c2", name: "inspect_project", arguments: { path: "textElements.0.content" } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", taskId: "task-inspect", budgetReceipt: "v1.receipt.third", summary: "续聊完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("先看看现状");
    await session.continue("第一段文字写的是什么");

    expect(requestDigest(fetchMock, 1).textElements).toEqual([]);
    const inspected = JSON.parse(session.steps[0]!.result.content).value as ProjectDigest;
    expect(inspected.textElements.length).toBeGreaterThan(0);
    expect(inspected.layout.cardBlocks.length).toBeGreaterThan(0);
    expect(JSON.parse(session.steps[1]!.result.content).value).toBe(project.textElements[0]?.content);
  });

  it("keeps binary asset sources out of inspect results", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const source = {
      ...project,
      assetElements: [{
        id: "asset-element-1", assetId: "asset-1", label: "校徽", src: `data:image/png;base64,${"a".repeat(5_000)}`,
        kind: "decoration" as const, x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, zIndex: 30, visibility: true,
      }],
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "inspect_project", arguments: { path: "assetElements.0.src" } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(source, { mode: "conservative" });
    await session.run("看看贴图");

    expect(JSON.parse(session.steps[0]!.result.content).value).toBe("<asset:asset-element-1>");
  });

  it("reports the normalized value that a scene write actually landed on", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "update_map", arguments: { patch: { scale: 9 } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("地图放到最大");

    expect(session.shadowProject.map.scale).toBe(3);
    expect(JSON.parse(session.steps[0]!.result.content).applied).toEqual({ scale: 3 });
  });

  it("queries students by province or name and keeps duplicate names apart by id", async () => {
    const project = createProjectDocument({
      students: [
        { id: "A", name: "张三", university: "中山大学", city: "广州", province: "广东省", visibility: true },
        { id: "B", name: "张三", university: "深圳大学", city: "深圳", province: "广东省", visibility: true },
        { id: "C", name: "李四", university: "北京大学", city: "北京", province: "北京市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "c1", name: "query_students", arguments: { province: "广东" } },
        { id: "c2", name: "query_students", arguments: { name: "张三" } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("广东有谁");

    const byProvince = JSON.parse(session.steps[0]!.result.content);
    expect(byProvince).toMatchObject({ ok: true, total: 2, offset: 0, limit: 50 });
    expect(byProvince.students.map((student: { id: string }) => student.id)).toEqual(["A", "B"]);
    expect(byProvince.students[0]).toEqual({ id: "A", name: "张三", province: "广东省", city: "广州", university: "中山大学", visibility: true });
    expect(JSON.parse(session.steps[1]!.result.content).students.map((student: { id: string }) => student.id)).toEqual(["A", "B"]);
    expect(session.landingPreview().steps).toHaveLength(0);
  });

  it("derives the province from a new city when the AI rewrites a fact", async () => {
    const project = createProjectDocument({
      students: [{ id: "s1", name: "张三", university: "中山大学", city: "广州", province: "广东省", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "manage_students", arguments: { action: "update_fact", studentId: "s1", fields: { city: "杭州" } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("把张三改到杭州");

    expect(session.shadowProject.students[0]).toMatchObject({ city: "杭州", province: "浙江省" });
  });

  it("warns instead of guessing when a new city cannot be resolved to a province", async () => {
    const project = createProjectDocument({
      students: [{ id: "s1", name: "张三", university: "中山大学", city: "广州", province: "广东省", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "manage_students", arguments: { action: "update_fact", studentId: "s1", fields: { city: "波士顿" } } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("把张三改到波士顿");

    expect(session.shadowProject.students[0]).toMatchObject({ city: "波士顿", province: "广东省" });
    expect(JSON.parse(session.steps[0]!.result.content).warning).toContain("波士顿");
  });

  it.each([
    { grouping: "province" as const, expected: ["广东省", "浙江省"] },
    { grouping: "city" as const, expected: ["广州市", "杭州市"] },
    { grouping: "university" as const, expected: ["中山大学", "浙江大学"] },
  ])("keys $grouping auto_layout positions with the render layer's group ids", async ({ grouping, expected }) => {
    const base = createProjectDocument({
      students: [
        { id: "s1", name: "张三", university: "中山大学", city: "广州市", visibility: true },
        { id: "s2", name: "李四", university: "浙江大学", city: "杭州市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    const project: ProjectDocument = { ...base, cards: { ...base.cards, grouping } };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "auto_layout", arguments: { mode: "quadrant" } }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("自动排版");

    expect(Object.keys(session.shadowProject.cards.positions ?? {}).sort()).toEqual(expected);
  });

  it("lays out with the measured card heights instead of a people-count estimate", async () => {
    const project = createProjectDocument({
      students: [
        { id: "s1", name: "张三", university: "北京大学", city: "北京市", visibility: true },
        { id: "s2", name: "李四", university: "清华大学", city: "北京市", visibility: true },
        { id: "s3", name: "王五", university: "复旦大学", city: "上海市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "auto_layout", arguments: {} }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("自动排版");

    const placements = JSON.parse(session.steps[0]!.result.content).samples as Array<{ id: string; height: number }>;
    const rendered = new Map(buildCardFacts(project).map((fact) => [fact.group.key, fact.height]));
    expect(placements).toHaveLength(2);
    for (const placement of placements) expect(placement.height).toBe(rendered.get(placement.id));
  });

  it("reports occlusion and connector conflicts from the rendered geometry", async () => {
    const base = createProjectDocument({
      students: [
        { id: "s1", name: "张三", university: "北京大学", city: "北京市", visibility: true },
        { id: "s2", name: "李四", university: "中山大学", city: "广州市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    const facts = buildCardFacts(base);
    const [first, second] = facts;
    const project: ProjectDocument = {
      ...base,
      cards: {
        ...base.cards,
        connectorStyle: "straight",
        positions: {
          [first!.group.key]: { x: second!.anchorX - first!.width / 2, y: second!.anchorY - first!.height / 2 },
          [second!.group.key]: { x: first!.anchorX - second!.width / 2, y: first!.anchorY - second!.height / 2 },
        },
      },
      textElements: [{
        id: "over-map", role: "custom", content: "压在地图上的标题",
        x: base.map.x + base.map.width / 2, y: base.map.y + base.map.height / 2,
        fontSize: 36, color: "#1c3154", fontWeight: 700, textAlign: "center", maxWidth: 420, visibility: true,
      }],
    };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [{ id: "c1", name: "check_health", arguments: {} }], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("检查版面");

    const issues = JSON.parse(session.steps[0]!.result.content).issues as Array<{ id: string; kind: string }>;
    expect(issues.some((issue) => issue.kind === "occlusion" && issue.id === "map:over-map")).toBe(true);
    expect(issues.some((issue) => issue.kind === "connector-conflict")).toBe(true);
  });

  it("rejects concurrent runs and can continue a completed conversation", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let release!: () => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(response({ kind: "finish", summary: "完成" })); }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "继续完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    const first = session.run("完成");
    await expect(session.run("重复")).rejects.toThrow(/进行中/);
    release();
    await first;
    expect((await session.continue("继续")).kind).toBe("finish");
  });

  it("reports the server budget instead of accumulating gross round tokens", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let rounds = 0;
    let usedTokens = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      rounds += 1;
      usedTokens = Math.min(60_000, usedTokens + 1_200);
      return response({
        kind: "tool-call",
        calls: [{ id: `round-${rounds}`, name: "inspect_project", arguments: { path: "map.scale" } }],
        assistantMessage: { role: "assistant", content: null, tool_calls: [{ id: `round-${rounds}`, type: "function", function: { name: "inspect_project", arguments: "{}" } }] },
        meta: { route: "primary", provider: "test-provider", usage: { totalTokens: 7_000 } },
        budget: { usedTokens, maxTokens: 60_000, rounds, maxRounds: 20 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("反复检查工程");

    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(session.metrics).toMatchObject({ rounds, usedTokens, route: "primary", provider: "test-provider" });
    expect(usedTokens).toBe(24_000);
    expect(() => session.exportSnapshot()).not.toThrow();
    expect(session.exportSnapshot().metrics).toMatchObject({ rounds: 20, usedTokens: 24_000 });
  });

  it("keeps the snapshot valid after continuing an exhausted session twice", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let rounds = 0;
    let usedTokens = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      const meta = { route: "primary", provider: "test-provider", usage: { totalTokens: 7_000 } };
      const credential = { taskId: "task-exhausted", budgetReceipt: `v1.receipt.${fetchMock.mock.calls.length}` };
      if (rounds >= 20) {
        // 只读连轮等收尾分支不带 budget，客户端只能自增 rounds，越界会让整段预览失效。
        return fetchMock.mock.calls.length > 21
          ? response({ kind: "finish", summary: "连续只读未动手，已交回结论", meta, ...credential })
          : response({ kind: "finish", summary: "已达到 AI 任务预算", meta, ...credential, budget: { usedTokens, maxTokens: 60_000, rounds, maxRounds: 20 } });
      }
      rounds += 1;
      usedTokens = Math.min(60_000, usedTokens + 3_000);
      return response({
        kind: "tool-call",
        calls: [{ id: `round-${rounds}`, name: "update_map", arguments: { patch: { width: 600 + rounds } } }],
        assistantMessage: { role: "assistant", content: null, tool_calls: [{ id: `round-${rounds}`, type: "function", function: { name: "update_map", arguments: "{}" } }] },
        meta,
        ...credential,
        budget: { usedTokens, maxTokens: 60_000, rounds, maxRounds: 20 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("反复调整地图");
    expect((await session.continue("继续一")).kind).toBe("finish");
    expect((await session.continue("继续二")).kind).toBe("finish");

    const snapshot = session.exportSnapshot();
    expect(snapshot.metrics).toMatchObject({ rounds: 20, usedTokens: 60_000 });
    expect(AgentSession.restore(project, snapshot, { mode: "conservative" }).canContinue).toBe(true);
  });

  // 检查器里用户能改的字段必须同样对 AI 开放，否则 update_map/update_cards 会误报 PATCH_REJECTED。
  it("writes the inspector-editable palette, shadow, boundary margin and card presentation", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { dataPalette: "playful", shadow: true, mapBoundaryMargin: 24 } } },
        { id: "call-cards", name: "update_cards", arguments: { patch: { presentation: "glass-stat" } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("换个多彩配色并加投影");

    expect(session.steps.map((step) => JSON.parse(step.result.content).code)).toEqual([undefined, undefined]);
    expect(session.steps.every((step) => step.result.ok)).toBe(true);
    expect(session.shadowProject.map).toMatchObject({ dataPalette: "playful", shadow: true, mapBoundaryMargin: 24 });
    expect(session.shadowProject.cards.presentation).toBe("glass-stat");
  });

  it("keeps rejecting unknown scene props and protected card positions", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-unknown", name: "update_map", arguments: { patch: { dataPalette: "pastel", nonsense: 1 } } },
        { id: "call-protected", name: "update_cards", arguments: { patch: { presentation: "standard", positions: {} } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "完成" })));
    const session = new AgentSession(project, { mode: "conservative" });
    await session.run("乱写一通");

    const unknown = JSON.parse(session.steps[0]!.result.content);
    expect(unknown).toMatchObject({ ok: false, code: "PATCH_REJECTED", unknownProps: ["nonsense"] });
    expect(unknown.availableProps).toContain("dataPalette");
    expect(JSON.parse(session.steps[1]!.result.content)).toMatchObject({ ok: false, code: "PATCH_REJECTED", protectedProps: ["positions"] });
    expect(session.shadowProject.map.dataPalette).not.toBe("pastel");
  });
});
