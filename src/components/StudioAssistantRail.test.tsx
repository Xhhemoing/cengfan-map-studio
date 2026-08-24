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

/** 高级功能 → 元素查看，返回列表里的全部 option。 */
function openElementList(container: HTMLElement): HTMLButtonElement[] {
  click(container.querySelector('[role="tab"][data-rail-tab="advanced"]'));
  click(container.querySelector('button[aria-label="打开元素查看"]'));
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.studio-advanced__element-list [role="option"]'));
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

/** 桌面常驻栏与移动端抽屉挂载的是同一份 rail，两份副本共存于文档中。 */
function renderTwoRails() {
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
  const rails = Array.from(host.querySelectorAll<HTMLElement>(".studio-assistant-rail"));
  return { host, rails };
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

  it("keeps a single tab stop in the element listbox, anchored on the selected option", () => {
    const { container } = renderRail();
    const options = openElementList(container);
    expect(options.length).toBeGreaterThanOrEqual(4);
    expect(options.filter((option) => option.tabIndex === 0)).toHaveLength(1);
    expect(options[0]!.tabIndex).toBe(0);

    const { container: withSelection } = renderRail({ selection: { type: "cards" } });
    const selectedOptions = openElementList(withSelection);
    expect(selectedOptions.filter((option) => option.tabIndex === 0)).toHaveLength(1);
    // outline 顺序为 画布 / 地图展示框 / 数据展示框 / 嘉宾板块。
    expect(selectedOptions[2]!.getAttribute("aria-selected")).toBe("true");
    expect(selectedOptions[2]!.tabIndex).toBe(0);
  });

  it("moves option focus with arrow, Home and End keys without selecting or leaving the tab", () => {
    const onSelectElement = vi.fn();
    const { container } = renderRail({ onSelectElement });
    const options = openElementList(container);
    const last = options.length - 1;

    press(options[0]!, "ArrowDown");
    expect(document.activeElement).toBe(options[1]);
    expect(options[0]!.tabIndex).toBe(-1);
    expect(options[1]!.tabIndex).toBe(0);

    press(options[1]!, "ArrowUp");
    expect(document.activeElement).toBe(options[0]);
    expect(options[0]!.tabIndex).toBe(0);

    press(options[0]!, "End");
    expect(document.activeElement).toBe(options[last]);
    expect(options.filter((option) => option.tabIndex === 0)).toEqual([options[last]]);

    press(options[last]!, "Home");
    expect(document.activeElement).toBe(options[0]);

    // 方向键只挪焦点：既不改选中项，也不该冒泡改动 rail 页签。
    expect(onSelectElement).not.toHaveBeenCalled();
    expect(options[0]!.getAttribute("aria-selected")).toBe("true");
    expect(options[1]!.getAttribute("aria-selected")).toBe("false");
    expect(selectedTab(container)).toBe("advanced");
  });

  it("stops at both ends of the element listbox instead of wrapping", () => {
    const { container } = renderRail();
    const options = openElementList(container);
    const last = options.length - 1;

    press(options[0]!, "ArrowUp");
    expect(document.activeElement).not.toBe(options[last]);
    expect(options[0]!.tabIndex).toBe(0);

    press(options[0]!, "End");
    press(options[last]!, "ArrowDown");
    expect(document.activeElement).toBe(options[last]);
    expect(options[0]!.tabIndex).toBe(-1);
  });

  it("moves the listbox tab stop to the clicked option", () => {
    const onSelectElement = vi.fn();
    const { container } = renderRail({ onSelectElement });
    const options = openElementList(container);

    click(options[1]!);
    expect(onSelectElement).toHaveBeenCalledTimes(1);
    expect(options.filter((option) => option.tabIndex === 0)).toEqual([options[1]]);
  });

  it("derives unique tab and panel ids so desktop and drawer copies never collide", () => {
    const { host } = renderTwoRails();

    const ids = Array.from(host.querySelectorAll('[role="tab"], [role="tabpanel"]')).map((node) => node.id);
    expect(ids).toHaveLength(8);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tab of Array.from(host.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"]'))) {
      const panel = document.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
    }

  });

  it("shares the active tab and the advanced sub-view between both mounted copies", () => {
    const { rails } = renderTwoRails();
    expect(rails).toHaveLength(2);
    expect(rails.map((rail) => selectedTab(rail))).toEqual(["ai", "ai"]);

    click(rails[0]!.querySelector('[role="tab"][data-rail-tab="advanced"]'));
    expect(rails.map((rail) => selectedTab(rail))).toEqual(["advanced", "advanced"]);
    expect(rails[1]!.textContent).toContain("工程状态");

    // 抽屉那份切到元素查看，桌面那份不该还停在操作列表上。
    click(rails[1]!.querySelector('button[aria-label="打开元素查看"]'));
    expect(rails[0]!.querySelector(".studio-advanced__element-list")).not.toBeNull();
    expect(rails[1]!.querySelector(".studio-advanced__element-list")).not.toBeNull();
  });

  it("scopes the assistant mode radio group to each copy so names never collide", () => {
    const { host } = renderTwoRails();
    const names = Array.from(host.querySelectorAll<HTMLInputElement>('.agent-mode-control input[type="radio"]')).map((input) => input.name);

    expect(names).toHaveLength(4);
    expect(names.every((name) => name.length > 0)).toBe(true);
    // 每份副本内部两个单选按钮同名（同一组），两份副本之间必须不同名。
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toBe(names[1]);
    expect(names[2]).toBe(names[3]);
  });
});
