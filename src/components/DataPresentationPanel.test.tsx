import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataPresentationPanel } from "./DataPresentationPanel";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("DataPresentationPanel", () => {
  it("exposes the five supported data views", () => {
    const onChangeDataView = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    flushSync(() => root.render(
      <DataPresentationPanel
        dataView="province"
        onChangeDataView={onChangeDataView}
        templates={[]}
        currentTemplateId="original"
        customTemplates={[]}
        onApplyTemplate={vi.fn()}
        onApplyCustomTemplate={vi.fn()}
        onSaveTemplate={vi.fn()}
        onOpenGlobalSettings={vi.fn()}
      />,
    ));

    expect(container.querySelectorAll('[role="group"][aria-label="地图呈现方式"] button')).toHaveLength(5);
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="切换为地图图钉"]')!.click());
    expect(onChangeDataView).toHaveBeenCalledWith("pins");
  });
});
