// 从 src/components/ProjectWorkbench.test.tsx 原样搬出：唯一一个走真实 IndexedDB store 的
// 用例——open 持续失败后降级到内存仍能列出与新建。单独成文件，它依赖 IDBFactory 替身与
// store 的打开重试节奏(带 openRetries / retryDelayMs)，与其它纯内存 store 的用例不同域。
// 共享挂载装置与 IDBFactory 替身见 src/components/project-workbench-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import { createIndexedDbProjectStore } from "../lib/project-store";
import {
  failingFactory,
  installProjectWorkbenchTestHarness,
  renderWorkbench,
  storageNotice,
} from "./project-workbench-test-harness";

installProjectWorkbenchTestHarness();

describe("ProjectWorkbench degraded storage fallback", () => {
  it("keeps listing and creating projects while warning that nothing is persisted", async () => {
    const store = createIndexedDbProjectStore(failingFactory(), { openRetries: 0, retryDelayMs: 0 });
    const navigate = vi.fn();
    const { container } = renderWorkbench(store, navigate);

    await vi.waitFor(() => expect(container.textContent).toContain("示例：2026届毕业去向"));
    await vi.waitFor(() => expect(storageNotice(container)).not.toBeNull());
    expect(storageNotice(container)?.textContent).toContain("本次编辑不会保存到本机，请及时导出工程备份");
    expect(store.health).toBe("memory");

    container.querySelector<HTMLButtonElement>('[aria-label="新建项目"]')?.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(await store.list()).toHaveLength(2);
  });
});
