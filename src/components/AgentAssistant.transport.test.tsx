import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { AgentAssistant, AssistantConversationProvider } from "./AgentAssistant";
import { createProjectDocument } from "../lib/project-document";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

type RequestPayload = {
  messages: Array<{ role?: string; content?: unknown }>;
  budget: { usedTokens: number; rounds: number };
  taskId?: string;
  budgetReceipt?: string;
};

function renderAssistant(project: ReturnType<typeof createProjectDocument>, onCommit = vi.fn()) {
  window.localStorage.clear();
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push({ root, container });
  flushSync(() => root.render(
    <AssistantConversationProvider>
      <AgentAssistant project={project} assets={[]} onCommit={onCommit} />
    </AssistantConversationProvider>,
  ));
  return { container, root, onCommit };
}

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
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

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.includes(text));
}

/** 失败可续跑时用户只应看到一个续跑入口，多一个就是让人二选一的歧义。 */
function resumeAffordances(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .filter((candidate) => /继续对话|网络恢复后重试/.test(candidate.textContent ?? ""));
}

function clickText(container: HTMLElement, text: string) {
  const button = findButton(container, text);
  if (!button) throw new Error(`button missing: ${text}; text=${container.textContent}`);
  flushSync(() => button.click());
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, index: number): RequestPayload {
  const init = (fetchMock.mock.calls[index] as unknown[] | undefined)?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body)) as RequestPayload;
}

function project() {
  return createProjectDocument({ students: [], templateId: "original", dataView: "province" });
}

afterEach(() => {
  // Unmount before the timers and globals go back: a deadline case that dies on an
  // assertion would otherwise leave a root with a pending request racing jsdom teardown.
  flushSync(() => {
    for (const { root, container } of mounted.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AgentAssistant transport failures", () => {
  it("resumes the same conversation when the retry action runs after a dropped connection", async () => {
    const document_ = project();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        kind: "tool-call",
        taskId: "task-1",
        budgetReceipt: "receipt-1",
        calls: [{ id: "first-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }],
        assistantMessage: { role: "assistant", content: "先缩小地图" },
        budget: { usedTokens: 1_200, maxTokens: 60_000, rounds: 1, maxRounds: 20 },
      }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response({
        kind: "tool-call",
        calls: [{ id: "second-step", name: "update_cards", arguments: { patch: { fontSize: document_.cards.fontSize + 2 } } }],
        assistantMessage: { role: "assistant", content: null },
      }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "网络恢复后已完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const { container, onCommit } = renderAssistant(document_);
    openAssistant(container);
    setMessage(container, "缩小地图并放大卡片");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("网络连接中断"));

    expect(findButton(container, "网络恢复后重试")).toBeDefined();
    // 失败后的防抖持久化会重排失败对话，重试入口必须活过这一轮。
    await vi.waitFor(() => expect(JSON.parse(window.localStorage.getItem("cengfan-map-studio:ai-conversations:v1") ?? "null")?.conversations?.[0]?.status).toBe("failed"));
    expect(findButton(container, "网络恢复后重试")).toBeDefined();
    // 重试重发的是失败的那次需求，不依赖输入框里还留着原文。
    setMessage(container, "");
    clickText(container, "网络恢复后重试");
    await vi.waitFor(() => expect(container.textContent).toContain("网络恢复后已完成"));

    const resumed = requestBody(fetchMock, 2);
    expect(resumed.messages.length).toBeGreaterThan(1);
    expect(resumed.messages.some((entry) => entry.content === "缩小地图并放大卡片")).toBe(true);
    expect(resumed.taskId).toBe("task-1");
    expect(resumed.budgetReceipt).toBe("receipt-1");
    expect(resumed.budget).toMatchObject({ usedTokens: 1_200, rounds: 1 });
    // 中断前后的两步都留在同一份提案里。
    expect(container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(2);
    expect(container.textContent).not.toContain("网络连接中断");
    expect(findButton(container, "网络恢复后重试")).toBeUndefined();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("keeps exactly one resume affordance and swaps it when the user rewrites the request", async () => {
    const document_ = project();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        kind: "tool-call",
        taskId: "task-1",
        budgetReceipt: "receipt-1",
        calls: [{ id: "first-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }],
        assistantMessage: { role: "assistant", content: "先缩小地图" },
        budget: { usedTokens: 1_200, maxTokens: 60_000, rounds: 1, maxRounds: 20 },
      }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "改写后已完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderAssistant(document_);
    openAssistant(container);
    setMessage(container, "缩小地图并放大卡片");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("网络连接中断"));

    // 默认只给“重发原需求”，输入框里残留的原文不算改写。
    const [defaultAction, ...extraDefault] = resumeAffordances(container);
    expect(extraDefault).toHaveLength(0);
    expect(defaultAction?.textContent).toContain("网络恢复后重试");
    expect(defaultAction?.disabled).toBe(false);

    setMessage(container, "");
    expect(resumeAffordances(container)).toHaveLength(1);
    expect(findButton(container, "网络恢复后重试")).toBeDefined();

    // 改写需求后入口整体切成“继续对话”，重试按钮必须消失。
    setMessage(container, "改成只放大卡片");
    const [rewrittenAction, ...extraRewritten] = resumeAffordances(container);
    expect(extraRewritten).toHaveLength(0);
    expect(rewrittenAction?.textContent).toContain("继续对话");
    expect(findButton(container, "网络恢复后重试")).toBeUndefined();

    clickText(container, "继续对话");
    await vi.waitFor(() => expect(container.textContent).toContain("改写后已完成"));

    // 改写后的续跑仍走 session.continue：历史与 taskId 都保留。
    const resumed = requestBody(fetchMock, 2);
    expect(resumed.messages.length).toBeGreaterThan(1);
    expect(resumed.messages.some((entry) => entry.content === "缩小地图并放大卡片")).toBe(true);
    expect(resumed.messages.some((entry) => entry.content === "改成只放大卡片")).toBe(true);
    expect(resumed.taskId).toBe("task-1");
    expect(resumed.budget).toMatchObject({ usedTokens: 1_200, rounds: 1 });
  });

  it("offers the same retry action when the request deadline fires", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<never>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderAssistant(project());
    openAssistant(container);
    setMessage(container, "永远不会返回的请求");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(90_000);
    await vi.waitFor(() => expect(container.textContent).toContain("AI 请求超时"));

    expect(findButton(container, "网络恢复后重试")).toBeDefined();
  });

  it("keeps restarting the conversation after a non-retriable failure", async () => {
    const document_ = project();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        kind: "tool-call",
        taskId: "task-1",
        budgetReceipt: "receipt-1",
        calls: [{ id: "first-step", name: "update_map", arguments: { patch: { scale: 0.9 } } }],
        assistantMessage: { role: "assistant", content: null },
        budget: { usedTokens: 1_200, maxTokens: 60_000, rounds: 1, maxRounds: 20 },
      }))
      .mockResolvedValueOnce(response({ kind: "failed", error: "模型拒绝继续" }))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "重开后完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderAssistant(document_);
    openAssistant(container);
    setMessage(container, "缩小地图");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("模型拒绝继续"));

    expect(findButton(container, "网络恢复后重试")).toBeUndefined();
    setMessage(container, "重新来过");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("重开后完成"));

    const restarted = requestBody(fetchMock, 2);
    expect(restarted.messages).toHaveLength(1);
    expect(restarted.messages[0]?.content).toBe("重新来过");
    expect(restarted.taskId).toBeUndefined();
    expect(restarted.budgetReceipt).toBeUndefined();
    expect(restarted.budget).toMatchObject({ usedTokens: 0, rounds: 0 });
  });

  it("restarts instead of resuming after the user cancels a run", async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))))
      .mockResolvedValueOnce(response({ kind: "finish", summary: "取消后重开完成" }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderAssistant(project());
    openAssistant(container);
    setMessage(container, "先跑起来");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="取消 AI 会话"]')?.click());
    await vi.waitFor(() => expect(container.textContent).toContain("已取消，预览未应用"));

    expect(findButton(container, "网络恢复后重试")).toBeUndefined();
    setMessage(container, "取消后重来");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("取消后重开完成"));

    const restarted = requestBody(fetchMock, 1);
    expect(restarted.messages).toHaveLength(1);
    expect(restarted.messages[0]?.content).toBe("取消后重来");
  });
});
