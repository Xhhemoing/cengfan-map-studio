import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp, unmountApp } from "./main";

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

  it("renders the editor for a project hash", () => {
    setHash("#/project/proj-1");
    renderApp(document.body);
    expect(document.body.textContent).toContain("蹭饭地图工作室");
  });
});
