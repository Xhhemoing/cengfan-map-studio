import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import type { LayoutHealthIssue } from "../../lib/layout-health";
import { ContentLayoutWorkspace } from "./ContentLayoutWorkspace";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

function renderWorkspace(layoutIssues: LayoutHealthIssue[] = []) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const onArrangeCards = vi.fn();
  const onLocateLayoutIssue = vi.fn();
  flushSync(() => root.render(
    <ContentLayoutWorkspace
      project={project}
      selection={{ type: "canvas" }}
      userAssets={[]}
      userFonts={[]}
      canUndo
      canRedo
      undoLabel="撤销内容修改"
      redoLabel="重做内容修改"
      onSelect={vi.fn()}
      onPatch={vi.fn()}
      onReset={vi.fn()}
      onArrangeCards={onArrangeCards}
      onRestoreCardPosition={vi.fn()}
      onRestoreAllCardPositions={vi.fn()}
      onClose={vi.fn()}
      onBackToMap={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      assetPanelProps={{ onApplyBackground: vi.fn() }}
      layoutIssues={layoutIssues}
      onLocateLayoutIssue={onLocateLayoutIssue}
    />,
  ));
  return { container, onArrangeCards, onLocateLayoutIssue };
}

describe("ContentLayoutWorkspace", () => {
  it("renders the content stage, outline, poster, inspector context, and layout actions", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('main[aria-label="内容与排版"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="内容大纲"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="内容排版画布"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="内容对象属性"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="仅排未手调"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="全部重新排版"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回地图样式"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回编辑器"]')).not.toBeNull();
  });

  it("delegates full arrangement confirmation to the App callback", () => {
    const { container, onArrangeCards } = renderWorkspace();
    const confirm = vi.spyOn(window, "confirm");

    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="仅排未手调"]')?.click());
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="全部重新排版"]')?.click());

    expect(onArrangeCards).toHaveBeenNthCalledWith(1, "untouched");
    expect(onArrangeCards).toHaveBeenNthCalledWith(2, "all");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("delegates layout issue clicks to the locator callback", () => {
    const issue = { id: "text-title", kind: "unreadable-text" as const, severity: "warning" as const, detail: "text-title 的文字与背景对比度不足" };
    const { container, onLocateLayoutIssue } = renderWorkspace([issue]);

    flushSync(() => container.querySelector<HTMLButtonElement>('section[aria-label="排版问题提示"] button')?.click());

    expect(onLocateLayoutIssue).toHaveBeenCalledWith(issue);
  });
});
