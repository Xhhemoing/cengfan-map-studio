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

/**
 * App.tsx 把 AssistantConversationProvider 提到整棵编辑器之外，抽屉只挂载/卸载 rail。
 * 这个装配用于验证关闭抽屉不会打断正在跑的 AI 会话。
 */
function renderDrawerBelowProvider() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
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
  };
  const renderDrawer = (open: boolean) => flushSync(() => root.render(
    <StudioMuiProvider>
      <AssistantConversationProvider>
        <StudioAssistantDrawer open={open} onClose={vi.fn()} label="AI 助手与高级功能">
          <StudioAssistantRail {...props} />
        </StudioAssistantDrawer>
      </AssistantConversationProvider>
    </StudioMuiProvider>,
  ));
  renderDrawer(true);
  return { root, props, renderDrawer };
}

function setDrawerMessage(value: string): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="描述 AI 修改需求"]');
  if (!textarea) throw new Error("assistant textarea missing");
  flushSync(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function drawerMessage(): string | undefined {
  return document.querySelector<HTMLTextAreaElement>('textarea[aria-label="描述 AI 修改需求"]')?.value;
}

function clickDrawerText(text: string): void {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".agent-assistant--docked button")).find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`button missing: ${text}`);
  flushSync(() => button.click());
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("StudioAssistantDrawer integration", () => {
  it("opens the drawer over the rail and reaches advanced actions and the element view", () => {
    renderDrawerWithRail();
    // MUI Drawer portals to document.body.
    const drawerRoot = document.querySelector(".MuiDrawer-root");
    expect(drawerRoot).not.toBeNull();
    expect(document.querySelector('[role="tab"][data-rail-tab="ai"]')).not.toBeNull();

    // (a) the advanced tab exposes the compact 数据诊断 action.
    click(document.querySelector<HTMLButtonElement>('[role="tab"][data-rail-tab="advanced"]'));
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

  it("keeps the unsent draft when the drawer closes and reopens", async () => {
    window.localStorage.clear();
    const { renderDrawer } = renderDrawerBelowProvider();
    await act(async () => {});
    setDrawerMessage("先写一半，关了抽屉再回来");
    expect(drawerMessage()).toBe("先写一半，关了抽屉再回来");

    // MUI Drawer 走完退出过渡才卸载 children，等助手真的离开 DOM 才算关闭。
    renderDrawer(false);
    await vi.waitFor(() => expect(document.querySelector('textarea[aria-label="描述 AI 修改需求"]')).toBeNull());

    renderDrawer(true);
    await act(async () => {});
    expect(drawerMessage()).toBe("先写一半，关了抽屉再回来");

    // 草稿只在内存里：刷新页面不该把没发出去的需求捞回来。
    const persisted = Object.keys(window.localStorage).map((key) => window.localStorage.getItem(key) ?? "");
    expect(persisted.some((value) => value.includes("先写一半"))).toBe(false);
  });

  it("does not cancel a running AI session when the drawer closes", async () => {
    window.localStorage.clear();
    let signal: AbortSignal | undefined;
    let release!: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((resolve, reject) => {
        release = resolve as typeof release;
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }));
    const { renderDrawer } = renderDrawerBelowProvider();
    await act(async () => {});
    setDrawerMessage("关抽屉不要打断我");
    clickDrawerText("开始规划");
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    // MUI Drawer 走完退出过渡才卸载 children；等到助手真的离开 DOM 才是有效断言。
    renderDrawer(false);
    await vi.waitFor(() => expect(document.querySelector('textarea[aria-label="描述 AI 修改需求"]')).toBeNull());
    expect(signal?.aborted).toBe(false);

    release({ ok: true, status: 200, json: async () => ({ kind: "finish", summary: "抽屉关闭期间已完成" }) });
    await act(async () => {});

    renderDrawer(true);
    await vi.waitFor(() => expect(document.body.textContent).toContain("抽屉关闭期间已完成"));
    expect(signal?.aborted).toBe(false);
  });
});
