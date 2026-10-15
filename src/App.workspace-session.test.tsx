import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installAppTestHarness, roots, click, saveWorkspaceMirror, workflowStage } from "./app-test-harness";
import { editorProjectStore } from "./lib/editor-project-store";
import { createSampleProject, type StoredProject } from "./lib/project-store";
import { loadWorkspaceSession, saveWorkspaceSession, workspaceSessionStorageKey } from "./lib/workspace-session";
import type { SceneSelection } from "./lib/scene-document";

vi.mock("./lib/editor-project-store", async () => {
  const { createMemoryProjectStore } = await import("./lib/project-store");
  return { editorProjectStore: createMemoryProjectStore() };
});

installAppTestHarness();
beforeEach(() => window.localStorage.clear());

function storedProject(id: string): StoredProject {
  return { ...createSampleProject(), id, name: id };
}

function mountProject(projectId: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const renderProject = (id: string) => flushSync(() => root.render(<App projectId={id} />));
  renderProject(projectId);
  return { container, renderProject };
}

function remember(projectId: string, selection: SceneSelection) {
  saveWorkspaceSession(window.localStorage, { stage: "content", selection, savedAt: "session" }, workspaceSessionStorageKey(projectId));
}

async function expectStage(container: HTMLElement, label: string) {
  await vi.waitFor(() => {
    expect(container.querySelector('.workflow-stage-stepper [aria-current="step"]')?.textContent).toContain(label);
  });
}

describe("project workspace sessions", () => {
  it("starts a project without a session at the roster rather than adopting the public editor's export stage", async () => {
    await editorProjectStore.put(storedProject("session-new"));
    const publicSession = { stage: "export" as const, selectedObject: "asset-from-another-project", savedAt: "public" };
    saveWorkspaceSession(window.localStorage, publicSession);

    const { container } = mountProject("session-new");
    await expectStage(container, "名单");
    expect(container.querySelector(".data-upload-workspace")).not.toBeNull();
    expect(loadWorkspaceSession(window.localStorage)).toEqual(publicSession);
  });

  it("restores each project's stage when the same route root changes A → B → A", async () => {
    await editorProjectStore.put(storedProject("session-a"));
    await editorProjectStore.put(storedProject("session-b"));
    saveWorkspaceSession(window.localStorage, { stage: "content", savedAt: "a" }, workspaceSessionStorageKey("session-a"));
    saveWorkspaceSession(window.localStorage, { stage: "export", savedAt: "b" }, workspaceSessionStorageKey("session-b"));
    const { container, renderProject } = mountProject("session-a");
    await expectStage(container, "内容");
    click(workflowStage(container, "地图"));

    renderProject("session-b");
    await expectStage(container, "交付");
    renderProject("session-a");
    await expectStage(container, "地图");
    expect(loadWorkspaceSession(window.localStorage, workspaceSessionStorageKey("session-b")).stage).toBe("export");
  });

  it("validates a project-only text against its hydrated document rather than another project's mirror", async () => {
    const stored = storedProject("session-text");
    stored.pack.project.textElements.push({
      ...stored.pack.project.textElements[0], id: "project-only-text", role: "custom", content: "仅属于当前项目的文字",
    });
    await editorProjectStore.put(stored);
    saveWorkspaceMirror(storedProject("mirror").pack.project);
    remember(stored.id, { type: "text", id: "project-only-text" });

    const { container } = mountProject(stored.id);
    await vi.waitFor(() => {
      expect(container.querySelector<HTMLTextAreaElement>("#text-content")?.value).toBe("仅属于当前项目的文字");
    });
    expect(loadWorkspaceSession(window.localStorage, workspaceSessionStorageKey(stored.id)).selection)
      .toEqual({ type: "text", id: "project-only-text" });
  });

  it("keeps an asset selection while its project is loading and restores the actual instance afterwards", async () => {
    const stored = storedProject("session-asset");
    stored.pack.project.assetElements.push({
      id: "project-only-asset", assetId: "resource-1", label: "当前项目装饰", src: "", kind: "decoration",
      x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, zIndex: 30, visibility: true,
    });
    let resolveProject!: (project: StoredProject) => void;
    const delayedProject = new Promise<StoredProject>((resolve) => { resolveProject = resolve; });
    vi.spyOn(editorProjectStore, "get").mockReturnValue(delayedProject);
    saveWorkspaceMirror(storedProject("mirror").pack.project);
    remember(stored.id, { type: "asset", id: "project-only-asset" });

    const { container } = mountProject(stored.id);
    expect(container.querySelector(".content-layout-workspace")).toBeNull();
    expect(loadWorkspaceSession(window.localStorage, workspaceSessionStorageKey(stored.id)).selection)
      .toEqual({ type: "asset", id: "project-only-asset" });
    resolveProject(stored);
    await vi.waitFor(() => {
      expect(container.querySelector('[aria-label="当前对象属性"]')?.textContent).toContain("当前项目装饰");
    });
    expect(loadWorkspaceSession(window.localStorage, workspaceSessionStorageKey(stored.id)).selection)
      .toEqual({ type: "asset", id: "project-only-asset" });
  });

  it("replaces a deleted remembered object with an existing note after hydration", async () => {
    const stored = storedProject("session-missing-asset");
    stored.pack.project.textElements = stored.pack.project.textElements.map((text) => (
      text.id === "text-note" ? { ...text, content: "恢复后的备注" } : text
    ));
    await editorProjectStore.put(stored);
    remember(stored.id, { type: "asset", id: "deleted-asset" });

    const { container } = mountProject(stored.id);
    // Hydration updates the inspector first; the chrome effect persists that
    // selection after the render commits. Wait for both observable results.
    await vi.waitFor(() => {
      expect(container.querySelector<HTMLTextAreaElement>("#text-content")?.value).toBe("恢复后的备注");
      expect(loadWorkspaceSession(window.localStorage, workspaceSessionStorageKey(stored.id)).selection)
        .toEqual({ type: "text", id: "text-note" });
    });
  });
});
