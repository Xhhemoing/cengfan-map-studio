import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { StudioAssistantRail, type StudioAssistantRailProps } from "./StudioAssistantRail";
import { AssistantConversationProvider } from "./AgentAssistant";
import { createProjectDocument } from "../lib/project-document";
import { sampleStudents } from "../lib/project-data";

const roots: Root[] = [];

function click(element: Element | null): void {
  if (!element) throw new Error(`element missing; text=${document.body.textContent?.slice(0, 120)}`);
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function renderRail(overrides: Partial<StudioAssistantRailProps> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);
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
  // AssistantConversationProvider can arm a persist timeout; leave the root mounted
  // and jsdom teardown races React's scheduler against a missing `window`.
  flushSync(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("StudioAssistantRail", () => {
  it("shows advanced operational tools only after selecting its single top-level tab", () => {
    const onOpenSettings = vi.fn();
    const { container } = renderRail({ onOpenSettings });

    // 空名单默认落在「本阶段」（导入名单是第一件事），不是 AI。
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("本阶段");
    expect(container.textContent).not.toContain("工程状态");
    expect(Array.from(container.querySelectorAll("button")).filter((button) => button.textContent?.includes("高级功能"))).toHaveLength(1);

    click(container.querySelector('[role="tab"]:last-child')!);
    expect(container.textContent).toContain("工程状态");
    expect(container.textContent).toContain("0 条名单");
    // public 默认路径：入口写明去处（版式），不再自称「全局设置」。
    expect(container.querySelector('button[aria-label="打开全局设置"]')).toBeNull();
    expect(container.textContent).not.toContain("全局设置");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="前往版式"]')!);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps the docked assistant as the only AI surface with no duplicate advanced entry", () => {
    const { container } = renderRail({
      project: createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" }),
    });
    // 名单非空 → 默认 AI 助手 tab。
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("AI 助手");
    expect(container.querySelectorAll('[data-agent-presentation="docked"]')).toHaveLength(1);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(Array.from(container.querySelectorAll("button")).filter((button) => button.textContent?.includes("高级功能"))).toHaveLength(1);
  });

  it("reports collaboration, data and render status from the advanced tab", () => {
    const onOpenCollaboration = vi.fn();
    const onOpenDataDiagnostics = vi.fn();
    const onSelectElement = vi.fn();
    const { container } = renderRail({
      syncStatus: "saving",
      collaboration: { roomId: "ROOM42", status: "syncing", participantCount: 3 },
      dataIssueCount: 5,
      renderIntervalMs: 60,
      onOpenCollaboration,
      onOpenDataDiagnostics,
      onSelectElement,
    });
    click(container.querySelector('[role="tab"]:last-child')!);

    expect(container.textContent).toContain("ROOM42");
    expect(container.textContent).toContain("3 人");
    expect(container.textContent).toContain("5 项");
    // public 路径没有渲染设置页：渲染间隔只读展示，不再是按钮。
    expect(container.textContent).toContain("60 ms");
    expect(container.querySelector('button[aria-label="打开渲染设置"]')).toBeNull();
    // 数据诊断写清会前往名单阶段处理。
    expect(container.querySelector('button[aria-label="打开数据诊断"]')?.textContent).toContain("前往名单阶段");
    click(container.querySelector('button[aria-label="管理协作与邀请"]'));
    click(container.querySelector('button[aria-label="打开数据诊断"]'));
    expect(onOpenCollaboration).toHaveBeenCalledTimes(1);
    expect(onOpenDataDiagnostics).toHaveBeenCalledTimes(1);

    click(container.querySelector('button[aria-label="打开元素查看"]'));
    click(container.querySelector('[role="option"]'));
    expect(onSelectElement).toHaveBeenCalledWith({ type: "canvas" });
  });

  it("keeps the legacy fullscreen settings entries when advancedMode is legacy-settings", () => {
    const onOpenSettings = vi.fn();
    const onOpenRenderSettings = vi.fn();
    const { container } = renderRail({
      advancedMode: "legacy-settings",
      renderIntervalMs: 60,
      onOpenSettings,
      onOpenRenderSettings,
    });
    click(container.querySelector('[role="tab"]:last-child')!);

    click(container.querySelector('button[aria-label="打开全局设置"]'));
    click(container.querySelector('button[aria-label="打开渲染设置"]'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onOpenRenderSettings).toHaveBeenCalledTimes(1);
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
