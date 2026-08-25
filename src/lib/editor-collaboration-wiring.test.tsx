import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { UserAsset } from "./assets";
import type { UserFont } from "./fonts";
import { LocalWorkspaceOverwrite, type LocalWorkspaceOverwriteState } from "./incremental-workspace-sync";
import { applyTransaction, createProjectDocument, type ProjectDocument } from "./project-document";
import { changeDataViewTransaction } from "./student-transactions";
import { createProjectPackage, type ProjectPackage } from "./project-package";
import type { RenderSettings } from "./render-settings";
import type { CustomTemplateRecord } from "./template-store";
import type { UseCollaborationRoomOptions, UseCollaborationRoomResult } from "./useCollaborationRoom";

/**
 * 房间控制器自己有独立的测试;这里只关心「工作区」这一侧的接线,所以把控制器换成一个
 * 只记录入参的桩,拿到它收到的 currentPackage / applyPackage 直接调。
 */
let roomOptions: UseCollaborationRoomOptions | null = null;
const stubRoom = {
  roomId: null,
  roomAccessToken: null,
  roomRole: null,
  roomVersion: 0,
  connectionHealCount: 0,
  canEdit: true,
} as unknown as UseCollaborationRoomResult;

vi.mock("./useCollaborationRoom", () => ({
  useCollaborationRoom: (options: UseCollaborationRoomOptions) => {
    roomOptions = options;
    return stubRoom;
  },
}));

const { useEditorCollaboration } = await import("./editor-collaboration-wiring");

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];
const RENDER_SETTINGS: RenderSettings = { mode: "normal", fixedFps: 20 };

function localProject(): ProjectDocument {
  // 真的走一次事务,撤销栈里才有一条货真价实的历史可以拿来比对。
  const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  return applyTransaction(base, changeDataViewTransaction("city"));
}

function remotePack(): ProjectPackage {
  const remote = createProjectDocument({ students: [], templateId: "cartoon", dataView: "province" });
  remote.history = { past: [], future: [] };
  return createProjectPackage({ project: remote, assets: [], fonts: [], customTemplates: [] });
}

function mount(local: ProjectDocument) {
  const applied = {
    projects: [] as ProjectDocument[],
    assets: [] as UserAsset[][],
    fonts: [] as UserFont[][],
    templates: [] as CustomTemplateRecord[][],
    settings: [] as RenderSettings[],
    previewCleared: 0,
  };
  const syncStates: LocalWorkspaceOverwriteState[] = [];
  const sync = new LocalWorkspaceOverwrite({
    saveLocal: async () => undefined,
    onStateChange: (state) => syncStates.push(state),
  });
  let current = local;

  function Probe() {
    useEditorCollaboration({
      clientId: "collab-client-test",
      project: current,
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: RENDER_SETTINGS,
      readWorkspace: () => ({
        project: current,
        assets: [],
        fonts: [],
        customTemplates: [],
        renderSettings: RENDER_SETTINGS,
      }),
      workspaceSync: sync,
      sink: {
        setProject: (update) => {
          const next = typeof update === "function" ? update(current) : update;
          current = next;
          applied.projects.push(next);
        },
        setUserAssets: (assets) => applied.assets.push(assets),
        setUserFonts: (fonts) => applied.fonts.push(fonts),
        setCustomTemplates: (templates) => applied.templates.push(templates),
        setRenderSettings: (settings) => applied.settings.push(settings),
        clearPreviewCommands: () => { applied.previewCleared += 1; },
      },
    });
    return null;
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  act(() => root.render(<Probe />));
  return { applied, syncStates };
}

beforeEach(() => {
  roomOptions = null;
});

afterEach(() => {
  while (roots.length) {
    const entry = roots.pop()!;
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("useEditorCollaboration", () => {
  it("hands the room controller one shared set of refs", () => {
    mount(localProject());

    expect(roomOptions?.clientId).toBe("collab-client-test");
    expect(roomOptions?.baselineRef.current).toBeNull();
    expect(roomOptions?.versionRef.current).toBe(0);
  });

  it("sends a package with the local undo history stripped", () => {
    mount(localProject());

    const pack = roomOptions!.currentPackage("2026-05-05T00:00:00.000Z");

    expect(pack.exportedAt).toBe("2026-05-05T00:00:00.000Z");
    expect(pack.project.history).toEqual({ past: [], future: [] });
  });

  it("keeps the local history and bumps the version when a shared package arrives", () => {
    const local = localProject();
    const harness = mount(local);

    act(() => { roomOptions!.applyPackage(remotePack(), 3); });

    const merged = harness.applied.projects.at(-1)!;
    expect(merged.templateId).toBe("cartoon");
    expect(merged.history).toEqual(local.history);
    expect(merged.version).toBe(local.version + 1);
  });

  it("clears the preview and marks the workspace pending on a shared package", () => {
    const harness = mount(localProject());

    act(() => { roomOptions!.applyPackage(remotePack(), 3); });

    expect(harness.applied.previewCleared).toBe(1);
    expect(harness.applied.assets).toHaveLength(1);
    expect(harness.applied.fonts).toHaveLength(1);
    expect(harness.applied.templates).toHaveLength(1);
    expect(harness.applied.settings).toHaveLength(1);
    expect(harness.syncStates.map((state) => state.status)).toContain("pending");
  });
});
