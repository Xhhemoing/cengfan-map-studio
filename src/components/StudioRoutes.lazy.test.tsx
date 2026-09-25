import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { createMemoryProjectStore } from "../lib/project-store";
import type { ProjectStoreHealthChannel } from "../lib/editor-project-store";

const persistentHealthChannel: ProjectStoreHealthChannel = {
  subscribe: () => () => undefined,
  getHealth: () => "persistent",
  getRecoverError: () => null,
};

let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  vi.doUnmock("../App");
  vi.doUnmock("./ProjectWorkbench");
  vi.resetModules();
});

describe("StudioRoutes loading boundaries", () => {
  it("loads the workbench body without evaluating the editor body", async () => {
    let editorLoads = 0;
    let workbenchLoads = 0;
    vi.doMock("../App", () => {
      editorLoads += 1;
      return { App: () => <main data-editor-body>编辑器主体</main> };
    });
    vi.doMock("./ProjectWorkbench", () => {
      workbenchLoads += 1;
      return { ProjectWorkbench: () => <main data-workbench-body>项目工作台主体</main> };
    });

    const { WorkbenchRoute } = await import("./StudioRoutes");

    expect(editorLoads).toBe(0);
    expect(workbenchLoads).toBe(0);

    const container = document.createElement("div");
    root = createRoot(container);
    flushSync(() => root?.render(
      <WorkbenchRoute
        store={createMemoryProjectStore()}
        healthChannel={persistentHealthChannel}
      />,
    ));

    expect(container.textContent).toContain("正在加载项目工作台…");
    await vi.waitFor(() => expect(container.querySelector("[data-workbench-body]")).not.toBeNull());
    expect(workbenchLoads).toBe(1);
    expect(editorLoads).toBe(0);
  });

  it("loads the editor body without evaluating the workbench body", async () => {
    let editorLoads = 0;
    let workbenchLoads = 0;
    vi.doMock("../App", () => {
      editorLoads += 1;
      return { App: ({ projectId }: { projectId: string }) => <main data-editor-body={projectId}>编辑器主体</main> };
    });
    vi.doMock("./ProjectWorkbench", () => {
      workbenchLoads += 1;
      return { ProjectWorkbench: () => <main data-workbench-body>项目工作台主体</main> };
    });

    const { ProjectRoute } = await import("./StudioRoutes");

    expect(editorLoads).toBe(0);
    expect(workbenchLoads).toBe(0);

    const container = document.createElement("div");
    root = createRoot(container);
    flushSync(() => root?.render(
      <ProjectRoute
        projectId="proj-lazy"
        store={createMemoryProjectStore()}
        healthChannel={persistentHealthChannel}
      />,
    ));

    expect(container.textContent).toContain("正在加载编辑器…");
    await vi.waitFor(() => expect(container.querySelector('[data-editor-body="proj-lazy"]')).not.toBeNull());
    expect(editorLoads).toBe(1);
    expect(workbenchLoads).toBe(0);
  });
});
