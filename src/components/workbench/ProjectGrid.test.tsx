import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProjectGrid } from "./ProjectGrid";
import type { StoredProject } from "../../lib/project-store";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderGrid(overrides: Partial<{ projects: StoredProject[]; loading: boolean; hasError: boolean }> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props = {
    projects: [] as StoredProject[],
    loading: false,
    hasError: false,
    openMenuId: null,
    formatUpdatedAt: (value: string) => value,
    onOpen: vi.fn(),
    onToggleMenu: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onExport: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  flushSync(() => root.render(<ProjectGrid {...props} />));
  return { container, props };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("ProjectGrid empty states", () => {
  it("hides the loading empty-state icon from assistive technology while keeping the status text exposed", () => {
    const { container } = renderGrid({ loading: true });
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.classList.contains("workbench-empty")).toBe(true);
    // 空状态容器本身不能被隐藏，读屏要能读到加载文案。
    expect(status?.getAttribute("aria-hidden")).toBeNull();
    expect(status?.textContent).toContain("正在加载项目");

    const icon = container.querySelector(".workbench-empty__mark svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("hides the no-projects empty-state icon from assistive technology", () => {
    const { container } = renderGrid();
    const empty = container.querySelector(".workbench-empty");
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain("还没有项目");
    expect(empty?.getAttribute("aria-hidden")).toBeNull();

    const icon = container.querySelector(".workbench-empty__mark svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });
});
