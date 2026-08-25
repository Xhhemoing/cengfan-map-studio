import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { AssetPanelResourcePack } from "./asset-panel-upload-sections";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderResourcePack() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props = {
    onExportResourcePack: vi.fn(),
    onImportResourcePack: vi.fn(),
  };
  flushSync(() => root.render(<AssetPanelResourcePack {...props} />));
  return { container, props };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("AssetPanelResourcePack", () => {
  it("hides every decorative lucide icon from assistive technology", () => {
    const { container } = renderResourcePack();
    const icons = [...container.querySelectorAll("svg")];
    // 「导出资源包」按钮 Download + 「导入资源包」dropzone PackageOpen。
    expect(icons.length).toBe(2);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden"), `svg inside "${icon.closest("button, label")?.textContent?.trim()}"`).toBe("true");
    }
  });

  it("keeps the export button's accessible name and callback intact", () => {
    const { container, props } = renderResourcePack();
    const exportButton = [...container.querySelectorAll<HTMLButtonElement>("button.action-button")]
      .find((button) => button.textContent?.includes("导出资源包"));
    expect(exportButton).not.toBeUndefined();
    expect(exportButton!.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

    flushSync(() => exportButton!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onExportResourcePack).toHaveBeenCalledTimes(1);
  });
});
