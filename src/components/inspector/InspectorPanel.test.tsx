import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createProjectDocument } from "../../lib/project-document";
import { InspectorPanel } from "./InspectorPanel";

describe("InspectorPanel", () => {
  it("shows selected canvas/map/cards controls and emits normalized patches", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(<InspectorPanel project={project} selection={{ type: "canvas" }} onPatch={onPatch} onReset={vi.fn()} />));
    expect(container.textContent).toContain("画布属性");
    expect(container.querySelector('label[for="canvas-width"]')?.textContent).toBe("宽度");
    expect(container.querySelector("#canvas-size-preset")).not.toBeNull();
    expect(container.querySelector("#canvas-background-opacity")).not.toBeNull();
    expect(container.querySelector('.property-panel__pair[data-property-pair="canvas-size"] #canvas-width')).not.toBeNull();
    expect(container.querySelector('.property-panel__pair[data-property-pair="canvas-size"] #canvas-height')).not.toBeNull();
    const width = container.querySelector("#canvas-width") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(width, "1800");
      width.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => width.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ type: "canvas" }, { width: 1800 });

    const preset = container.querySelector("#canvas-size-preset") as HTMLSelectElement;
    const presetSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    flushSync(() => {
      presetSetter?.call(preset, "square-1080");
      preset.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ type: "canvas" }, { width: 1080, height: 1080 });

    flushSync(() => root.render(<InspectorPanel project={project} selection={{ type: "map" }} onPatch={onPatch} onReset={vi.fn()} />));
    expect(container.textContent).toContain("地图属性");
    expect(container.querySelector('label[for="map-scale"]')?.textContent).toBe("缩放");
    expect(container.querySelector('#map-labels[type="checkbox"]')).not.toBeNull();
    const source = container.querySelector("#map-render-source") as HTMLSelectElement;
    expect(source.value).toBe("vector");
    expect(container.querySelector(".province-style-list")).toBeNull();
    const sourceSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    flushSync(() => {
      sourceSetter?.call(source, "image");
      source.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ type: "map" }, { renderSource: { kind: "vector" } });

    flushSync(() => root.render(<InspectorPanel project={project} selection={{ type: "cards" }} onPatch={onPatch} onReset={vi.fn()} />));
    expect(container.textContent).toContain("卡片属性");
    expect(container.querySelector('label[for="cards-gap"]')?.textContent).toBe("间距");
    expect(container.querySelector('#cards-visible-name[type="checkbox"]')).not.toBeNull();
    expect(container.querySelector('#cards-opacity[type="range"]')).not.toBeNull();
    expect(container.querySelector('#cards-font-size[type="number"]')).not.toBeNull();
    expect(container.querySelector('#cards-connector-style')).not.toBeNull();

    flushSync(() => root.unmount());
    container.remove();
  });

  it("uploads, replaces, previews, and removes the full-canvas background image", () => {
    const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const project = {
      ...base,
      canvas: { ...base.canvas, backgroundImageSrc: "data:image/png;base64,old" },
    };
    const onPatch = vi.fn();
    const originalFileReader = globalThis.FileReader;
    class ImmediateFileReader {
      result = "data:image/png;base64,new";
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
      }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <InspectorPanel project={project} selection={{ type: "canvas" }} onPatch={onPatch} onReset={vi.fn()} />,
    ));

    expect(container.querySelector('[data-canvas-background-preview]')?.getAttribute("src")).toBe("data:image/png;base64,old");
    expect(container.textContent).toContain("替换背景");
    const input = container.querySelector("#canvas-background-image") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["image"], "new-background.png", { type: "image/png" })],
    });
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ type: "canvas" }, { backgroundImageSrc: "data:image/png;base64,new" });

    const remove = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("移除背景"))!;
    flushSync(() => remove.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ type: "canvas" }, { backgroundImageSrc: undefined });

    flushSync(() => root.unmount());
    container.remove();
    vi.stubGlobal("FileReader", originalFileReader);
  });

  it("asks for exactly one reset transaction", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onReset = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<InspectorPanel project={project} selection={{ type: "map" }} onPatch={vi.fn()} onReset={onReset} />));
    const reset = container.querySelector('button[type="button"]')!;
    flushSync(() => reset.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledWith({ type: "map" });
    flushSync(() => root.unmount());
    container.remove();
  });

  it("shows the selected asset inspector by stable instance id", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const asset = {
      id: "asset-selected",
      assetId: "source-1",
      label: "北京地标",
      src: "data:image/svg+xml,%3Csvg/%3E",
      kind: "landmark" as const,
      province: "北京市",
      x: 10,
      y: 20,
      width: 80,
      height: 60,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      visibility: true,
    };
    const nextProject = { ...project, assetElements: [asset] };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <InspectorPanel
        project={nextProject}
        selection={{ type: "asset", id: "asset-selected" }}
        onPatch={vi.fn()}
        onReset={vi.fn()}
      />,
    ));

    expect(container.textContent).toContain("北京地标");
    expect(container.textContent).toContain("地域地标");
    expect(container.querySelector("#asset-width")).not.toBeNull();

    flushSync(() => root.unmount());
    container.remove();
  });

  it("updates the map-level uniform province texture size from a selected province", () => {
    const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const project = {
      ...base,
      map: {
        ...base.map,
        provinceTextureUniformSize: { enabled: false, width: 100, height: 80 },
        provinceStyles: {
          ...base.map.provinceStyles,
          北京市: {
            appearance: {
              kind: "texture" as const,
              assetId: "texture-beijing",
              src: "data:image/png;base64,beijing",
              fit: "contain" as const,
              sizingMode: "natural" as const,
            },
          },
        },
      },
    };
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <InspectorPanel project={project} selection={{ type: "province", province: "北京市" }} onPatch={onPatch} onReset={vi.fn()} />,
    ));

    const toggle = container.querySelector("#province-texture-uniform-enabled") as HTMLInputElement;
    expect(toggle).not.toBeNull();
    flushSync(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith(
      { type: "map" },
      { provinceTextureUniformSize: { enabled: true, width: 100, height: 80 } },
    );

    root.unmount();
    container.remove();
  });

  it("shows a dedicated province inspector and writes only the selected province style", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <InspectorPanel project={project} selection={{ type: "province", province: "北京市" }} onPatch={onPatch} onReset={vi.fn()} />,
    ));

    expect(container.textContent).toContain("北京市");
    expect(container.textContent).toContain("纯色");
    const color = container.querySelector("#province-color") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    color.focus();
    flushSync(() => {
      setter?.call(color, "#cc5544");
      color.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPatch).not.toHaveBeenCalled();
    // the picker closes with a change event — one commit, no blur required
    flushSync(() => color.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ type: "province", province: "北京市" }, {
      appearance: { kind: "manual-color", color: "#cc5544" },
    });
    flushSync(() => color.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledTimes(1);

    root.unmount();
    container.remove();
  });

  it("keeps full project-wide controls in the right inspector with a global settings entry", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(
      <InspectorPanel
        project={project}
        selection={{ type: "canvas" }}
        provinces={["北京市"]}
        onPatch={onPatch}
        onReset={vi.fn()}
        onOpenGlobalSettings={vi.fn()}
        onArrangeCards={vi.fn()}
        onApplyFont={vi.fn()}
        onUploadFont={vi.fn()}
      />,
    ));

    // 画布不再降级为“在全局设置中编辑”链接，完整控件直接可改
    expect(container.textContent).toContain("画布属性");
    expect(container.textContent).not.toContain("已迁移");
    expect(container.querySelector('button[aria-label="打开全局设置"]')).not.toBeNull();

    // 常驻字体排版折叠区
    const typography = container.querySelector("details.inspector-global-typography")!;
    expect(typography).not.toBeNull();
    expect(typography.querySelector("#typography-province-font")).not.toBeNull();

    // map / cards / guests 均为完整面板
    flushSync(() => root.render(
      <InspectorPanel project={project} selection={{ type: "map" }} provinces={["北京市"]} onPatch={onPatch} onReset={vi.fn()} onOpenGlobalSettings={vi.fn()} onApplyFont={vi.fn()} />,
    ));
    expect(container.querySelector("#map-land-color")).not.toBeNull();

    flushSync(() => root.render(
      <InspectorPanel project={project} selection={{ type: "cards" }} provinces={["北京市"]} onPatch={onPatch} onReset={vi.fn()} onOpenGlobalSettings={vi.fn()} onArrangeCards={vi.fn()} onApplyFont={vi.fn()} />,
    ));
    expect(container.querySelector("#cards-layout-mode")).not.toBeNull();
    expect(container.querySelector('button[aria-label="一键智能排版"]')).not.toBeNull();

    flushSync(() => root.render(
      <InspectorPanel project={project} selection={{ type: "guests" }} provinces={["北京市"]} onPatch={onPatch} onReset={vi.fn()} onOpenGlobalSettings={vi.fn()} onApplyFont={vi.fn()} />,
    ));
    expect(container.querySelector("#guests-background")).not.toBeNull();
    expect(container.querySelector(".guest-people-editor")).not.toBeNull();

    flushSync(() => root.unmount());
    container.remove();
  });
});
