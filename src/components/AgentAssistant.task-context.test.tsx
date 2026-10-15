import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { AgentAssistant, AssistantConversationProvider } from "./AgentAssistant";
import { resolveProjectScene } from "../lib/resolved-scene";
import { assistantProject, clickText, installAgentAssistantTestHarness, installResponses, mountAssistant, requestBody, setMessage } from "./agent-assistant-test-harness";

installAgentAssistantTestHarness();
function select(container: HTMLElement, label: string, value: string) {
  const element = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
  flushSync(() => { element.value = value; element.dispatchEvent(new Event("change", { bubbles: true })); });
}

describe("assistant task context", () => {
  it("sends revised goals and exact selection to continuation while preserving explicit constraints", async () => {
    const project = assistantProject();
    const fetch = installResponses({ kind: "finish", summary: "第一轮已完成" }, { kind: "finish", summary: "第二轮已完成" });
    const selection = { type: "cards" as const, ids: ["target-card"], scopeGrouping: "city" as const };
    const { container, root } = mountAssistant(<AssistantConversationProvider><AgentAssistant presentation="docked" project={project} assets={[]} selection={selection} contextStage="frame" onCommit={vi.fn()} /></AssistantConversationProvider>);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="任务优化目标"]')).not.toBeNull());
    select(container, "任务调整范围", "selection");
    clickText(container, "保留展示框位置");
    setMessage(container, "检查当前展示框"); clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.textContent).toContain("第一轮已完成"));
    select(container, "任务优化目标", "readability");
    setMessage(container, "继续，优先保证可读性"); clickText(container, "继续对话");
    await vi.waitFor(() => expect(container.textContent).toContain("第二轮已完成"));
    expect(requestBody(fetch, 1).digest.context).toMatchObject({ stage: "frame", selection, taskBrief: { goal: "readability", scope: "selection", selection, preserve: ["positions"] } });
    root.unmount();
  });
  it("invalidates old proposals when font measurements change and keeps the task", async () => {
    const project = assistantProject(); const onCommit = vi.fn(); const onPreview = vi.fn();
    installResponses({ kind: "tool-call", calls: [{ id: "map", name: "update_map", arguments: { patch: { scale: 0.9 } } }], assistantMessage: { role: "assistant", content: null } }, { kind: "finish", summary: "可预览的地图修改" });
    const measureText = (text: string) => text.length * 10;
    let scene = resolveProjectScene(project, { measureText, fontRevision: 1, measurementStatus: "measured" });
    const tree = () => <AssistantConversationProvider><AgentAssistant presentation="docked" project={project} assets={[]} scene={scene} onPreview={onPreview} onCommit={onCommit} /></AssistantConversationProvider>;
    const { container, root } = mountAssistant(tree());
    await vi.waitFor(() => expect(container.querySelector('[aria-label="任务优化目标"]')).not.toBeNull());
    select(container, "任务优化目标", "readability"); clickText(container, "保留展示框位置");
    setMessage(container, "缩小地图"); clickText(container, "开始规划");
    await vi.waitFor(() => expect(container.querySelector('[aria-label="确认应用"]')).not.toBeNull());
    scene = resolveProjectScene(project, { measureText, fontRevision: 2, measurementStatus: "measured" });
    flushSync(() => root.render(tree()));
    await vi.waitFor(() => expect(container.textContent).toContain("字体测量已变化"));
    expect(container.querySelector('[aria-label="确认应用"]')).toBeNull();
    expect(container.querySelector<HTMLSelectElement>('[aria-label="任务优化目标"]')!.value).toBe("readability");
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toContain("保留展示框位置");
    expect(onPreview).toHaveBeenLastCalledWith(null); expect(onCommit).not.toHaveBeenCalled();
    root.unmount();
  });
});
