import { afterEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ExportProjectDialog } from "./ExportProjectDialog";
import { estimateExportSize } from "../lib/export-size-estimate";
import { MAX_PROJECT_PACKAGE_BYTES } from "../lib/import-file-limits";

let roots: Array<{ root: Root; container: HTMLElement }> = [];

function mount(element: ReactElement): HTMLElement {
  const container = document.createElement("div");
  // 焦点行为依赖真实文档树，容器必须挂到 body 上。
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(element));
  return container;
}

afterEach(() => {
  roots.forEach(({ root, container }) => {
    root.unmount();
    container.remove();
  });
  roots = [];
  vi.restoreAllMocks();
});

function resourceCheckbox(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[aria-label="导出时包含资源包"]')!;
}

function toggleResources(container: HTMLElement): void {
  flushSync(() => resourceCheckbox(container).click());
}

function textOf(container: HTMLElement, selector: string): string {
  return container.querySelector(selector)?.textContent ?? "";
}

/** 素材撑到刚好越过 24MB，取消勾选后工程本体仍然远在上限内。 */
function estimateOfOversizedResources() {
  return estimateExportSize({
    rest: { project: { students: [] } },
    assets: [{
      id: "asset-huge",
      label: "全班合影原图",
      src: `data:image/png;base64,${"A".repeat(MAX_PROJECT_PACKAGE_BYTES)}`,
    }],
  });
}

function ExportHarness({
  sizeEstimate,
  onConfirm = vi.fn(),
}: {
  sizeEstimate?: ReturnType<typeof estimateExportSize>;
  onConfirm?: () => void;
}) {
  const [includeResources, setIncludeResources] = useState(true);
  return (
    <ExportProjectDialog
      includeResources={includeResources}
      onIncludeResourcesChange={setIncludeResources}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
      sizeEstimate={sizeEstimate}
    />
  );
}

describe("ExportProjectDialog", () => {
  it("shows the estimated size and recomputes it when resources are unchecked", () => {
    const estimate = estimateExportSize({
      rest: { project: { students: [] } },
      assets: [{ id: "asset-1", label: "贴图", src: `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}` }],
    });
    const container = mount(<ExportHarness sizeEstimate={estimate} />);

    expect(textOf(container, ".export-size-estimate")).toBe("预计导出约 3.0 MB（其中资源包约 3.0 MB）");
    expect(container.querySelector(".export-size-warning")).toBeNull();

    toggleResources(container);

    expect(textOf(container, ".export-size-estimate")).toMatch(/^预计导出约 \d+ KB$/);
    expect(textOf(container, ".export-size-estimate")).not.toContain("其中资源包");
  });

  it("warns that an over-budget export can never be imported back", () => {
    const container = mount(<ExportHarness sizeEstimate={estimateOfOversizedResources()} />);

    const warning = container.querySelector(".export-size-warning");
    expect(warning?.getAttribute("role")).toBe("alert");
    expect(warning?.textContent).toContain("超过导入上限 24.0 MB");
    expect(warning?.textContent).toContain("以后无法再导入回来");
    expect(warning?.textContent).toContain("取消勾选「包含资源包」");
  });

  it("drops the warning once the checkbox brings the export back under the ceiling", () => {
    const container = mount(<ExportHarness sizeEstimate={estimateOfOversizedResources()} />);
    expect(container.querySelector(".export-size-warning")).not.toBeNull();

    toggleResources(container);

    expect(container.querySelector(".export-size-warning")).toBeNull();
    expect(textOf(container, ".export-resource-warning")).toContain("其他设备可能缺少素材库条目");
  });

  it("still lets the user export after reading the warning", () => {
    const onConfirm = vi.fn();
    const container = mount(<ExportHarness sizeEstimate={estimateOfOversizedResources()} onConfirm={onConfirm} />);

    const form = container.querySelector("form")!;
    flushSync(() => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog usable when no estimate is supplied", () => {
    const container = mount(<ExportHarness />);

    expect(container.querySelector(".export-size-estimate")).toBeNull();
    expect(container.querySelector(".export-size-warning")).toBeNull();
    expect(resourceCheckbox(container).checked).toBe(true);
  });
});
