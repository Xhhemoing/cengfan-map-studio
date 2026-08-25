// 从 src/components/AppErrorBoundary.test.tsx 原样搬出：崩溃屏“返回项目列表”的重载取舍——
// 列出的工程只活在内存里就不许重载，持久库列出的仍旧重载，软重载按钮保持原地复位。
// 共享挂载装置见 src/components/app-error-boundary-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { AppErrorBoundaryProps } from "./AppErrorBoundary";
import {
  Boom,
  clickExport,
  clickReturn,
  fakeProjectStore,
  installAppErrorBoundaryTestHarness,
  memorySyncStore,
  mountBoundary,
  projectButtons,
  storedProject,
  waitForNote,
} from "./app-error-boundary-test-harness";

installAppErrorBoundaryTestHarness();

describe("AppErrorBoundary return to project list", () => {
  /** 崩溃一次之后可以被“修好”的子树，用来观察不重载的返回是否真的换回了正常界面。 */
  function flakyChild() {
    const state = { crashing: true };
    const Flaky = () => {
      if (state.crashing) throw new Error("boom");
      return <p>恢复后的工作台</p>;
    };
    return { state, Flaky };
  }

  async function listMemoryProjects(props: Omit<AppErrorBoundaryProps, "children">, children: ReactNode) {
    const container = mountBoundary(children, { mirror: memorySyncStore(), ...props });
    clickExport(container);
    await projectButtons(container);
    return container;
  }

  it("navigates without reloading when the listed projects only exist in memory", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const projectStore = fakeProjectStore([
      storedProject("proj-1", "降级期一班", "2026-08-18T08:00:00.000Z"),
    ], "memory");
    const reload = vi.fn();
    const { state, Flaky } = flakyChild();

    const container = await listMemoryProjects({ projectStore, reload }, <Flaky />);
    // 内存副本只活在这一页的堆里，返回列表不能顺手把它重载掉。
    state.crashing = false;
    clickReturn(container);

    await vi.waitFor(() => expect(container.textContent).toContain("恢复后的工作台"));
    expect(reload).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/");
    expect(container.textContent).not.toContain("界面加载出错");
  });

  it("keeps the shared store alive across the no-reload navigation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const projectStore = fakeProjectStore([
      storedProject("proj-1", "降级期一班", "2026-08-18T08:00:00.000Z"),
    ], "memory");
    const downloadPack = vi.fn();
    const navigate = vi.fn();
    const reload = vi.fn();

    const container = await listMemoryProjects({ projectStore, downloadPack, navigate, reload }, <Boom />);
    clickReturn(container);

    expect(navigate).toHaveBeenCalledWith("#/");
    expect(reload).not.toHaveBeenCalled();
    // 页面没被重载，同一个 store 实例还在，内存里的工程仍然导得出来。
    await vi.waitFor(() => expect(container.querySelector('[role="status"]')).toBeNull());
    clickExport(container);
    const buttons = await projectButtons(container);
    buttons[0]?.click();
    await vi.waitFor(() => expect(downloadPack).toHaveBeenCalledTimes(1));
    expect(downloadPack.mock.calls[0]?.[0]).toMatchObject({ kind: "cengfan-project-package" });
  });

  it("still reloads when the listed projects came from a healthy database", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const projectStore = fakeProjectStore([storedProject("proj-1", "持久化一班", "2026-08-18T08:00:00.000Z")]);
    const navigate = vi.fn();
    const reload = vi.fn();

    const container = await listMemoryProjects({ projectStore, navigate, reload }, <Boom />);
    clickReturn(container);

    expect(navigate).toHaveBeenCalledWith("#/");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads on a plain crash where nothing was listed from memory", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const navigate = vi.fn();
    const reload = vi.fn();

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), navigate, reload });
    clickReturn(container);

    expect(navigate).toHaveBeenCalledWith("#/");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads when the degraded store listed no projects at all", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const projectStore = fakeProjectStore([], "memory");
    const navigate = vi.fn();
    const reload = vi.fn();

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), projectStore, navigate, reload });
    clickExport(container);
    await waitForNote(container, "无法打开本机项目数据库");
    clickReturn(container);

    expect(navigate).toHaveBeenCalledWith("#/");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps the soft reload button resetting in place", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    const { state, Flaky } = flakyChild();

    const container = mountBoundary(<Flaky />, { mirror: memorySyncStore(), reload });
    expect(container.textContent).toContain("界面加载出错");
    state.crashing = false;
    container.querySelector<HTMLButtonElement>('button[aria-label="重新加载界面"]')?.click();

    await vi.waitFor(() => expect(container.textContent).toContain("恢复后的工作台"));
    expect(container.textContent).not.toContain("界面加载出错");
    expect(reload).not.toHaveBeenCalled();
  });
});
