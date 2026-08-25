import { describe, expect, it } from "vitest";
import {
  applyWorkspacePackage,
  collaborationPackage,
  mergeSharedProject,
  restoredSceneSelection,
  type EditorWorkspaceSetters,
  type EditorWorkspaceSnapshot,
} from "./editor-workspace-state";
import { applyTransaction, createProjectDocument, type ProjectDocument } from "./project-document";
import { createProjectPackageEnvelope, type ProjectPackage } from "./project-package";
import { DEFAULT_RENDER_SETTINGS } from "./render-settings";
import { DEFAULT_WORKSPACE_SESSION } from "./workspace-session";

function projectWithHistory(): ProjectDocument {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  return applyTransaction(project, {
    id: "tx-test",
    label: "改标题",
    source: "manual",
    apply: (current) => ({ ...current, textElements: [] }),
  });
}

function workspace(project: ProjectDocument): EditorWorkspaceSnapshot {
  return { project, assets: [], fonts: [], customTemplates: [], renderSettings: DEFAULT_RENDER_SETTINGS };
}

describe("restoredSceneSelection", () => {
  it("restores a province over any other remembered object", () => {
    expect(restoredSceneSelection({ ...DEFAULT_WORKSPACE_SESSION, selectedProvince: "浙江", selectedObject: "cards" }))
      .toEqual({ type: "province", province: "浙江" });
  });

  it("restores the two singleton objects by name", () => {
    expect(restoredSceneSelection({ ...DEFAULT_WORKSPACE_SESSION, selectedObject: "cards" })).toEqual({ type: "cards" });
    expect(restoredSceneSelection({ ...DEFAULT_WORKSPACE_SESSION, selectedObject: "guests" })).toEqual({ type: "guests" });
  });

  it("treats any other remembered object as an asset instance", () => {
    expect(restoredSceneSelection({ ...DEFAULT_WORKSPACE_SESSION, selectedObject: "asset-7" }))
      .toEqual({ type: "asset", id: "asset-7" });
  });

  it("opens on the subtitle when the session remembers nothing", () => {
    expect(restoredSceneSelection(DEFAULT_WORKSPACE_SESSION)).toEqual({ type: "text", id: "text-note" });
  });
});

describe("applyWorkspacePackage", () => {
  function recordingSetters(): { calls: string[]; setters: EditorWorkspaceSetters } {
    const calls: string[] = [];
    return {
      calls,
      setters: {
        setProject: () => calls.push("project"),
        setUserAssets: () => calls.push("assets"),
        setUserFonts: () => calls.push("fonts"),
        setCustomTemplates: () => calls.push("templates"),
        setRenderSettings: () => calls.push("renderSettings"),
        clearPreviewCommands: () => calls.push("preview"),
      },
    };
  }

  it("hands every part of the package to its own setter and clears the preview last", () => {
    const { calls, setters } = recordingSetters();

    applyWorkspacePackage(setters, createProjectPackageEnvelope(workspace(projectWithHistory())));

    expect(calls).toEqual(["project", "assets", "fonts", "templates", "renderSettings", "preview"]);
  });

  it("passes the restored values through untouched", () => {
    const pack = createProjectPackageEnvelope(workspace(projectWithHistory()));
    const seen: Record<string, unknown> = {};

    applyWorkspacePackage({
      setProject: (project) => { seen.project = project; },
      setUserAssets: (assets) => { seen.assets = assets; },
      setUserFonts: (fonts) => { seen.fonts = fonts; },
      setCustomTemplates: (templates) => { seen.templates = templates; },
      setRenderSettings: (settings) => { seen.renderSettings = settings; },
      clearPreviewCommands: () => { seen.preview = true; },
    }, pack);

    expect(seen.project).toBe(pack.project);
    expect(seen.assets).toBe(pack.assets);
    expect(seen.fonts).toBe(pack.fonts);
    expect(seen.templates).toBe(pack.customTemplates);
    expect(seen.renderSettings).toBe(pack.renderSettings);
    expect(seen.preview).toBe(true);
  });
});

describe("collaborationPackage", () => {
  it("strips the local undo stack out of what the room receives", () => {
    const project = projectWithHistory();
    expect(project.history.past.length).toBeGreaterThan(0);

    const pack = collaborationPackage(workspace(project), "2026-08-24T00:00:00.000Z");

    expect(pack.project.history).toEqual({ past: [], future: [] });
    expect(pack.project.textElements).toEqual(project.textElements);
  });

  it("stamps the caller's timestamp rather than the envelope's own clock", () => {
    const pack = collaborationPackage(workspace(projectWithHistory()), "2026-01-02T03:04:05.000Z");

    expect(pack.exportedAt).toBe("2026-01-02T03:04:05.000Z");
  });

  it("keeps the package envelope shape the room protocol expects", () => {
    const pack: ProjectPackage = collaborationPackage(workspace(projectWithHistory()), "2026-08-24T00:00:00.000Z");

    expect(pack.kind).toBe("cengfan-project-package");
    expect(pack.customTemplates).toEqual([]);
    expect(pack.renderSettings).toEqual(DEFAULT_RENDER_SETTINGS);
  });
});

describe("mergeSharedProject", () => {
  it("keeps the local history when someone else's project arrives", () => {
    const local = projectWithHistory();
    const incoming = createProjectDocument({ students: [], templateId: "cartoon", dataView: "city" });

    const merged = mergeSharedProject(local, incoming);

    expect(merged.history).toBe(local.history);
    expect(merged.templateId).toBe("cartoon");
    expect(merged.dataView).toBe("city");
  });

  it("advances the local version so renderers notice the swap", () => {
    const local = projectWithHistory();
    const incoming = createProjectDocument({ students: [], templateId: "original", dataView: "province" });

    expect(mergeSharedProject(local, incoming).version).toBe(local.version + 1);
  });
});
