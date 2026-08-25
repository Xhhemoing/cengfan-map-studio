import { isValidElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStageSlots, type StageSlotsContext } from "./stage-slots";
import { createProjectDocument } from "../../lib/project-document";

// buildStageSlots 会同时构造各阶段的右栏 / 工作区元素；这些重子组件
// （画布、地图数据等传递依赖）与阶段顶栏动作无关，桩掉以聚焦被测行为。
// ToolbarButton（含 decorativeIcon）保持真实实现，它是被测链路的一部分。
vi.mock("../inspector/CardsInspector", () => ({ CardsInspector: () => null }));
vi.mock("../DataWorkspace", () => ({ DataWorkspace: () => null }));
vi.mock("../workspaces/DataUploadWorkspace", () => ({ DataUploadRail: () => null, DataUploadWorkspace: () => null }));
vi.mock("../workspaces/MapStyleWorkspace", () => ({ MapStyleRail: () => null, MapStyleWorkspace: () => null }));
vi.mock("../workspaces/ReferenceCardStyleWorkspace", () => ({ ReferenceCardStyleWorkspace: () => null }));
vi.mock("../workspaces/ContentLayoutWorkspace", () => ({ ContentLayoutRail: () => null, ContentLayoutWorkspace: () => null }));
vi.mock("../workspaces/DeliveryWorkspace", () => ({ DeliveryRail: () => null, DeliveryWorkspace: () => null }));

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function buildCtx(overrides: Partial<StageSlotsContext> = {}): StageSlotsContext {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const partial: Partial<StageSlotsContext> = {
    project,
    renderProject: project,
    selection: { type: "canvas" },
    selectedStudentId: null,
    userAssets: [],
    userFonts: [],
    posterRef: { current: null },
    posterExport: { exportingPng: false, exportPng: vi.fn() } as unknown as StageSlotsContext["posterExport"],
    canUndo: true,
    canRedo: true,
    undoLabel: "撤销：更新地图",
    redoLabel: "重做：更新地图",
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSelect: vi.fn(),
    onPatchScene: vi.fn(),
    onRefreshDisplayFramePositions: vi.fn(),
    onBackToMapStage: vi.fn(),
    ...overrides,
  };
  return partial as StageSlotsContext;
}

function renderStageActions(stage: "frame" | "content") {
  const stageActions = buildStageSlots(stage, buildCtx()).stageActions;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(stageActions));
  return { container, stageActions };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

/** 收集元素树里各 ToolbarButton 的 icon 元素（Fragment 只需下钻一层 children）。 */
function collectIconElements(node: ReactNode): ReactElement<{ "aria-hidden"?: boolean | "true" | "false" }>[] {
  if (!isValidElement(node)) return [];
  const props = node.props as { icon?: ReactNode; children?: ReactNode };
  const own = isValidElement(props.icon) ? [props.icon as ReactElement<{ "aria-hidden"?: boolean | "true" | "false" }>] : [];
  const children = Array.isArray(props.children) ? props.children : props.children === undefined ? [] : [props.children];
  return [...own, ...children.flatMap(collectIconElements)];
}

function expectLabelledButtonWithHiddenIcon(container: HTMLElement, label: string): void {
  // 按钮的可访问名称来自 aria-label；图标必须 aria-hidden，避免 AT 重复播报。
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(button).not.toBeNull();
  const icon = button?.querySelector("svg");
  expect(icon).not.toBeNull();
  expect(icon?.getAttribute("aria-hidden")).toBe("true");
}

describe("buildStageSlots 阶段顶栏动作的装饰性图标", () => {
  it("frame 阶段：刷新展示框位置按钮保留 aria-label，图标对 AT 隐藏", () => {
    const { container, stageActions } = renderStageActions("frame");
    expectLabelledButtonWithHiddenIcon(container, "刷新展示框位置");

    // ToolbarButton 的 decorativeIcon 会兜底补 aria-hidden；仓库约定调用方
    // 仍需显式书写，这里直接断言 JSX icon 自带该属性，防止兜底掩盖回归。
    const icons = collectIconElements(stageActions);
    expect(icons).toHaveLength(1);
    for (const icon of icons) expect(icon.props["aria-hidden"]).toBe(true);
  });

  it("content 阶段：刷新与返回地图样式按钮保留 aria-label，图标对 AT 隐藏", () => {
    const { container, stageActions } = renderStageActions("content");
    expectLabelledButtonWithHiddenIcon(container, "刷新展示框位置");
    expectLabelledButtonWithHiddenIcon(container, "返回地图样式");

    const icons = collectIconElements(stageActions);
    expect(icons).toHaveLength(2);
    for (const icon of icons) expect(icon.props["aria-hidden"]).toBe(true);
  });
});
