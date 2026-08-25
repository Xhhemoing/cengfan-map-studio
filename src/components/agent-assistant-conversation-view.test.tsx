import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { AssistantConversationView } from "./agent-assistant-conversation-view";
import { AgentSession, type AgentStep } from "../lib/agent-session";
import { createProjectDocument } from "../lib/project-document";
import type { AssistantConversation } from "./agent-assistant-model";

function writeStep(overrides: Partial<AgentStep> & Pick<AgentStep, "id">): AgentStep {
  return {
    name: "update_map",
    arguments: { patch: { scale: 0.9 } },
    result: { id: overrides.id, ok: true, content: JSON.stringify({ ok: true }) },
    risk: "low",
    ...overrides,
  };
}

function completedConversation(steps: AgentStep[]): AssistantConversation {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  return {
    id: "conversation-review",
    title: "测试对话",
    session: new AgentSession(project, { mode: "smart", assets: [] }),
    request: "调整地图与卡片",
    status: "completed",
    summary: "已生成修改预览",
    error: "",
    steps,
    selectedStepIds: steps.map((step) => step.id),
    mode: "smart",
    progress: "",
    provider: "",
    restored: false,
    projectDigest: "digest-review",
  };
}

let root: Root | null = null;

function renderView(steps: AgentStep[]): HTMLElement {
  const conversation = completedConversation(steps);
  const container = document.createElement("div");
  root = createRoot(container);
  flushSync(() => root!.render(
    <AssistantConversationView
      conversation={conversation}
      conversations={[conversation]}
      message=""
      projectIsCurrent
      activeWriteSteps={steps}
      selectedWriteSteps={steps.filter((step) => step.result.ok)}
      selectedIds={new Set(conversation.selectedStepIds)}
      onMessageChange={vi.fn()}
      onSelectConversation={vi.fn()}
      onModeChange={vi.fn()}
      onRun={vi.fn()}
      onCancel={vi.fn()}
      onToggleStep={vi.fn()}
      onApplySelected={vi.fn()}
    />,
  ));
  return container;
}

afterEach(() => {
  root?.unmount();
  root = null;
});

describe("AssistantConversationView review rows", () => {
  it("keeps checkbox accessible names and pins aria-hidden on the high-risk AlertTriangle icon", () => {
    const container = renderView([
      writeStep({ id: "step-map", risk: "high" }),
      writeStep({ id: "step-cards", name: "update_cards", arguments: { patch: { fontSize: 18 } } }),
    ]);

    const rows = Array.from(container.querySelectorAll(".agent-review-row"));
    expect(rows).toHaveLength(2);

    // 复选框的可访问名称必须保留「选择 …」，图标只是装饰。
    const checkboxLabels = rows.map((row) => row.querySelector('input[type="checkbox"]')?.getAttribute("aria-label"));
    expect(checkboxLabels).toEqual(["选择 update_map：scale", "选择 update_cards：fontSize"]);

    const highRiskIcon = rows[0].querySelector(".agent-review-icon svg");
    expect(highRiskIcon).not.toBeNull();
    expect(highRiskIcon!.classList.contains("lucide-triangle-alert")).toBe(true);
    // 仓库约定：aria-hidden 钉在 Lucide svg 本体上，而不只依赖父 span。
    expect(highRiskIcon!.getAttribute("aria-hidden")).toBe("true");
  });

  it("pins aria-hidden on every Lucide svg inside .agent-review-icon", () => {
    const container = renderView([
      writeStep({ id: "step-map", risk: "high" }),
      writeStep({ id: "step-cards", name: "update_cards", arguments: { patch: { fontSize: 18 } } }),
    ]);

    const icons = Array.from(container.querySelectorAll(".agent-review-icon svg"));
    expect(icons.length).toBe(2);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden"), `svg ${icon.getAttribute("class")}`).toBe("true");
    }
    // 低风险成功步骤走 Check 分支，同样必须 aria-hidden。
    expect(icons[1].classList.contains("lucide-check")).toBe(true);
  });
});
