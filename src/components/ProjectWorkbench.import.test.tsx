// 从 src/components/ProjectWorkbench.test.tsx 原样搬出：工程包导入——.cengfan 与 .json
// 命名、超限体积拒收、损坏文件横幅，以及写入失败时的类型化 store 文案。
// 共享挂载装置见 src/components/project-workbench-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import { createMemoryProjectStore, createSampleProject, ProjectStoreError } from "../lib/project-store";
import { serializeProjectPackage } from "../lib/project-package";
import {
  installProjectWorkbenchTestHarness,
  QUOTA_MESSAGE,
  renderWorkbench,
} from "./project-workbench-test-harness";

installProjectWorkbenchTestHarness();

describe("ProjectWorkbench package import", () => {
  it("imports a cengfan sample package and keeps the display name", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = new File([serializeProjectPackage(sample.pack)], "示例项目.cengfan", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input?.accept).toContain(".cengfan");
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(async () => {
      const projects = await store.list();
      expect(projects).toHaveLength(2);
      expect(projects.some((p) => p.name === "示例项目")).toBe(true);
    });
  });

  it("imports a project package file", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = new File([serializeProjectPackage(sample.pack)], "project.json", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(async () => {
      const projects = await store.list();
      expect(projects).toHaveLength(2);
      expect(projects.some((p) => p.name === "project")).toBe(true);
    });
  });

  it("rejects an oversized package by File.size without reading its text", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const file = new File(["{}"], "huge.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: 256 * 1024 * 1024, configurable: true });
    const readSpy = vi.spyOn(file, "text");
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(container.querySelector(".workbench-error")?.textContent).toContain("工程包过大"));
    expect(container.querySelector(".workbench-error")?.textContent).toContain("128.0 MB");
    expect(readSpy).not.toHaveBeenCalled();
    expect(await store.list()).toHaveLength(1);
  });

  it("shows an error banner for an invalid project package", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const file = new File(["not-json"], "broken.json", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(container.textContent).toContain("导入失败"));
    expect(container.querySelector(".workbench-error")?.textContent).toContain("导入失败");
    expect(await store.list()).toHaveLength(1);
  });

  it("shows the typed store message when importing a package fails", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = new File([serializeProjectPackage(sample.pack)], "导入.cengfan", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    vi.spyOn(store, "put").mockRejectedValue(new ProjectStoreError("quota-exceeded", QUOTA_MESSAGE));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });

    input!.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toBe(QUOTA_MESSAGE));
  });
});
