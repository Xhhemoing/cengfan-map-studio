import { describe, expect, it, vi } from "vitest";
import { createMemoryProjectStore, createSampleProject } from "../../lib/project-store";
import { installProjectWorkbenchTestHarness, mountElement, renderWorkbench } from "../project-workbench-test-harness";
import { ProjectPreview } from "./ProjectPreview";

installProjectWorkbenchTestHarness();

describe("ProjectPreview canvas summary", () => {
  it.each([
    [1500, 1000, "横向画布"], [900, 1600, "纵向画布"], [1000, 1000, "方形画布"],
  ] as const)("shows %i × %i dimensions and the actual orientation", (canvasWidth, canvasHeight, orientation) => {
    const container = mountElement(<ProjectPreview preview={{ canvasWidth, canvasHeight, dataView: "province" }} />);
    expect(container.textContent).toContain(`${canvasWidth} × ${canvasHeight} px`);
    expect(container.textContent).toContain(orientation);
    expect(container.textContent).toContain("画布概览");
    expect(container.querySelector<HTMLElement>(".project-preview__paper")?.style.aspectRatio).toBe(`${canvasWidth} / ${canvasHeight}`);
    expect(container.querySelector("canvas, img, svg.poster")).toBeNull();
  });

  it.each([
    ["province", "省份分组"], ["city", "城市分组"], ["university", "院校分组"], ["pins", "图钉地图"], ["heat", "热力地图"],
  ] as const)("describes the saved %s map expression", (dataView, label) => {
    const container = mountElement(<ProjectPreview preview={{ canvasWidth: 1500, canvasHeight: 1000, dataView }} />);
    expect(container.textContent).toContain(label);
  });

  it("uses an honest fallback when old metadata has no canvas facts", () => {
    const container = mountElement(<ProjectPreview />);
    expect(container.textContent).toContain("项目工程");
    expect(container.textContent).toContain("打开查看画布");
    expect(container.querySelector(".project-preview__paper")).toBeNull();
    expect(container.textContent).not.toContain("px");
  });

  it("renders distinct saved canvas facts through the project grid without requesting full packages", async () => {
    const store = createMemoryProjectStore();
    const landscape = createSampleProject();
    landscape.id = "landscape";
    landscape.name = "横向项目";
    const portrait = createSampleProject();
    portrait.id = "portrait";
    portrait.name = "纵向项目";
    portrait.pack.project.canvas.width = 900;
    portrait.pack.project.canvas.height = 1600;
    portrait.pack.project.dataView = "pins";
    await store.put(landscape);
    await store.put(portrait);
    const get = vi.spyOn(store, "get");
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => {
      expect(container.querySelectorAll(".project-preview")).toHaveLength(2);
      expect(container.textContent).toContain("900 × 1600 px");
    });
    expect(container.querySelector('[aria-label="打开项目 横向项目"]')?.textContent).toContain("省份分组");
    const portraitButton = container.querySelector('[aria-label="打开项目 纵向项目"]')!;
    expect(portraitButton.textContent).toContain("图钉地图");
    expect(portraitButton.getAttribute("aria-describedby")).toBe(portraitButton.querySelector(".project-preview")?.id);
    expect(get).not.toHaveBeenCalled();
  });

});
