// 导出工程确认弹层的直接契约：可见性开关、资源包提示，以及导出在途时的确认闸门。
// App 分片 pin(src/App.project-persistence.test.tsx)从 App 那一侧盯同一份 DOM。
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UsePosterExportResult } from "../../lib/usePosterExport";
import { ExportProjectDialog } from "./ExportProjectDialog";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function posterExport(overrides: Partial<UsePosterExportResult> = {}): UsePosterExportResult {
  return {
    exportingPng: false,
    exportState: "idle",
    exportError: undefined,
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

function mount(props: Partial<UsePosterExportResult> = {}): { container: HTMLDivElement; exportProject: UsePosterExportResult } {
  const exportProject = posterExport(props);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<ExportProjectDialog posterExport={exportProject} />));
  return { container, exportProject };
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
});
