import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { StudioAssistantRail, type StudioAssistantRailProps } from "./StudioAssistantRail";
import { AssistantConversationProvider } from "./AgentAssistant";
import { createProjectDocument } from "../lib/project-document";

function click(element: Element | null): void {
  if (!element) throw new Error(`element missing; text=${document.body.textContent?.slice(0, 120)}`);
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function renderRail(overrides: Partial<StudioAssistantRailProps> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const props: StudioAssistantRailProps = {
    project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
    assets: [],
    syncStatus: "idle",
    collaboration: { roomId: null, status: "idle", participantCount: 0 },
    dataIssueCount: 0,
    renderIntervalMs: 100,
    onOpenSettings: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenCollaboration: vi.fn(),
    onOpenDataDiagnostics: vi.fn(),
    onOpenRenderSettings: vi.fn(),
    selection: { type: "canvas" },
    layoutIssues: [],
    onSelectElement: vi.fn(),
    onLocateLayoutIssue: vi.fn(),
    onPreview: vi.fn(),
    onCommit: vi.fn(),
    stageOverview: {
      stage: "data",
      progressStatus: "warning",
      cards: [
        { id: "data-missing", question: "补全缺失字段", status: "2 条记录缺少姓名/院校/城市", severity: "warning", action: { kind: "data-diagnostics" } },
      ],
    },
    onStageOverviewAction: vi.fn(),
    ...overrides,
  };
  flushSync(() => root.render(
    <AssistantConversationProvider><StudioAssistantRail {...props} /></AssistantConversationProvider>,
  ));
  return { container, root, props };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("StudioAssistantRail", () => {
  it("shows advanced operational tools only after selecting its single top-level tab", () => {
    const onOpenSettings = vi.fn();
    const { container } = renderRail({ onOpenSettings });

    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("AI 助手");
    expect(container.textContent).not.toContain("工程状态");
    expect(Array.from(container.querySelectorAll("button")).filter((button) => button.textContent?.includes("高级功能"))).toHaveLength(1);

    click(container.querySelector('[role="tab"]:last-child')!);
    expect(container.textContent).toContain("工程状态");
    expect(container.textContent).toContain("0 条名单");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps the docked assistant as the only AI surface with no duplicate advanced entry", () => {
    const { container } = renderRail();
    expect(container.querySelectorAll('[data-agent-presentation="docked"]')).toHaveLength(1);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(Array.from(container.querySelectorAll("button")).filter((button) => button.textContent?.includes("高级功能"))).toHaveLength(1);
  });

  it("reports collaboration, data and render status from the advanced tab", () => {
    const onOpenCollaboration = vi.fn();
    const onOpenDataDiagnostics = vi.fn();
    const onOpenRenderSettings = vi.fn();
    const onSelectElement = vi.fn();
    const { container } = renderRail({
      syncStatus: "saving",
      collaboration: { roomId: "ROOM42", status: "syncing", participantCount: 3 },
      dataIssueCount: 5,
      renderIntervalMs: 60,
      onOpenCollaboration,
      onOpenDataDiagnostics,
      onOpenRenderSettings,
      onSelectElement,
    });
    click(container.querySelector('[role="tab"]:last-child')!);

    expect(container.textContent).toContain("ROOM42");
    expect(container.textContent).toContain("3 人");
    expect(container.textContent).toContain("5 项");
    expect(container.textContent).toContain("60 ms");
    click(container.querySelector('button[aria-label="管理协作与邀请"]'));
    click(container.querySelector('button[aria-label="打开数据诊断"]'));
    click(container.querySelector('button[aria-label="打开渲染设置"]'));
    expect(onOpenCollaboration).toHaveBeenCalledTimes(1);
    expect(onOpenDataDiagnostics).toHaveBeenCalledTimes(1);
    expect(onOpenRenderSettings).toHaveBeenCalledTimes(1);

    click(container.querySelector('button[aria-label="打开元素查看"]'));
    click(container.querySelector('[role="option"]'));
    expect(onSelectElement).toHaveBeenCalledWith({ type: "canvas" });
  });

  it("renders the stage overview tab with cards and dispatches card actions", () => {
    const onStageOverviewAction = vi.fn();
    const { container } = renderRail({ onStageOverviewAction });

    const stageTab = container.querySelector('[role="tab"][aria-controls="studio-stage-panel"]');
    expect(stageTab).not.toBeNull();
    click(stageTab);

    expect(container.querySelector("#studio-stage-panel")).not.toBeNull();
    expect(container.textContent).toContain("本阶段");
    expect(container.textContent).toContain("补全缺失字段");
    expect(container.textContent).toContain("待处理");

    click(container.querySelector("button.studio-stage-overview__card--action")!);
    expect(onStageOverviewAction).toHaveBeenCalledWith({ kind: "data-diagnostics" });
  });

  it("opens the element view straight from the stage overview elements card", () => {
    const onStageOverviewAction = vi.fn();
    const { container } = renderRail({
      onStageOverviewAction,
      stageOverview: {
        stage: "content",
        progressStatus: "ready",
        cards: [
          { id: "content-elements", question: "画布元素", status: "2 个元素", severity: "info", action: { kind: "elements" } },
        ],
      },
    });
    click(container.querySelector('[role="tab"][aria-controls="studio-stage-panel"]')!);
    click(container.querySelector("button.studio-stage-overview__card--action")!);

    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("高级功能");
    expect(container.textContent).toContain("元素查看");
    expect(onStageOverviewAction).not.toHaveBeenCalled();
  });
});
