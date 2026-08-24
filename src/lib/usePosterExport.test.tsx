import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileMatchesAccept } from "./file-accept";
import { createProjectDocument } from "./project-document";
import { downloadProjectPackage, PROJECT_PACKAGE_FILE_ACCEPT } from "./project-package";
import { DEFAULT_RENDER_SETTINGS } from "./render-settings";
import { usePosterExport, type UsePosterExportOptions, type UsePosterExportResult } from "./usePosterExport";

vi.mock("./project-package", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./project-package")>();
  return { ...actual, downloadProjectPackage: vi.fn() };
});

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderHook(overrides: Partial<UsePosterExportOptions> = {}): { current: UsePosterExportResult } {
  const ref: { current: UsePosterExportResult } = { current: undefined as unknown as UsePosterExportResult };
  function Host() {
    ref.current = usePosterExport({
      posterRef: { current: null },
      project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
      userAssets: [],
      userFonts: [],
      customTemplates: [],
      renderSettings: DEFAULT_RENDER_SETTINGS,
      applyImportedPackage: vi.fn(),
      reportStatus: vi.fn(),
      ...overrides,
    });
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<Host />));
  return ref;
}

beforeEach(() => {
  vi.mocked(downloadProjectPackage).mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-24T09:30:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  for (const { root, container } of roots.splice(0)) {
    flushSync(() => root.unmount());
    container.remove();
  }
});

describe("usePosterExport project package naming", () => {
  it("names the package after the project and export date", () => {
    const hook = renderHook({ getProjectName: () => "高三3班" });
    flushSync(() => hook.current.exportProjectPackage());

    expect(vi.mocked(downloadProjectPackage).mock.calls[0]?.[1]).toBe("高三3班-工程包-2026-08-24.json");
    expect(hook.current.lastExportFileName).toBe("高三3班-工程包-2026-08-24.json");
  });

  it("falls back to the default base name and stays importable", () => {
    const hook = renderHook({ getProjectName: () => "  " });
    flushSync(() => hook.current.exportProjectPackage());

    const fileName = vi.mocked(downloadProjectPackage).mock.calls[0]?.[1] ?? "";
    expect(fileName).toBe("我的毕业去向图-工程包-2026-08-24.json");
    expect(fileMatchesAccept(new File(["{}"], fileName), PROJECT_PACKAGE_FILE_ACCEPT)).toBe(true);
  });
});
