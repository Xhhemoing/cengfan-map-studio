import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataPresentationPanel } from "./DataPresentationPanel";
import { PRESENTATION_VIEWS } from "../lib/data-presentation";
import type { DataViewId } from "../lib/project-data";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function render(overrides: Partial<React.ComponentProps<typeof DataPresentationPanel>> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props = {
    dataView: "province" as DataViewId,
    onChangeDataView: vi.fn(),
    templates: [{ id: "original" as const, name: "原始" }],
    currentTemplateId: "original",
    customTemplates: [],
    onApplyTemplate: vi.fn(),
    onApplyCustomTemplate: vi.fn(),
    onSaveTemplate: vi.fn(),
    onOpenGlobalSettings: vi.fn(),
    ...overrides,
  };
  flushSync(() => root.render(<DataPresentationPanel {...props} />));
  return { container, props };
}

describe("DataPresentationPanel", () => {
  it("exposes the five supported data views", () => {
    const { container, props } = render({ templates: [] });

    expect(container.querySelectorAll('[role="group"][aria-label="地图呈现方式"] button')).toHaveLength(5);
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="切换为地图图钉"]')!.click());
    expect(props.onChangeDataView).toHaveBeenCalledWith("pins");
  });

  it("offers every presentation view with an accessible switch label", () => {
    const { container } = render();

    for (const view of PRESENTATION_VIEWS) {
      expect(container.querySelector(`button[aria-label="切换为地图${view.label}"]`)).not.toBeNull();
    }
  });

  it("describes only the active view and announces the change politely", () => {
    const { container } = render({ dataView: "heat" });

    const descriptions = container.querySelector(".data-presentation-panel__descriptions")!;
    expect(descriptions.getAttribute("aria-live")).toBe("polite");
    expect(descriptions.textContent).toBe("用颜色表达数量");
  });

  it("reports the picked view and opens global visual settings", () => {
    const { container, props } = render();

    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="切换为地图城市"]')!.click());
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="打开全局视觉设置"]')!.click());

    expect(props.onChangeDataView).toHaveBeenCalledWith("city");
    expect(props.onOpenGlobalSettings).toHaveBeenCalledTimes(1);
  });
});
