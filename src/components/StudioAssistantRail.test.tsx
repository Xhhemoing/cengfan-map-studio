import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { StudioAssistantRail, type StudioAssistantRailProps } from "./StudioAssistantRail";
import { AssistantConversationProvider } from "./AgentAssistant";
import { createProjectDocument } from "../lib/project-document";

function click(element: Element | null): void {
  if (!element) throw new Error(`element missing; text=${document.body.textContent?.slice(0, 120)}`);
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

const containers: HTMLDivElement[] = [];
const roots: Root[] = [];

function renderRail(overrides: Partial<StudioAssistantRailProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
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
  roots.splice(0).forEach((root) => {
    flushSync(() => root.unmount());
  });
  containers.splice(0).forEach((container) => container.remove());
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

  it("moves through the rail tabs with roving tabindex and arrow keys", () => {
    const { container } = renderRail();
    const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs).toHaveLength(3);
    // Only the selected tab is in the tab order (roving tabindex).
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);

    const press = (target: HTMLElement, key: string) =>
      flushSync(() => target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key })));

    tabs[0]!.focus();
    press(tabs[0]!, "ArrowRight");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("studio-stage-tab");
    expect(document.activeElement?.id).toBe("studio-stage-tab");

    press(document.activeElement as HTMLElement, "ArrowRight");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("studio-advanced-tab");

    // ArrowRight wraps from the last tab back to the first.
    press(document.activeElement as HTMLElement, "ArrowRight");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("studio-ai-tab");

    // ArrowLeft wraps backwards; Home/End jump to the ends.
    press(document.activeElement as HTMLElement, "ArrowLeft");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("studio-advanced-tab");
    press(document.activeElement as HTMLElement, "Home");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("studio-ai-tab");
    press(document.activeElement as HTMLElement, "End");
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("studio-advanced-tab");

    const activeTabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(activeTabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, 0]);
  });

  it("resets the advanced view when re-entering the advanced tab via keyboard", () => {
    const { container } = renderRail();
    const advancedTab = container.querySelector<HTMLButtonElement>("#studio-advanced-tab")!;
    click(advancedTab);
    click(container.querySelector('button[aria-label="打开元素查看"]')!);
    expect(container.textContent).toContain("排版问题");

    // Leave and come back with arrow keys: the advanced tab starts fresh on operations.
    click(container.querySelector("#studio-ai-tab")!);
    const aiTab = container.querySelector<HTMLButtonElement>("#studio-ai-tab")!;
    aiTab.focus();
    flushSync(() => aiTab.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" })));
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.id).toBe("studio-advanced-tab");
    expect(container.textContent).toContain("工程状态");
  });

  it("keeps the element listbox on a single tab stop and moves focus with arrow keys", () => {
    const { container } = renderRail();
    click(container.querySelector('[role="tab"]:last-child')!);
    click(container.querySelector('button[aria-label="打开元素查看"]')!);

    const options = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    expect(options.length).toBeGreaterThanOrEqual(4);
    // selection = canvas → the selected first option is the only tab stop (roving tabindex).
    expect(options[0]!.getAttribute("aria-selected")).toBe("true");
    expect(options.map((option) => option.tabIndex)).toEqual(options.map((_, index) => (index === 0 ? 0 : -1)));

    const press = (target: HTMLElement, key: string) =>
      flushSync(() => target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key })));

    options[0]!.focus();
    press(options[0]!, "ArrowDown");
    expect(document.activeElement).toBe(options[1]);
    // The tab stop follows keyboard focus.
    expect(options[1]!.tabIndex).toBe(0);
    expect(options[0]!.tabIndex).toBe(-1);

    const last = options[options.length - 1]!;
    press(options[1]!, "End");
    expect(document.activeElement).toBe(last);
    press(last, "ArrowDown");
    expect(document.activeElement).toBe(last); // clamps at the end, no wrap
    press(last, "Home");
    expect(document.activeElement).toBe(options[0]);
    press(options[0]!, "ArrowUp");
    expect(document.activeElement).toBe(options[0]); // clamps at the start, no wrap
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
