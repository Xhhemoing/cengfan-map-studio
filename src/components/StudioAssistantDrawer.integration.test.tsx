import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioMuiProvider } from "./StudioMuiProvider";
import { StudioAssistantDrawer } from "./StudioAssistantDrawer";
import { StudioAssistantRail, type StudioAssistantRailProps } from "./StudioAssistantRail";
import { AssistantConversationProvider } from "./AgentAssistant";
import { createProjectDocument } from "../lib/project-document";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function click(element: Element | null): void {
  if (!element) throw new Error(`element missing; text=${document.body.textContent?.slice(0, 120)}`);
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function renderDrawerWithRail(overrides: Partial<StudioAssistantRailProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const opener = document.createElement("button");
  opener.textContent = "opener";
  document.body.append(opener);
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
      progressStatus: "ready",
      cards: [
        { id: "data-clean", question: "名单数据健康", status: "0 人 · 无缺失、无重复、全部可定位", severity: "ok" },
      ],
    },
    onStageOverviewAction: vi.fn(),
    ...overrides,
  };
  const onClose = vi.fn();
  const renderDrawer = (open: boolean) => flushSync(() => root.render(
    <StudioMuiProvider>
      <StudioAssistantDrawer open={open} onClose={onClose} label="AI 助手与高级功能" returnFocusTo={opener}>
        <AssistantConversationProvider>
          <StudioAssistantRail {...props} />
        </AssistantConversationProvider>
      </StudioAssistantDrawer>
    </StudioMuiProvider>,
  ));
  renderDrawer(true);
  return { container, root, opener, onClose, props, renderDrawer };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("StudioAssistantDrawer integration", () => {
  it("opens the drawer over the rail and reaches advanced actions and the element view", () => {
    renderDrawerWithRail();
    // MUI Drawer portals to document.body.
    const drawerRoot = document.querySelector(".MuiDrawer-root");
    expect(drawerRoot).not.toBeNull();
    expect(document.querySelector('[role="tab"][aria-controls="studio-ai-panel"]')).not.toBeNull();

    // (a) the advanced tab exposes the compact 数据诊断 action.
    click(document.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="studio-advanced-panel"]'));
    expect(document.querySelector('button[aria-label="打开数据诊断"]')).not.toBeNull();

    // (b) switching to 元素查看 shows the element list.
    click(document.querySelector<HTMLButtonElement>('button[aria-label="打开元素查看"]'));
    expect(document.querySelector('.studio-advanced__element-list')).not.toBeNull();
    expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
  });

  it("closes the drawer from the labelled close button and returns focus to the opener", async () => {
    const { onClose, opener, renderDrawer } = renderDrawerWithRail();

    const closeButton = document.querySelector<HTMLButtonElement>('button[aria-label="关闭AI 助手与高级功能"]');
    expect(closeButton).not.toBeNull();
    click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Simulate the parent closing the drawer, then let the focus-restore effect run.
    renderDrawer(false);
    await act(async () => {});
    expect(document.activeElement).toBe(opener);
  });
});
