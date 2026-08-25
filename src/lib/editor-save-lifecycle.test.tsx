import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useWorkspaceSaveLifecycle, type WorkspaceSaveLifecycle } from "./editor-save-lifecycle";
import type { EditorProjectRecordRefs } from "./editor-workspace-persistence";
import type { EditorWorkspaceSnapshot } from "./editor-workspace-state";
import { LocalWorkspaceOverwrite } from "./incremental-workspace-sync";
import { createProjectDocument } from "./project-document";
import type { ProjectPackage } from "./project-package";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function workspace(): EditorWorkspaceSnapshot {
  return {
    project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
    assets: [],
    fonts: [],
    customTemplates: [],
    renderSettings: { mode: "normal", fixedFps: 20 },
  };
}

function recordRefs(projectId: string | null): EditorProjectRecordRefs {
  return {
    idRef: { current: projectId },
    nameRef: { current: "小班去向图" },
    createdAtRef: { current: new Date(0).toISOString() },
    saveErrorRef: { current: null },
  };
}

interface Harness {
  lifecycle: WorkspaceSaveLifecycle;
  saved: ProjectPackage[];
  statuses: string[];
  record: EditorProjectRecordRefs;
  sync: LocalWorkspaceOverwrite;
  hasLocalEdits: { current: boolean };
  rerender(next: { projectLoading?: boolean; projectMissing?: boolean }): void;
}

function mount(options: {
  projectId?: string;
  projectLoading?: boolean;
  projectMissing?: boolean;
  saveLocal?(pack: ProjectPackage): Promise<void>;
} = {}): Harness {
  const saved: ProjectPackage[] = [];
  const statuses: string[] = [];
  const record = recordRefs(options.projectId ?? null);
  const hasLocalEdits = { current: false };
  const sync = new LocalWorkspaceOverwrite({
    saveLocal: options.saveLocal ?? (async (pack) => { saved.push(pack); }),
  });

  const harness = {
    lifecycle: undefined as unknown as WorkspaceSaveLifecycle,
    saved,
    statuses,
    record,
    sync,
    hasLocalEdits,
  } as Harness;

  function Probe({ loading, missing }: { loading: boolean; missing: boolean }) {
    harness.lifecycle = useWorkspaceSaveLifecycle({
      projectId: options.projectId,
      projectLoading: loading,
      projectMissing: missing,
      record,
      workspaceSync: sync,
      readWorkspace: workspace,
      hasLocalEdits: () => hasLocalEdits.current,
      reportStatus: (message) => statuses.push(message),
    });
    return null;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  act(() => root.render(
    <Probe loading={options.projectLoading ?? false} missing={options.projectMissing ?? false} />,
  ));

  harness.rerender = (next) => {
    act(() => root.render(
      <Probe
        loading={next.projectLoading ?? options.projectLoading ?? false}
        missing={next.projectMissing ?? options.projectMissing ?? false}
      />,
    ));
  };
  return harness;
}

beforeEach(() => {
  window.location.hash = "";
});

afterEach(() => {
  while (roots.length) {
    const entry = roots.pop()!;
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  vi.restoreAllMocks();
});

describe("useWorkspaceSaveLifecycle", () => {
  it("saves once and then navigates back to the workbench", async () => {
    const harness = mount({ projectId: "project-1" });

    await act(async () => { await harness.lifecycle.backToWorkbench(); });

    expect(harness.saved).toHaveLength(1);
    expect(window.location.hash).toBe("#/");
  });

  it("ignores a second back navigation while the first is still in flight", async () => {
    const harness = mount({ projectId: "project-1" });

    await act(async () => {
      await Promise.all([harness.lifecycle.backToWorkbench(), harness.lifecycle.backToWorkbench()]);
    });

    expect(harness.saved).toHaveLength(1);
  });

  it("navigates without saving while the project is still loading or missing", async () => {
    const loading = mount({ projectId: "project-1", projectLoading: true });
    await act(async () => { await loading.lifecycle.backToWorkbench(); });
    expect(loading.saved).toEqual([]);
    expect(window.location.hash).toBe("#/");

    window.location.hash = "";
    const missing = mount({ projectId: "project-2", projectMissing: true });
    await act(async () => { await missing.lifecycle.backToWorkbench(); });
    expect(missing.saved).toEqual([]);
    expect(window.location.hash).toBe("#/");
  });

  it("saves on page leave once the workspace has local edits", async () => {
    const harness = mount({ projectId: "project-1" });
    harness.hasLocalEdits.current = true;

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
    });

    expect(harness.saved).toHaveLength(1);
  });

  it("does not save on page leave without a project id", async () => {
    const harness = mount();
    harness.hasLocalEdits.current = true;

    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(harness.saved).toEqual([]);
  });

  it("reads the loading state from the latest render, not from the render that armed the listener", async () => {
    const harness = mount({ projectId: "project-1" });
    harness.hasLocalEdits.current = true;
    harness.rerender({ projectLoading: true });

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
    });

    expect(harness.saved).toEqual([]);
  });

  it("stops saving on page leave after the back navigation already saved", async () => {
    const harness = mount({ projectId: "project-1" });
    harness.hasLocalEdits.current = true;

    await act(async () => { await harness.lifecycle.backToWorkbench(); });
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
    });

    expect(harness.saved).toHaveLength(1);
  });

  it("stops listening for page leave after unmount", async () => {
    const harness = mount({ projectId: "project-1" });
    harness.hasLocalEdits.current = true;
    const entry = roots.pop()!;
    act(() => entry.root.unmount());
    entry.container.remove();

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"));
      await Promise.resolve();
    });

    expect(harness.saved).toEqual([]);
  });

  it("reports the force-save outcome, calling out a project-record failure on its own", async () => {
    const harness = mount({ projectId: "project-1" });

    await act(async () => { await harness.lifecycle.overwriteBrowserStorage(); });
    expect(harness.statuses).toEqual(["强制保存完成：全部数据已覆盖到浏览器本地"]);

    const failing = mount({
      projectId: "project-2",
      saveLocal: async () => { throw new Error("项目记录写入失败"); },
    });
    failing.record.saveErrorRef.current = "QuotaExceededError";
    vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => { await failing.lifecycle.overwriteBrowserStorage(); });

    expect(failing.statuses).toEqual([
      "浏览器本地已保存，但项目记录写入失败（QuotaExceededError）。请导出工程包备份，否则项目列表不会更新。",
    ]);
  });
});
