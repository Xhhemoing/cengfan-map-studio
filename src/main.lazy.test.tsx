import { afterEach, describe, expect, it, vi } from "vitest";

let unmount: (() => void) | null = null;

afterEach(() => {
  unmount?.();
  unmount = null;
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
  vi.doUnmock("./components/WorkflowPrototype");
  vi.doUnmock("./components/StudioRoutes");
  vi.resetModules();
});

describe("entry loading boundaries", () => {
  it("defers the workflow prototype until its route is rendered", async () => {
    let prototypeLoads = 0;
    vi.doMock("./components/WorkflowPrototype", () => {
      prototypeLoads += 1;
      return { WorkflowPrototype: () => <main data-workflow-prototype>流程原型主体</main> };
    });
    vi.doMock("./components/StudioRoutes", () => ({
      ProjectRoute: () => <main>编辑器路由</main>,
      WorkbenchRoute: () => <main>工作台路由</main>,
    }));
    window.history.replaceState(null, "", "/prototype");

    const main = await import("./main");
    unmount = main.unmountApp;

    expect(prototypeLoads).toBe(0);

    const container = document.createElement("div");
    document.body.append(container);
    main.renderApp(container);

    expect(container.textContent).toContain("正在加载流程原型…");
    await vi.waitFor(() => expect(container.querySelector("[data-workflow-prototype]")).not.toBeNull());
    expect(prototypeLoads).toBe(1);
  });
});
