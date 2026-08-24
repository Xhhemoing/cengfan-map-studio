import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { WorkbenchHeader } from "./WorkbenchHeader";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderHeader() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props = {
    importInputRef: createRef<HTMLInputElement>(),
    onCreateProject: vi.fn(),
    onImportProject: vi.fn(),
  };
  flushSync(() => root.render(<WorkbenchHeader {...props} />));
  return { container, props };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("WorkbenchHeader", () => {
  it("hides every decorative lucide icon, including the brand mark, from assistive technology", () => {
    const { container } = renderHeader();
    const icons = [...container.querySelectorAll("svg")];
    // 品牌标 MapPinned + 导入 FolderOpen + 新建项目 Plus。
    expect(icons.length).toBe(3);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden"), `svg inside "${icon.parentElement?.textContent?.trim()}"`).toBe("true");
    }
    expect(container.querySelector(".workbench-brand-mark svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps accessible names and callbacks intact for the action buttons", () => {
    const { container, props } = renderHeader();
    const createButton = container.querySelector<HTMLButtonElement>('button[aria-label="新建项目"]')!;
    expect(createButton.textContent).toContain("新建项目");
    expect(container.querySelector('button[aria-label="导入工程包"]')).not.toBeNull();

    flushSync(() => createButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onCreateProject).toHaveBeenCalledTimes(1);
  });
});
