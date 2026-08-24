import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type { ReactElement } from "react";
import { ProjectMissingScreen, StudioBrand } from "./StudioStatusScreens";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function render(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(element));
  return { container };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("StudioBrand", () => {
  it("hides the decorative brand icon from assistive technology", () => {
    const { container } = render(<StudioBrand />);
    const icons = [...container.querySelectorAll(".brand svg")];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden")).toBe("true");
    }
    expect(container.querySelector(".brand-label__full")?.textContent).toBe("蹭饭地图工作室");
  });
});

describe("ProjectMissingScreen", () => {
  it("hides the brand svg while keeping the heading and recovery button accessible", () => {
    const { container } = render(<ProjectMissingScreen />);

    const brandIcon = container.querySelector(".workbench-brand-mark svg");
    expect(brandIcon).not.toBeNull();
    expect(brandIcon?.getAttribute("aria-hidden")).toBe("true");

    expect(container.textContent).toContain("项目不存在或已删除");
    const backButton = container.querySelector('button[aria-label="返回项目列表"]');
    expect(backButton).not.toBeNull();
    expect(backButton?.getAttribute("aria-hidden")).toBeNull();
    expect(backButton?.textContent).toContain("返回项目列表");
  });
});
