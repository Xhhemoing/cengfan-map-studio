import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { ContentLayoutWorkspace } from "./ContentLayoutWorkspace";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

function renderWorkspace() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
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
      onClose={vi.fn()}
      onBackToMap={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      assetPanelProps={{ onApplyBackground: vi.fn() }}
    />,
  ));
  return { container };
}

describe("ContentLayoutWorkspace", () => {
  it("renders the content stage, outline, poster, inspector context, and layout actions", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('main[aria-label="内容与排版"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="内容大纲"]')).toBeNull();
    expect(container.querySelector('[aria-label="内容排版画布"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="内容对象属性"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="仅排未手调"]')).toBeNull();
    expect(container.querySelector('button[aria-label="全部重新排版"]')).toBeNull();
    expect(container.querySelector('button[aria-label="返回地图样式"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回编辑器"]')).not.toBeNull();
  });

  it("keeps layout management out of the canvas workspace", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('[aria-label="智能排版控制"]')).toBeNull();
    expect(container.querySelector('[aria-label="排版问题提示"]')).toBeNull();
  });
});
