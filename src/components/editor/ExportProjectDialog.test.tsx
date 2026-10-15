// 导出工程确认弹层的直接契约：可见性开关、资源包提示，以及导出在途时的确认闸门。
// App 分片 pin(src/App.project-persistence.test.tsx)从 App 那一侧盯同一份 DOM。
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsePosterExportResult } from "../../lib/usePosterExport";
import { ExportProjectDialog } from "./ExportProjectDialog";
import { StudioTopbar } from "../StudioTopbar";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];
const openers: HTMLButtonElement[] = [];
const menus: HTMLDetailsElement[] = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  openers.splice(0).forEach((opener) => opener.remove());
  menus.splice(0).forEach((menu) => menu.remove());
});

function posterExport(overrides: Partial<UsePosterExportResult> = {}): UsePosterExportResult {
  return {
    exportingPng: false,
    exportState: "idle",
    exportError: undefined,
    exportIsStale: false,
    lastExportFileName: undefined,
    pngScale: 1,
    transparentExport: false,
    showProjectExportDialog: true,
    includeResourcesInProjectExport: true,
    setPngScale: vi.fn(),
    setTransparentExport: vi.fn(),
    setShowProjectExportDialog: vi.fn(),
    setIncludeResourcesInProjectExport: vi.fn(),
    openProjectExportDialog: vi.fn(),
    exportSvg: vi.fn(),
    exportPng: vi.fn(async () => {}),
    exportProjectPackage: vi.fn(),
    retryLastExport: vi.fn(),
    importProjectPackage: vi.fn(),
    ...overrides,
  };
}

function mount(props: Partial<UsePosterExportResult> = {}) {
  const exportProject = posterExport(props);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const render = (updates: Partial<UsePosterExportResult> = {}) => {
    Object.assign(exportProject, updates);
    flushSync(() => root.render(<ExportProjectDialog posterExport={exportProject} />));
  };
  render();
  return { container, exportProject, render };
}

function focusOpener() {
  const opener = document.createElement("button");
  opener.textContent = "导出工程";
  document.body.append(opener);
  openers.push(opener);
  opener.focus();
  return opener;
}

function keyDown(key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  flushSync(() => document.activeElement?.dispatchEvent(event));
  return event;
}

describe("ExportProjectDialog", () => {
  it("renders nothing until the dialog is asked for", () => {
    const { container } = mount({ showProjectExportDialog: false });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("confirms the export while the pipeline is idle", () => {
    const { container, exportProject } = mount();

    const confirm = container.querySelector<HTMLButtonElement>('button[aria-label="确认导出工程"]')!;
    expect(confirm.disabled).toBe(false);
    flushSync(() => confirm.click());
    expect(exportProject.exportProjectPackage).toHaveBeenCalledTimes(1);
  });

  it("closes the confirm gate while an export is in flight", () => {
    const { container, exportProject } = mount({ exportState: "exporting" });

    const confirm = container.querySelector<HTMLButtonElement>('button[aria-label="确认导出工程"]')!;
    expect(confirm.disabled).toBe(true);
    flushSync(() => confirm.click());
    expect(exportProject.exportProjectPackage).not.toHaveBeenCalled();
  });

  it("warns about the missing resource pack only when it is switched off", () => {
    expect(mount().container.textContent).not.toContain("其他设备可能缺少素材库条目和自定义字体");
    expect(mount({ includeResourcesInProjectExport: false }).container.textContent)
      .toContain("其他设备可能缺少素材库条目和自定义字体");
  });
  it("warns about complete source data with and without resources", () => {
    for (const include of [true, false]) {
      const notice = mount({ includeResourcesInProjectExport: include }).container.querySelector('[role="note"]');
      expect(notice?.textContent).toContain("隐藏学生或不显示姓名不会删除源数据");
      expect(notice?.textContent).toContain("不包含资源包也不会移除名单");
    }
  });

  it("focuses the title on opening and returns to the original export entry on close", () => {
    const opener = focusOpener();
    const { container, render } = mount();
    const title = container.querySelector("h2")!;
    const dialog = container.querySelector('[role="dialog"]')!;

    expect(document.activeElement).toBe(title);
    expect(dialog.getAttribute("aria-labelledby")).toBe(title.id);
    expect(dialog.getAttribute("aria-describedby")).toBe(container.querySelector("header p")!.id);
    render({ showProjectExportDialog: false });
    expect(document.activeElement).toBe(opener);
  });

  it("wraps Tab and Shift+Tab inside the dialog, including its initially focused title", () => {
    focusOpener();
    const { container } = mount();
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="关闭导出工程确认"]')!;
    const confirm = container.querySelector<HTMLButtonElement>('button[aria-label="确认导出工程"]')!;

    expect(keyDown("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
    keyDown("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    keyDown("Tab");
    expect(document.activeElement).toBe(close);
    container.querySelector<HTMLHeadingElement>("h2")!.focus();
    keyDown("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it("skips the disabled confirmation button when tabbing during export", () => {
    const { container } = mount({ exportState: "exporting" });
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="关闭导出工程确认"]')!;
    const cancel = container.querySelector<HTMLButtonElement>("footer .secondary-button")!;

    close.focus();
    keyDown("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(cancel);
    keyDown("Tab");
    expect(document.activeElement).toBe(close);
  });

  it("closes with Escape but keeps input method composition inside the dialog", () => {
    const opener = focusOpener();
    const { exportProject, render } = mount();

    keyDown("Escape", { isComposing: true });
    expect(exportProject.setShowProjectExportDialog).not.toHaveBeenCalled();
    expect(keyDown("Escape").defaultPrevented).toBe(true);
    expect(exportProject.setShowProjectExportDialog).toHaveBeenCalledExactlyOnceWith(false);
    render({ showProjectExportDialog: false });
    expect(document.activeElement).toBe(opener);
  });

  it("keeps background controls out of the focus sequence while open", () => {
    const opener = focusOpener();
    const { container } = mount();
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.focus();

    opener.focus();
    expect(document.activeElement).toBe(checkbox);
  });

  it("returns to the menu summary if the export entry's parent menu closed", () => {
    const menu = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "项目菜单";
    const opener = document.createElement("button");
    opener.textContent = "导出工程";
    menu.append(summary, opener);
    menu.open = true;
    document.body.append(menu);
    menus.push(menu);
    opener.focus();
    const { render } = mount();

    menu.open = false;
    render({ showProjectExportDialog: false });
    expect(document.activeElement).toBe(summary);
  });

  it("returns to visible topbar tools when opening the modal closes both disclosures", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    function TopbarExportHarness() {
      const [open, setOpen] = useState(false);
      return <>
        <style>{'.studio-topbar[data-tools-open="false"] .studio-topbar__tools { display: none; }'}</style>
        <StudioTopbar projectActions={
          <details open onBlur={(event) => {
            if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
              event.currentTarget.open = false;
            }
          }}>
            <summary>项目菜单</summary>
            <button type="button" onClick={() => setOpen(true)}>导出工程</button>
          </details>
        } />
        <ExportProjectDialog posterExport={posterExport({ showProjectExportDialog: open, setShowProjectExportDialog: setOpen })} />
      </>;
    }
    flushSync(() => root.render(<TopbarExportHarness />));
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="更多操作"]')!;
    flushSync(() => toggle.click());
    const opener = container.querySelector<HTMLButtonElement>("details button")!;
    opener.focus();
    flushSync(() => opener.click());

    expect(document.activeElement).toBe(container.querySelector("h2"));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("details")?.open).toBe(false);
    expect(getComputedStyle(container.querySelector(".studio-topbar__tools")!).display).toBe("none");
    keyDown("Escape");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it("keeps resource changes and close controls independent of export confirmation", () => {
    const { container, exportProject, render } = mount();
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.focus();
    flushSync(() => checkbox.click());
    expect(exportProject.setIncludeResourcesInProjectExport).toHaveBeenCalledWith(false);
    render({ includeResourcesInProjectExport: false });
    expect(document.activeElement).toBe(checkbox);
    expect(container.querySelector(".export-resource-warning")?.textContent).toContain("源工程不是公开图片");

    flushSync(() => container.querySelector<HTMLButtonElement>("footer .secondary-button")!.click());
    expect(exportProject.setShowProjectExportDialog).toHaveBeenCalledWith(false);
    expect(exportProject.exportProjectPackage).not.toHaveBeenCalled();
  });

});
