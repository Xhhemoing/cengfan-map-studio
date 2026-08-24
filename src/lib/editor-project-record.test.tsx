import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BrowserWorkspaceStores } from "./browser-workspace-store";
import { useEditorProjectRecord, type EditorProjectRecord } from "./editor-project-record";
import type { LocalWorkspaceOverwriteState } from "./incremental-workspace-sync";
import { createProjectDocument } from "./project-document";
import { createProjectPackage, type ProjectPackage } from "./project-package";
import type { ProjectStore, StoredProject } from "./project-store";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function pack(): ProjectPackage {
  return createProjectPackage({
    project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
    assets: [],
    fonts: [],
    customTemplates: [],
  });
}

function memoryStores(): BrowserWorkspaceStores {
  let mirror: string | null = null;
  let durable: ProjectPackage | null = null;
  return {
    mirror: { get: () => mirror, set: (value) => { mirror = value; } },
    durable: {
      get: async () => durable,
      set: async (value) => { durable = value; },
    },
  };
}

function memoryProjectStore(): { store: ProjectStore; written: StoredProject[] } {
  const written: StoredProject[] = [];
  return {
    written,
    store: {
      health: "persistent",
      list: async () => [],
      get: async () => null,
      put: async (project) => { written.push(project); },
      remove: async () => undefined,
    },
  };
}

function mount(projectId: string | undefined) {
  const states: LocalWorkspaceOverwriteState[] = [];
  const seen: EditorProjectRecord[] = [];
  const stores = memoryStores();
  const { store, written } = memoryProjectStore();

  function Probe() {
    seen.push(useEditorProjectRecord({
      projectId,
      stores,
      projectStore: store,
      onStateChange: (state) => states.push(state),
    }));
    return null;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  act(() => root.render(<Probe />));
  return { seen, states, written, rerender: () => act(() => root.render(<Probe />)) };
}

afterEach(() => {
  while (roots.length) {
    const entry = roots.pop()!;
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  window.localStorage.clear();
});

describe("useEditorProjectRecord", () => {
  it("seeds the id ref from the route and keeps the same refs across renders", () => {
    const harness = mount("project-7");
    harness.rerender();

    expect(harness.seen[0].record.idRef.current).toBe("project-7");
    expect(harness.seen[1].record).toBe(harness.seen[0].record);
    expect(harness.seen[1].workspaceSync).toBe(harness.seen[0].workspaceSync);
  });

  it("starts without a project id when the public editor is open", () => {
    expect(mount(undefined).seen[0].record.idRef.current).toBeNull();
  });

  it("writes the project record through the refs the caller filled in", async () => {
    const harness = mount("project-7");
    harness.seen[0].record.nameRef.current = "计算机一班";
    harness.seen[0].record.createdAtRef.current = "2026-01-01T00:00:00.000Z";

    await act(async () => { await harness.seen[0].workspaceSync.overwrite(pack()); });

    expect(harness.written).toHaveLength(1);
    expect(harness.written[0]).toMatchObject({
      id: "project-7",
      name: "计算机一班",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(harness.states.map((state) => state.status)).toEqual(["saving", "saved"]);
  });

  it("skips the project record entirely when there is no project id", async () => {
    const harness = mount(undefined);

    await act(async () => { await harness.seen[0].workspaceSync.overwrite(pack()); });

    expect(harness.written).toEqual([]);
    expect(harness.seen[0].record.saveErrorRef.current).toBeNull();
  });
});
