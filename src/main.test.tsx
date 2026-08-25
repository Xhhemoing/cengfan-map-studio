import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp, unmountApp, workbenchStore } from "./main";
import { editorProjectStore } from "./lib/editor-project-store";
import { createSampleProject } from "./lib/project-store";
import type { AppErrorBoundaryProps } from "./components/AppErrorBoundary";

// jsdom 无 IndexedDB:App 在 projectId 模式下调用 editorProjectStore.get,必须注入内存 store,
// 否则真实 store 恒返回 null,项目模式会渲染"项目不存在"界面而丢掉品牌文案。
vi.mock("./lib/editor-project-store", async () => {
  const { createMemoryProjectStore } = await import("./lib/project-store");
  const store = createMemoryProjectStore();
  return {
    editorProjectStore: store,
    projectStoreHealthChannel: {
      subscribe: () => () => undefined,
      getHealth: () => store.health,
      getRecoverError: () => null,
    },
  };
});

const captured = vi.hoisted(() => ({ projectStore: undefined as unknown }));

// 崩溃边界照常渲染,只是顺手记下它拿到的 store:自建实例看不到降级会话的内存项目。
vi.mock("./components/AppErrorBoundary", async () => {
  const actual = await vi.importActual<typeof import("./components/AppErrorBoundary")>("./components/AppErrorBoundary");
  return {
    AppErrorBoundary: (props: AppErrorBoundaryProps) => {
      captured.projectStore = props.projectStore;
      return <actual.AppErrorBoundary {...props} />;
    },
  };
});

function setHash(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

afterEach(() => {
  unmountApp(); // 先卸载活着的 root,避免后续异步提交在清空 DOM 后抛 NotFoundError
  document.body.innerHTML = "";
  window.location.hash = "";
  captured.projectStore = undefined;
  vi.restoreAllMocks();
});

describe("app routing", () => {
  it("renders the workbench for the root hash", () => {
    setHash("#/");
    renderApp(document.body);
    expect(document.body.textContent).toContain("项目工作台");
  });

  it("renders the editor for a project hash", async () => {
    await editorProjectStore.put({ ...createSampleProject(), id: "proj-1" });
    setHash("#/project/proj-1");
    renderApp(document.body);
    await vi.waitFor(() => expect(document.body.querySelector('button[aria-label="返回项目列表"]')).not.toBeNull());
    expect(document.body.textContent).toContain("蹭饭地图工作室");
  });

  it("hands the shared project store to the crash boundary", () => {
    setHash("#/");
    renderApp(document.body);
    expect(captured.projectStore).toBe(editorProjectStore);
  });
});

describe("shared project store", () => {
  it("re-exports the editor store instead of constructing a second one", () => {
    expect(workbenchStore).toBe(editorProjectStore);
  });
});
