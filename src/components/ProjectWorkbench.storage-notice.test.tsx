// 从 src/components/ProjectWorkbench.test.tsx 原样搬出：降级横幅本身——挂载期健康状态、
// 恢复持久化后收起并重读列表、横幅保持惰性、路由传下来的回写失败。
// 共享挂载装置见 src/components/project-workbench-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import { ProjectWorkbench } from "./ProjectWorkbench";
import { createMemoryProjectStore, createSampleProject, ProjectStoreError } from "../lib/project-store";
import {
  installProjectWorkbenchTestHarness,
  mountElement,
  QUOTA_MESSAGE,
  renderWorkbench,
  storageNotice,
} from "./project-workbench-test-harness";

installProjectWorkbenchTestHarness();

describe("ProjectWorkbench degraded storage notice", () => {
  it("warns from the mount-time store health even without a health prop", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);

    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());
    // 提示不可关闭:内存模式期间没有任何关闭控件。
    expect(storageNotice(container)?.querySelector('[aria-label^="关闭"]')).toBeNull();
  });

  it("hides the notice when health flips back to persistent without remounting the store", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container, rerender } = renderWorkbench(store, vi.fn(), "memory");
    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());

    rerender("persistent");

    expect(storageNotice(container)).toBeNull();
    expect(container.textContent).not.toContain("本次编辑不会保存到本机");
  });

  it("re-reads the project list once storage recovers from memory mode", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container, rerender } = renderWorkbench(store, vi.fn(), "memory");
    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());
    // 内存期之后落到持久层的内容:界面此时还看不到它。
    const recovered = createSampleProject();
    await store.put({ ...recovered, name: "恢复后的项目", updatedAt: "2026-08-24T09:00:00.000Z" });
    const listSpy = vi.spyOn(store, "list");

    rerender("persistent");

    await vi.waitFor(() => expect(listSpy).toHaveBeenCalled());
    // 不能等到用户下一次增删改才纠正:恢复本身就要重新读一次列表。
    await vi.waitFor(() => expect(container.textContent).toContain("恢复后的项目"));
  });

  it("keeps the notice inert: no clickable-card classes on a status banner", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());

    const notice = storageNotice(container)!;
    expect(notice.classList.contains("workbench-storage-notice")).toBe(true);
    // .workbench-resume 带 hover 高亮与 :active { transform: scale(.985) },警告横幅不该有按钮动效。
    expect(notice.classList.contains("workbench-resume")).toBe(false);
    expect(notice.querySelector(".workbench-resume-icon")).toBeNull();
    expect(notice.querySelector(".workbench-resume-body")).toBeNull();
    expect(notice.querySelector(".workbench-resume-cta")).toBeNull();
  });

  it("shows the write-back failure passed down by the route inside the notice", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const container = mountElement(
      <ProjectWorkbench
        store={store}
        navigate={vi.fn()}
        health="memory"
        recoverError={new ProjectStoreError("quota-exceeded", QUOTA_MESSAGE)}
      />,
    );

    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());
    expect(storageNotice(container)?.textContent).toContain("本机存储空间不足");
  });
});
