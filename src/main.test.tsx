import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp, unmountApp } from "./main";
import { editorProjectStore } from "./lib/editor-project-store";
import { createSampleProject } from "./lib/project-store";

// jsdom 无 IndexedDB:App 在 projectId 模式下调用 editorProjectStore.get,必须注入内存 store,
// 否则真实 store 恒返回 null,项目模式会渲染"项目不存在"界面而丢掉品牌文案。
vi.mock("./lib/editor-project-store", async () => {
  const { createMemoryProjectStore } = await import("./lib/project-store");
  return { editorProjectStore: createMemoryProjectStore() };
});

function setHash(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

afterEach(() => {
  unmountApp(); // 先卸载活着的 root,避免后续异步提交在清空 DOM 后抛 NotFoundError
  document.body.innerHTML = "";
  window.location.hash = "";
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
});
