import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BrowserWorkspaceStores } from "./browser-workspace-store";
import type { EditorProjectRecordRefs } from "./editor-workspace-persistence";
import {
  useEditorWorkspaceHydration,
  type EditorWorkspaceHydration,
  type WorkspaceHydrationSink,
} from "./editor-workspace-hydration";
import { LocalWorkspaceOverwrite, type LocalWorkspaceOverwriteState } from "./incremental-workspace-sync";
import type { MissingProjectObservation } from "./missing-project-notice";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { createProjectPackage, type ProjectPackage } from "./project-package";
import type { ProjectStore, StoredProject } from "./project-store";
import type { RenderSettings } from "./render-settings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];
const RENDER_SETTINGS: RenderSettings = { mode: "normal", fixedFps: 20 };

function project(title = "初始标题"): ProjectDocument {
  const document = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  document.textElements = document.textElements.map((element) => (
    element.id === "text-title" ? { ...element, content: title } : element
  ));
  return document;
}

function packOf(document: ProjectDocument, exportedAt: string): ProjectPackage {
  return { ...createProjectPackage({ project: document, assets: [], fonts: [], customTemplates: [] }), exportedAt };
}

function emptyStores(durable: ProjectPackage | null = null): BrowserWorkspaceStores {
  return {
    mirror: { get: () => null, set: () => undefined },
    durable: { get: async () => durable, set: async () => undefined },
  };
}

/** 读取永远悬着的浏览器存储:用来把「水合尚未落地」这一段时间钉住。 */
function hangingStores(): BrowserWorkspaceStores {
  return {
    mirror: { get: () => null, set: () => undefined },
    durable: { get: () => new Promise<ProjectPackage | null>(() => {}), set: async () => undefined },
  };
}

function recordRefs(): EditorProjectRecordRefs {
  return {
    idRef: { current: null },
    nameRef: { current: null },
    createdAtRef: { current: new Date(0).toISOString() },
    saveErrorRef: { current: null },
  };
}

function projectStoreWith(record: StoredProject | null, health: "persistent" | "memory" = "persistent"): ProjectStore {
  return {
    health,
    list: async () => [],
    get: async () => record,
    put: async () => undefined,
    remove: async () => undefined,
  };
}

interface Harness {
  hydration: EditorWorkspaceHydration;
  sync: LocalWorkspaceOverwrite;
  syncStates: LocalWorkspaceOverwriteState[];
  applied: ProjectDocument[];
  reported: string[];
  missing: Array<MissingProjectObservation | null>;
  loading: boolean[];
  record: EditorProjectRecordRefs;
  setWorkspaceProject(next: ProjectDocument): Promise<void>;
}

async function mount(options: {
  projectId?: string;
  browserStores?: BrowserWorkspaceStores;
  initialExportedAt?: string;
  projectStore?: ProjectStore;
} = {}): Promise<Harness> {
  const syncStates: LocalWorkspaceOverwriteState[] = [];
  const applied: ProjectDocument[] = [];
  const reported: string[] = [];
  const missing: Array<MissingProjectObservation | null> = [];
  const loading: boolean[] = [];
  const record = recordRefs();
  const sync = new LocalWorkspaceOverwrite({
    saveLocal: async () => undefined,
    onStateChange: (state) => syncStates.push(state),
  });
  const sink: WorkspaceHydrationSink = {
    setProject: (next) => applied.push(next),
    setUserAssets: () => undefined,
    setUserFonts: () => undefined,
    setCustomTemplates: () => undefined,
    setRenderSettings: () => undefined,
    clearPreviewCommands: () => undefined,
    setSyncState: (state) => syncStates.push(state),
    setProjectMissing: (observation) => missing.push(observation),
    setProjectLoading: (value) => loading.push(value),
    reportStatus: (message) => reported.push(message),
  };

  const harness = { sync, syncStates, applied, reported, missing, loading, record } as Harness;

  function Probe({ current }: { current: ProjectDocument }) {
    harness.hydration = useEditorWorkspaceHydration({
      project: current,
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: RENDER_SETTINGS,
      projectId: options.projectId,
      browserStores: options.browserStores ?? emptyStores(),
      initialExportedAt: options.initialExportedAt,
      projectStore: options.projectStore ?? projectStoreWith(null),
      record,
      workspaceSync: sync,
      sink,
    });
    return null;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => { root.render(<Probe current={project()} />); });

  harness.setWorkspaceProject = async (next) => {
    await act(async () => { root.render(<Probe current={next} />); });
  };
  return harness;
}

afterEach(() => {
  while (roots.length) {
    const entry = roots.pop()!;
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  vi.restoreAllMocks();
});

describe("useEditorWorkspaceHydration", () => {
  it("does not mark the very first render as an unsaved edit", async () => {
    const harness = await mount();

    expect(harness.syncStates).toEqual([]);
    expect(harness.hydration.hasLocalEdits()).toBe(false);
  });

  it("marks pending and republishes the workspace once it changes", async () => {
    const harness = await mount();

    await harness.setWorkspaceProject(project("用户改过的标题"));

    expect(harness.syncStates.map((state) => state.status)).toEqual(["pending"]);
    expect(harness.hydration.readWorkspace().project.textElements
      .find((element) => element.id === "text-title")?.content).toBe("用户改过的标题");
  });

  it("counts an edit made before hydration settles as an unsaved local edit", async () => {
    // 水合还没落地时的编辑必须记下来:异步读回来的旧工作区不能把它盖掉。
    const harness = await mount({ browserStores: hangingStores() });

    await harness.setWorkspaceProject(project("水合前改的标题"));

    expect(harness.hydration.hasLocalEdits()).toBe(true);
  });

  it("adopts a fresher browser workspace without counting it as a local edit", async () => {
    const stored = packOf(project("镜像里的标题"), "2026-02-02T00:00:00.000Z");
    const harness = await mount({
      browserStores: emptyStores(stored),
      initialExportedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(harness.applied).toHaveLength(1);
    expect(harness.reported).toEqual(["已从浏览器本地完整工作区恢复"]);
    expect(harness.syncStates.at(-1)).toEqual({ status: "saved", savedAt: "2026-02-02T00:00:00.000Z" });

    // 水合写回来的那一次不是用户编辑:再渲染一次必须既不 pending,也不算未保存改动。
    await harness.setWorkspaceProject(project("镜像里的标题"));
    expect(harness.hydration.hasLocalEdits()).toBe(false);
    expect(harness.syncStates.map((state) => state.status)).not.toContain("pending");
  });

  it("leaves a stale browser workspace alone", async () => {
    const stored = packOf(project("旧镜像"), "2026-01-01T00:00:00.000Z");
    const harness = await mount({
      browserStores: emptyStores(stored),
      initialExportedAt: "2026-03-03T00:00:00.000Z",
    });

    expect(harness.applied).toEqual([]);
    expect(harness.reported).toEqual([]);
  });

  it("never adopts the browser mirror in project mode", async () => {
    const stored = packOf(project("镜像里的标题"), "2026-02-02T00:00:00.000Z");
    const harness = await mount({
      projectId: "project-9",
      browserStores: emptyStores(stored),
      projectStore: projectStoreWith(null),
    });

    expect(harness.reported).toEqual([]);
    expect(harness.record.idRef.current).toBe("project-9");
  });

  it("opens a stored project and fills in the record identity", async () => {
    const stored: StoredProject = {
      id: "project-9",
      name: "计算机一班",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-02T00:00:00.000Z",
      pack: packOf(project("项目里的标题"), "2026-02-02T00:00:00.000Z"),
    };
    const harness = await mount({ projectId: "project-9", projectStore: projectStoreWith(stored) });

    expect(harness.record.nameRef.current).toBe("计算机一班");
    expect(harness.record.createdAtRef.current).toBe("2026-01-01T00:00:00.000Z");
    expect(harness.applied).toHaveLength(1);
    expect(harness.loading).toEqual([false]);
    expect(harness.reported).toEqual(["已打开项目「计算机一班」"]);
  });

  it("reports a missing project instead of applying an empty workspace", async () => {
    const harness = await mount({ projectId: "project-9", projectStore: projectStoreWith(null, "memory") });

    expect(harness.applied).toEqual([]);
    expect(harness.missing.at(-1)).toEqual({
      reason: "not-found",
      healthAtRequest: "memory",
      health: "memory",
    });
    expect(harness.reported).toEqual([]);
  });
});
