import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { AgentAssistant, AssistantConversationProvider } from "./AgentAssistant";
import { applyTransaction, createProjectDocument, type ProjectDocument, type ProjectTransaction } from "../lib/project-document";

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function seedHistory(project: ProjectDocument): ProjectDocument {
  return applyTransaction(project, {
    id: "tx-manual-seed",
    label: "手动调整",
    source: "manual",
    apply: (document) => ({ ...document, cards: { ...document.cards, fontSize: document.cards.fontSize + 2 } }),
  });
}

function render(project: ProjectDocument, onCommit: (transaction: ProjectTransaction) => void, onPreview = vi.fn()) {
  window.localStorage.clear();
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(
    <AssistantConversationProvider>
      <AgentAssistant project={project} assets={[]} onCommit={onCommit} onPreview={onPreview} />
    </AssistantConversationProvider>,
  ));
  return { container, root, onPreview };
}

function openAssistant(container: HTMLElement) {
  flushSync(() => container.querySelector<HTMLButtonElement>(".agent-assistant-launcher")?.click());
}

function setMessage(container: HTMLElement, value: string) {
  const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) throw new Error("assistant textarea missing");
  flushSync(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`button missing: ${text}; text=${container.textContent}`);
  flushSync(() => button.click());
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AgentAssistant landing failures", () => {
  it("names the refused step and keeps the proposal retriable when a target is deleted before landing", async () => {
    const project = createProjectDocument({
      students: [
        { id: "A", name: "甲", university: "大学", city: "广州", province: "广东", visibility: true },
        { id: "B", name: "乙", university: "大学", city: "北京", province: "北京", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });
    // 确认前学生 A 已在别处被删除：宿主文档与助手 project prop 短暂不同步。
    const seeded = seedHistory(project);
    const live = { ...seeded, students: seeded.students.filter((student) => student.id !== "A") };
    const landings: ProjectDocument[] = [];
    // 宿主通常在 React 状态更新函数里才 apply，这里同样延后执行。
    const onCommit = vi.fn((transaction: ProjectTransaction) => {
      queueMicrotask(() => landings.push(applyTransaction(live, transaction)));
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
        { id: "call-fact", name: "manage_students", arguments: { action: "update_fact", studentId: "A", fields: { city: "深圳" } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "已规划两项改动" })));
    const { container, root } = render(project, onCommit);
    openAssistant(container);
    setMessage(container, "缩小地图并把甲同学改到深圳");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("已规划两项改动"));

    clickText(container, "确认应用");
    await vi.waitFor(() => expect(container.textContent).toContain("未能应用"));

    const alerts = Array.from(container.querySelectorAll('[role="alert"]')).map((node) => node.textContent ?? "");
    const landingAlert = alerts.find((text) => text.includes("未能应用")) ?? "";
    expect(landingAlert).toContain("manage_students");
    expect(landingAlert).toContain("找不到指定学生");
    expect(landingAlert).toContain("撤销");
    expect(container.textContent).not.toContain("已应用");

    const landed = landings[0]!;
    expect(landed.students).toEqual(live.students);
    expect(landed.map).toEqual(live.map);
    expect(landed.cards).toEqual(live.cards);
    // project-document 拥有的已知 T5 行为：被拒的重放仍会写入一次空历史与版本号自增。
    expect(landed.version).toBe(live.version + 1);
    expect(landed.history.past).toHaveLength(live.history.past.length + 1);

    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('.agent-assistant-window input[type="checkbox"]'));
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((checkbox) => checkbox.checked)).toBe(true);
    clickText(container, "确认应用");
    await vi.waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2));
    root.unmount();
  });

  it("drops the refused step and lands the rest after the user deselects it", async () => {
    const project = createProjectDocument({
      students: [{ id: "A", name: "甲", university: "大学", city: "广州", province: "广东", visibility: true }],
      templateId: "original",
      dataView: "province",
    });
    const live = { ...project, students: [] };
    const landings: ProjectDocument[] = [];
    const onCommit = vi.fn((transaction: ProjectTransaction) => landings.push(applyTransaction(live, transaction)));
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
        { id: "call-fact", name: "manage_students", arguments: { action: "update_fact", studentId: "A", fields: { city: "深圳" } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "已规划" })));
    const { container, root } = render(project, onCommit);
    openAssistant(container);
    setMessage(container, "缩小地图并改学生");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("已规划"));
    clickText(container, "确认应用");
    await vi.waitFor(() => expect(container.textContent).toContain("未能应用"));

    const studentCheckbox = Array.from(container.querySelectorAll<HTMLInputElement>('.agent-assistant-window input[type="checkbox"]'))
      .find((checkbox) => checkbox.getAttribute("aria-label")?.includes("manage_students"));
    expect(studentCheckbox).toBeDefined();
    flushSync(() => studentCheckbox!.click());
    clickText(container, "确认应用");
    await vi.waitFor(() => expect(container.textContent).toContain("已应用"));

    expect(landings.at(-1)?.map.scale).toBe(0.9);
    expect(container.textContent).not.toContain("未能应用");
    root.unmount();
  });

  it("reverts the smart-mode auto-apply claim when the automatic landing is refused", async () => {
    const project = createProjectDocument({
      students: [],
      templateId: "original",
      dataView: "province",
      textElements: [{ id: "note-1", content: "备注", x: 40, y: 40, fontSize: 24, color: "#111111" }],
    });
    const live = { ...project, textElements: [] };
    const onCommit = vi.fn((transaction: ProjectTransaction) => {
      queueMicrotask(() => applyTransaction(live, transaction));
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-text", name: "update_text", arguments: { id: "note-1", patch: { fontSize: 40 } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "备注已放大" })));
    const { container, root } = render(project, onCommit);
    openAssistant(container);
    flushSync(() => container.querySelector<HTMLInputElement>('input[type="radio"][value="smart"]')?.click());
    setMessage(container, "把备注放大");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("未能应用"));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("目标元素已不在当前工程中");
    expect(container.textContent).not.toContain("低风险修改已自动应用");
    expect(container.querySelector('[aria-label="确认应用"]')).not.toBeNull();
    root.unmount();
  });

  it("stays silent and terminal when the landing succeeds", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    let landed = seedHistory(project);
    const onCommit = vi.fn((transaction: ProjectTransaction) => {
      queueMicrotask(() => { landed = applyTransaction(landed, transaction); });
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response({ kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
      ], assistantMessage: { role: "assistant", content: null } }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "已规划地图" })));
    const { container, root } = render(project, onCommit);
    openAssistant(container);
    setMessage(container, "缩小地图");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("已规划地图"));
    clickText(container, "确认应用");
    await vi.waitFor(() => expect(landed.map.scale).toBe(0.9));

    expect(container.textContent).toContain("已应用");
    expect(container.textContent).not.toContain("未能应用");
    expect(container.querySelector('[aria-label="确认应用"]')).toBeNull();
    root.unmount();
  });
});
