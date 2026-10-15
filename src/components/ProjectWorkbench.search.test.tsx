import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { createMemoryProjectStore, createSampleProject } from "../lib/project-store";
import { installProjectWorkbenchTestHarness, renderWorkbench } from "./project-workbench-test-harness";

installProjectWorkbenchTestHarness();

function search(input: HTMLInputElement, value: string) {
  // Native setter models a real edit without React's value tracker swallowing it.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  flushSync(() => input.dispatchEvent(new Event("input", { bubbles: true })));
}

describe("ProjectWorkbench project search", () => {
  it("filters names case-insensitively without reading packs or changing stored projects", async () => {
    const store = createMemoryProjectStore();
    const first = { ...createSampleProject(), name: "高三 A 班" };
    const second = { ...createSampleProject(), name: "校庆纪念图" };
    await store.put(first);
    await store.put(second);
    const getSpy = vi.spyOn(store, "get");
    const putSpy = vi.spyOn(store, "put");
    const { container, navigate } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelectorAll(".workbench-card")).toHaveLength(2));
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    search(input, "  a 班  ");
    await vi.waitFor(() => expect(container.querySelectorAll(".workbench-card")).toHaveLength(1));
    expect(container.querySelector(".workbench-project-count")?.textContent).toBe("1 / 2 个项目");
    expect(container.querySelector(".workbench-card-main")?.textContent).toContain(first.name);
    expect(getSpy).not.toHaveBeenCalled();
    expect(putSpy).not.toHaveBeenCalled();
    container.querySelector<HTMLButtonElement>(".workbench-card-main")!.click();
    expect(navigate).toHaveBeenCalledWith(`#/project/${first.id}`);
  });

  it("distinguishes no matches from an empty library and restores the list", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    document.body.append(container);
    await vi.waitFor(() => expect(container.querySelector('input[type="search"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    search(input, "没有这个班级");
    await vi.waitFor(() => expect(container.textContent).toContain("没有匹配的项目"));
    expect(container.textContent).not.toContain("还没有项目");
    expect(container.querySelector(".workbench-project-count")?.textContent).toBe("0 / 1 个项目");
    container.querySelector<HTMLButtonElement>(".workbench-empty button")!.click();
    await vi.waitFor(() => expect(container.querySelectorAll(".workbench-card")).toHaveLength(1));
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });
});
