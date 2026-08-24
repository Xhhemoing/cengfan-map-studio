import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { StudioAssistantRail, type StudioAssistantRailProps } from "./StudioAssistantRail";
import { AssistantConversationProvider } from "./AgentAssistant";
import { createProjectDocument } from "../lib/project-document";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function click(element: Element | null): void {
  if (!element) throw new Error(`element missing; text=${document.body.textContent?.slice(0, 120)}`);
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function press(element: Element | null, key: string): void {
  if (!element) throw new Error("tab missing");
  flushSync(() => element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
}

function selectedTab(container: HTMLElement): string | undefined {
  return container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("data-rail-tab") ?? undefined;
}

function railProps(overrides: Partial<StudioAssistantRailProps> = {}): StudioAssistantRailProps {
  return {
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
}

function renderRail(overrides: Partial<StudioAssistantRailProps> = {}) {
  const container = document.createElement("div");
  // 键盘导航断言依赖 document.activeElement，游离节点无法获得焦点。
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const props = railProps(overrides);
  flushSync(() => root.render(
    <AssistantConversationProvider><StudioAssistantRail {...props} /></AssistantConversationProvider>,
  ));
  return { container, root, props };
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
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

    const stageTab = container.querySelector('[role="tab"][data-rail-tab="stage"]');
    expect(stageTab).not.toBeNull();
    click(stageTab);

    expect(container.querySelector('[data-rail-panel="stage"]')).not.toBeNull();
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
    click(container.querySelector('[role="tab"][data-rail-tab="stage"]')!);
    click(container.querySelector("button.studio-stage-overview__card--action")!);

    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("高级功能");
    expect(container.textContent).toContain("元素查看");
    expect(onStageOverviewAction).not.toHaveBeenCalled();
  });

  it("moves between tabs with the arrow, Home and End keys", () => {
    const { container } = renderRail();
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.getAttribute("data-rail-tab"))).toEqual(["ai", "stage", "advanced"]);

    press(tabs[0]!, "ArrowRight");
    expect(selectedTab(container)).toBe("stage");
    expect(document.activeElement).toBe(tabs[1]);

    press(tabs[1]!, "ArrowRight");
    expect(selectedTab(container)).toBe("advanced");
    expect(container.textContent).toContain("工程状态");

    // 末尾右移回到首个 tab，左移则反向环绕。
    press(tabs[2]!, "ArrowRight");
    expect(selectedTab(container)).toBe("ai");
    press(tabs[0]!, "ArrowLeft");
    expect(selectedTab(container)).toBe("advanced");

    press(tabs[2]!, "Home");
    expect(selectedTab(container)).toBe("ai");
    press(tabs[0]!, "End");
    expect(selectedTab(container)).toBe("advanced");
    expect(document.activeElement).toBe(tabs[2]);
  });

  it("keeps a single tab stop in the tablist", () => {
    const { container } = renderRail();
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);

    press(tabs[0]!, "End");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("derives unique tab and panel ids so desktop and drawer copies never collide", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, container: host });
    const props = railProps();
    flushSync(() => root.render(
      <AssistantConversationProvider>
        <StudioAssistantRail {...props} />
        <StudioAssistantRail {...props} />
      </AssistantConversationProvider>,
    ));

    const ids = Array.from(host.querySelectorAll('[role="tab"], [role="tabpanel"]')).map((node) => node.id);
    expect(ids).toHaveLength(8);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tab of Array.from(host.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"]'))) {
      const panel = document.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
    }

  });
});
