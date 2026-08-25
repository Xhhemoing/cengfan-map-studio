import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { AgentAssistant, AssistantConversationProvider } from "./AgentAssistant";
import type { ProjectTransaction } from "../lib/project-document";
import {
  assistantProject,
  clickText,
  installAgentAssistantTestHarness,
  installResponses,
  mountAssistant,
  openAssistant,
  renderAssistant,
  requestBody,
  setMessage,
} from "./agent-assistant-test-harness";

installAgentAssistantTestHarness();

describe("AgentAssistant proposals", () => {
  it("renders a summary and selected write proposals, then applies only selected steps", async () => {
    const project = assistantProject();
    installResponses(
      { kind: "tool-call", calls: [
        { id: "call-map", name: "update_map", arguments: { patch: { scale: 0.9 } } },
        { id: "call-cards", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 4 } } },
      ], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "地图和卡片已完成" },
    );
    const { container, root, onCommit } = renderAssistant(project);
    openAssistant(container);
    setMessage(container, "调整地图和卡片");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("地图和卡片已完成"));
    const checkboxes = Array.from(container.querySelectorAll<HTMLInputElement>('.agent-assistant-window input[type="checkbox"]'));
    expect(checkboxes).toHaveLength(2);
    checkboxes[0]!.click();
    checkboxes[1]!.click();
    clickText(container, "确认应用");
    expect(onCommit).not.toHaveBeenCalled();
    checkboxes[0]!.click();
    checkboxes[1]!.click();
    clickText(container, "确认应用");
    expect(onCommit).toHaveBeenCalledTimes(1);
    root.unmount();
  });

  it("keeps completed conversations in history and shows one pending badge", async () => {
    const project = assistantProject();
    installResponses(
      { kind: "tool-call", calls: [{ id: "call-one", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 2 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "第一段完成" },
      { kind: "finish", summary: "第二段完成" },
    );
    const { container, root } = renderAssistant(project);
    openAssistant(container);
    setMessage(container, "第一段");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第一段完成"));
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="新建对话"]')?.click());
    setMessage(container, "第二段");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第二段完成"));
    expect(container.querySelector('[aria-label="打开 AI 助手"]')).toBeNull();
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="最小化 AI 助手"]')?.click());
    expect(container.querySelector('button[aria-label="打开 AI 助手，1 个待应用对话"]')?.textContent).toContain("1");
    openAssistant(container);
    expect(container.querySelectorAll('.agent-assistant-history button')).toHaveLength(2);
    root.unmount();
  });

  it("continues a completed conversation and appends new proposals", async () => {
    const project = assistantProject();
    const fetchMock = installResponses(
      { kind: "tool-call", calls: [{ id: "first", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "第一轮完成" },
      { kind: "tool-call", calls: [{ id: "second", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 2 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "继续完成" },
    );
    const { container, root } = renderAssistant(project);
    openAssistant(container);
    setMessage(container, "第一轮");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第一轮完成"));
    setMessage(container, "继续调整");
    expect(container.textContent).toContain("继续对话");
    clickText(container, "继续对话");
    await vi.waitFor(() => expect(container.textContent).toContain("继续完成"));
    expect(container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(2);
    const continuationBody = requestBody(fetchMock, 2);
    expect(continuationBody.messages.some((entry: { content?: string }) => entry.content === "第一轮")).toBe(true);
    root.unmount();
  });

  it("keeps an applied conversation terminal and hides proposal controls", async () => {
    const project = assistantProject();
    installResponses(
      { kind: "tool-call", calls: [{ id: "first", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "完成" },
    );
    const { container, root, onCommit } = renderAssistant(project);
    openAssistant(container);
    setMessage(container, "应用地图");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("完成"));
    clickText(container, "确认应用");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(0);
    expect(container.querySelector('[aria-label="确认应用"]')).toBeNull();
    expect(container.textContent).toContain("已应用");
    root.unmount();
  });

  it("keeps an applied conversation terminal when onCommit updates the project prop", async () => {
    let project = assistantProject();
    const onCommit = vi.fn((transaction: ProjectTransaction) => {
      project = transaction.apply(project);
    });
    installResponses(
      { kind: "tool-call", calls: [{ id: "applied-project-update", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "已应用" },
    );
    const tree = () => <AssistantConversationProvider><AgentAssistant project={project} assets={[]} onCommit={onCommit} /></AssistantConversationProvider>;
    const { container, root } = mountAssistant(tree());
    const render = () => flushSync(() => root.render(tree()));
    openAssistant(container);
    setMessage(container, "应用后更新项目");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("已应用"));
    clickText(container, "确认应用");
    expect(onCommit).toHaveBeenCalledTimes(1);

    render();
    await vi.waitFor(() => expect(container.textContent).toContain("已应用"));
    expect(container.querySelectorAll('.agent-assistant-window input[type="checkbox"]')).toHaveLength(0);
    expect(container.querySelector('[aria-label="确认应用"]')).toBeNull();
    expect(container.querySelector('button[aria-label="确认应用"]')).toBeNull();
    const runButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("开始规划") || button.textContent?.includes("继续对话"));
    expect(runButton).toBeDefined();
    expect(runButton?.disabled).toBe(true);
    root.unmount();
  });

  it("uses each conversation mode as the source of truth and reports pending count", async () => {
    const project = assistantProject();
    const pending = vi.fn();
    installResponses(
      { kind: "tool-call", calls: [{ id: "first", name: "update_cards", arguments: { patch: { fontSize: project.cards.fontSize + 2 } } }], assistantMessage: { role: "assistant", content: null } },
      { kind: "finish", summary: "完成" },
    );
    const { container, root } = renderAssistant(project);
    root.render(<AssistantConversationProvider><AgentAssistant project={project} assets={[]} onCommit={vi.fn()} onPendingCountChange={pending} /></AssistantConversationProvider>);
    openAssistant(container);
    const smart = container.querySelector<HTMLInputElement>('input[type="radio"][value="smart"]');
    expect(smart).not.toBeNull();
    flushSync(() => smart?.click());
    setMessage(container, "智能修改");
    clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("已应用"));
    expect(pending).toHaveBeenLastCalledWith(0);
    root.unmount();
  });
});
