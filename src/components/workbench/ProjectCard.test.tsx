import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProjectCard } from "./ProjectCard";
import { createSampleProject } from "../../lib/project-store";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderCard(menuOpen = true) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props = {
    project: createSampleProject(),
    updatedAtLabel: "刚刚",
    menuOpen,
    onOpen: vi.fn(),
    onToggleMenu: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onExport: vi.fn(),
    onDelete: vi.fn(),
  };
  flushSync(() => root.render(<ProjectCard {...props} />));
  return { container, props };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("ProjectCard", () => {
  it("hides every decorative lucide icon from assistive technology", () => {
    const { container } = renderCard(true);
    const icons = [...container.querySelectorAll("svg")];
    // 菜单开关 MoreHorizontal + 重命名 Pencil + 复制 Copy + 导出 FolderOpen + 删除 Trash2。
    expect(icons.length).toBe(5);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden"), `svg inside "${icon.parentElement?.textContent?.trim()}"`).toBe("true");
    }
  });

  it("keeps accessible names for the menu toggle and visible text for menu items", () => {
    const { container } = renderCard(true);
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="项目菜单"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    const menuItems = [...container.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
    expect(menuItems.map((item) => item.textContent?.trim())).toEqual(["重命名", "复制", "导出工程包", "删除"]);
  });
});
