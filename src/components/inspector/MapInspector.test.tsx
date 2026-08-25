import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MapInspector } from "./MapInspector";
import type { MapSettings } from "../../lib/scene-document";

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const baseMap: MapSettings = {
  x: 0,
  y: 0,
  width: 800,
  height: 690,
  scale: 1,
  landColor: "#eeeeee",
  activeColor: "#123456",
  edgeColor: "#456789",
  edgeStyle: "solid",
  edgeWidth: 1,
  showProvinceLabels: true,
  provinceStyles: {},
};

describe("MapInspector", () => {
  it("defers editable values until blur or Enter", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={onPatch} onReset={() => undefined} />,
    ));

    const width = container.querySelector("#map-width") as HTMLInputElement;
    expect(container.querySelector('[data-property-pair="map-position"] #map-x')).not.toBeNull();
    expect(container.querySelector('[data-property-pair="map-position"] #map-y')).not.toBeNull();
    expect(container.querySelector('[data-property-pair="map-size"] #map-width')).not.toBeNull();
    expect(container.querySelector('[data-property-pair="map-size"] #map-height')).not.toBeNull();
    width.focus();
    flushSync(() => setInputValue(width, "900"));
    expect(onPatch).not.toHaveBeenCalled();

    flushSync(() => width.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ width: 900 });

    onPatch.mockClear();
    const color = container.querySelector("#map-edge-color") as HTMLInputElement;
    color.focus();
    flushSync(() => setInputValue(color, "#abcdef"));
    expect(onPatch).not.toHaveBeenCalled();
    // the picker closes with a change event — one commit, no blur required
    flushSync(() => color.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ edgeColor: "#abcdef" });

    root.unmount();
  });

  it("adjusts the map layer with a z-index input and quick buttons", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <MapInspector map={{ ...baseMap, zIndex: 5 }} onPatch={onPatch} onReset={() => undefined} />,
    ));

    const input = container.querySelector("#map-zindex") as HTMLInputElement;
    expect(input.value).toBe("5");
    input.focus();
    flushSync(() => setInputValue(input, "60"));
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ zIndex: 60 });

    onPatch.mockClear();
    expect(Array.from(container.querySelectorAll(".inspector-actions button")).map((button) => button.textContent))
      .toEqual(["上移", "下移", "置顶", "置底"]);
    flushSync(() => (container.querySelector("button[aria-label='地图上移']") as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ zIndex: 6 });
    flushSync(() => (container.querySelector("button[aria-label='地图置顶']") as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ zIndex: 100 });

    flushSync(() => root.unmount());
  });

  it("offers decorative province border textures and applies them", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={onPatch} onReset={() => undefined} />,
    ));

    expect(container.textContent).toContain("省界线纹理");
    expect(container.querySelector("#map-edge-style")).toBeNull();
    expect(container.querySelector('button[aria-label="打开边界风格选择器"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="边界风格圆盘"]')).toBeNull();
    expect(container.querySelector("#map-collapse-south-sea")).not.toBeNull();
    expect(container.querySelector("#map-opacity[type=\"range\"]")).not.toBeNull();

    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="打开边界风格选择器"]')?.click());
    expect(container.querySelector('[aria-label="边界风格圆盘"]')).not.toBeNull();
    const wave = container.querySelector<HTMLButtonElement>('button[aria-label="选择水纹边界风格"]')!;
    flushSync(() => wave.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ edgeStyle: "wave" });
    expect(container.querySelector('[aria-label="边界风格圆盘"]')).toBeNull();

    const collapse = container.querySelector("#map-collapse-south-sea") as HTMLInputElement;
    expect(collapse.closest("label")?.classList.contains("boolean-control")).toBe(true);
    expect(collapse.closest("label")?.firstElementChild).toBe(collapse);
    expect(collapse.checked).toBe(false);
    flushSync(() => collapse.click());
    expect(onPatch).toHaveBeenCalledWith({ collapseSouthChinaSea: true });

    const opacity = container.querySelector("#map-opacity") as HTMLInputElement;
    flushSync(() => setInputValue(opacity, "0.45"));
    expect(onPatch).toHaveBeenCalledWith({ opacity: 0.45 });

    root.unmount();
  });

  it("shows heat-map depth, color, and preview controls", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={onPatch} onReset={() => undefined} />,
    ));

    expect(container.querySelector("#map-heat-min-depth")).not.toBeNull();
    expect(container.querySelector("#map-heat-max-depth")).not.toBeNull();
    expect(container.querySelector("#map-heat-low-color")).not.toBeNull();
    expect(container.querySelector("#map-heat-high-color")).not.toBeNull();
    expect(container.querySelectorAll("[data-heat-preview-step]")).toHaveLength(5);

    const lowColor = container.querySelector("#map-heat-low-color") as HTMLInputElement;
    lowColor.focus();
    flushSync(() => setInputValue(lowColor, "#dceeff"));
    flushSync(() => lowColor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({
      heatScale: expect.objectContaining({ lowColor: "#dceeff" }),
    });

    root.unmount();
  });

  it("sets and clears a color override for any selected province", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={onPatch} onReset={() => undefined} />,
    ));

    const province = container.querySelector("#map-province-override") as HTMLSelectElement;
    province.value = "浙江省";
    flushSync(() => province.dispatchEvent(new Event("change", { bubbles: true })));

    const color = container.querySelector("#map-province-override-color") as HTMLInputElement;
    color.focus();
    flushSync(() => setInputValue(color, "#cc5544"));
    flushSync(() => color.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({
      provinceStyles: {
        浙江省: { appearance: { kind: "manual-color", color: "#cc5544" } },
      },
    });

    onPatch.mockClear();
    const reset = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "恢复跟随整体")!;
    flushSync(() => reset.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({
      provinceStyles: {
        浙江省: { appearance: undefined, fill: undefined },
      },
    });

    root.unmount();
  });

  it("exposes overlay alignment controls and auto-fit for image maps", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    const imageMap: MapSettings = {
      ...baseMap,
      renderSource: {
        kind: "image",
        assetId: "map-1",
        src: "data:image/png;base64,xx",
        fit: "contain",
        opacity: 0.9,
        composition: "overlay",
        clipToMap: true,
        alignment: {
          sourceWidth: 1000,
          sourceHeight: 500,
          sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
          x: 10,
          y: 20,
          width: 700,
          height: 350,
          rotation: 0,
        },
      },
    };

    flushSync(() => root.render(
      <MapInspector map={imageMap} onPatch={onPatch} onReset={() => undefined} />,
    ));

    expect(container.textContent).toContain("覆盖适配");
    expect(container.querySelector("#map-image-composition")).not.toBeNull();
    expect(container.querySelector("#map-image-clip")).not.toBeNull();
    expect(container.querySelector("#map-align-x")).not.toBeNull();
    expect(container.querySelector("#map-align-rotation")).not.toBeNull();
    expect(container.querySelector('[data-property-pair="map-image-position"] #map-align-x')).not.toBeNull();
    expect(container.querySelector('[data-property-pair="map-image-position"] #map-align-y')).not.toBeNull();
    expect(container.querySelector('[data-property-pair="map-image-size"] #map-align-width')).not.toBeNull();
    expect(container.querySelector('[data-property-pair="map-image-size"] #map-align-height')).not.toBeNull();
    const clip = container.querySelector("#map-image-clip") as HTMLInputElement;
    expect(clip.closest("label")?.classList.contains("boolean-control")).toBe(true);
    expect(clip.closest("label")?.firstElementChild).toBe(clip);

    const composition = container.querySelector("#map-image-composition") as HTMLSelectElement;
    flushSync(() => {
      composition.value = "replace";
      composition.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({
      renderSource: expect.objectContaining({ composition: "replace" }),
    }));

    const autoFit = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("自动适配"))!;
    flushSync(() => autoFit.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({
      renderSource: expect.objectContaining({
        alignment: expect.objectContaining({
          sourceWidth: 1000,
          sourceHeight: 500,
          width: expect.any(Number),
          height: expect.any(Number),
        }),
      }),
    }));

    root.unmount();
  });

  it("folds heat and per-province color controls into advanced details when collapsible", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={onPatch} onReset={() => undefined} mode="global" collapsible />,
    ));

    const details = container.querySelector<HTMLDetailsElement>(".property-panel__advanced");
    expect(details).not.toBeNull();
    expect(details?.querySelector(".heat-scale-control")).not.toBeNull();
    expect(details?.querySelector(".province-color-control")).not.toBeNull();
    expect(details?.querySelector("#map-collapse-south-sea")).not.toBeNull();
    expect(details?.querySelector("summary")?.textContent).toContain("热力变色、单独省份颜色、南海诸岛");
    expect(details?.querySelector(".property-panel__advanced-title")?.textContent).toContain("高级设置");
    // 核心控件保持在折叠之外
    expect(container.querySelector(".property-panel__advanced #map-land-color")).toBeNull();
    expect(container.querySelector("#map-land-color")).not.toBeNull();
    expect(container.querySelector(".property-panel__advanced #map-edge-style")).toBeNull();
    const labels = container.querySelector("#map-labels") as HTMLInputElement;
    expect(labels.closest("label")?.classList.contains("boolean-control")).toBe(true);
    expect(labels.closest("label")?.firstElementChild).toBe(labels);

    root.unmount();
  });

  it("keeps advanced controls open by default", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={onPatch} onReset={() => undefined} mode="global" />,
    ));

    expect(container.querySelector(".property-panel__advanced")).toBeNull();
    expect(container.querySelector(".heat-scale-control")).not.toBeNull();
    expect(container.querySelector("#map-collapse-south-sea")).not.toBeNull();

    root.unmount();
  });

  it("gives every rendered control an accessible name in vector, image, and collapsible modes", () => {
    // Approximation of the accname algorithm for the mechanisms this panel
    // uses: aria-label, aria-labelledby, label[for], wrapping label, content.
    const accessibleName = (control: HTMLElement, scope: HTMLElement): string => {
      const ariaLabel = control.getAttribute("aria-label");
      if (ariaLabel?.trim()) return ariaLabel.trim();
      const labelledby = control.getAttribute("aria-labelledby");
      if (labelledby) {
        const text = labelledby.split(/\s+/)
          .map((id) => scope.querySelector(`[id="${id}"]`)?.textContent ?? "")
          .join(" ")
          .trim();
        if (text) return text;
      }
      if (control.id) {
        const label = scope.querySelector(`label[for="${control.id}"]`);
        if (label?.textContent?.trim()) return label.textContent.trim();
      }
      const wrapping = control.closest("label");
      if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
      if (control.matches("button, summary, [role='button'], [role='option']")) {
        return control.textContent?.trim() ?? "";
      }
      return "";
    };
    const auditNames = (scope: HTMLElement) => {
      const controls = Array.from(scope.querySelectorAll<HTMLElement>(
        "input, select, button, summary, [role='button']",
      )).filter((control) => !control.hasAttribute("hidden") && !control.closest("[hidden]"));
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        expect(
          accessibleName(control, scope),
          `unnamed control: <${control.tagName.toLowerCase()} id="${control.id}" class="${control.className}">`,
        ).not.toBe("");
      }
    };

    const imageMap: MapSettings = {
      ...baseMap,
      renderSource: {
        kind: "image",
        assetId: "map-1",
        src: "data:image/png;base64,xx",
        fit: "contain",
        opacity: 0.9,
        composition: "overlay",
        clipToMap: true,
        alignment: {
          sourceWidth: 1000,
          sourceHeight: 500,
          sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
          x: 10,
          y: 20,
          width: 700,
          height: 350,
          rotation: 0,
        },
      },
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    // Vector map with the edge-style dial open (covers every dial option).
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={vi.fn()} onReset={() => undefined} />,
    ));
    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="打开边界风格选择器"]')?.click());
    auditNames(container);

    // Image map: overlay fit, alignment, and z-order controls.
    flushSync(() => root.render(
      <MapInspector map={imageMap} onPatch={vi.fn()} onReset={() => undefined} />,
    ));
    auditNames(container);

    // Collapsible global mode: advanced <details>/<summary> fold.
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={vi.fn()} onReset={() => undefined} mode="global" collapsible />,
    ));
    auditNames(container);

    root.unmount();
  });

  it("keeps names on layer and reset buttons while hiding their icons from assistive tech", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={vi.fn()} onReset={() => undefined} />,
    ));

    for (const label of ["重置地图", "地图上移", "地图下移", "地图置顶", "地图置底"]) {
      const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
      expect(button, `button named ${label}`).not.toBeNull();
      const svg = button!.querySelector("svg");
      expect(svg, `icon of ${label}`).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden"), `icon of ${label}`).toBe("true");
    }

    root.unmount();
  });

  it("names the panel section, control groups, and the edge-style picker state for assistive tech", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={vi.fn()} onReset={() => undefined} />,
    ));

    expect(container.querySelector("section.property-panel")?.getAttribute("aria-label")).toBe("地图属性");
    const positionPair = container.querySelector('[data-property-pair="map-position"]')!;
    expect(positionPair.getAttribute("role")).toBe("group");
    expect(positionPair.getAttribute("aria-label")).toBe("地图位置");
    const sizePair = container.querySelector('[data-property-pair="map-size"]')!;
    expect(sizePair.getAttribute("role")).toBe("group");
    expect(sizePair.getAttribute("aria-label")).toBe("地图尺寸");

    // aria-label on a plain div is inert; role="group" makes these real groups.
    const edgeGroup = container.querySelector(".map-edge-styles")!;
    expect(edgeGroup.getAttribute("role")).toBe("group");
    expect(edgeGroup.getAttribute("aria-label")).toBe("省界线纹理");
    const heatPreview = container.querySelector(".heat-scale-control__preview")!;
    expect(heatPreview.getAttribute("role")).toBe("group");
    expect(heatPreview.getAttribute("aria-label")).toBe("热力色阶预览");

    // The trigger announces that it opens a listbox and which style is active.
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="打开边界风格选择器"]')!;
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    const describedby = trigger.getAttribute("aria-describedby")!;
    expect(container.querySelector(`[id="${describedby}"]`)?.textContent).toBe("实线");

    // Placement mode renders a differently named region.
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={vi.fn()} onReset={() => undefined} mode="placement" />,
    ));
    expect(container.querySelector("section.property-panel")?.getAttribute("aria-label")).toBe("地图位置与尺寸");

    root.unmount();
  });

  it("opens the edge style dial with focus on the selected option and a single roving tab stop", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    // Focus assertions need the tree to live in the document.
    document.body.append(container);
    const root = createRoot(container);
    flushSync(() => root.render(
      <MapInspector map={{ ...baseMap, edgeStyle: "wave" }} onPatch={onPatch} onReset={() => undefined} />,
    ));
    const keydown = (key: string) => flushSync(() => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="打开边界风格选择器"]')!;
    flushSync(() => trigger.click());
    const options = Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="边界风格圆盘"] button'));
    const selected = options.find((option) => option.getAttribute("aria-selected") === "true")!;
    expect(selected.textContent).toContain("水纹");
    // Focus lands inside the popup on the active style, not back on the page.
    expect(document.activeElement).toBe(selected);
    // Roving tabindex: exactly one option is in the Tab order.
    expect(options.filter((option) => option.tabIndex === 0)).toEqual([selected]);

    // The tab stop follows arrow-key focus.
    keydown("ArrowRight");
    const focused = document.activeElement as HTMLButtonElement;
    expect(focused).not.toBe(selected);
    expect(focused.tabIndex).toBe(0);
    expect(selected.tabIndex).toBe(-1);
    expect(options.filter((option) => option.tabIndex === 0)).toEqual([focused]);

    // Escape resets: reopening focuses the selected option again.
    keydown("Escape");
    flushSync(() => trigger.click());
    expect(document.activeElement?.textContent).toContain("水纹");

    flushSync(() => root.unmount());
    container.remove();
  });

  it("drives the edge style dial from the keyboard: arrows cycle, Escape closes and restores focus", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    // Focus assertions need the tree to live in the document.
    document.body.append(container);
    const root = createRoot(container);
    flushSync(() => root.render(
      <MapInspector map={baseMap} onPatch={onPatch} onReset={() => undefined} />,
    ));
    const keydown = (key: string) => flushSync(() => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="打开边界风格选择器"]')!;
    flushSync(() => trigger.click());
    const options = Array.from(container.querySelectorAll<HTMLButtonElement>('[aria-label="边界风格圆盘"] button'));
    expect(options.length).toBeGreaterThan(1);

    options[0]!.focus();
    keydown("ArrowRight");
    expect(document.activeElement).toBe(options[1]);
    keydown("ArrowLeft");
    expect(document.activeElement).toBe(options[0]);
    keydown("ArrowLeft"); // wraps backwards
    expect(document.activeElement).toBe(options[options.length - 1]);
    keydown("Home");
    expect(document.activeElement).toBe(options[0]);
    keydown("End");
    expect(document.activeElement).toBe(options[options.length - 1]);

    keydown("Escape");
    expect(container.querySelector('[aria-label="边界风格圆盘"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    // Selecting an option also hands focus back to the trigger instead of dropping it.
    flushSync(() => trigger.click());
    const wave = container.querySelector<HTMLButtonElement>('button[aria-label="选择水纹边界风格"]')!;
    flushSync(() => wave.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ edgeStyle: "wave" });
    expect(document.activeElement).toBe(trigger);

    flushSync(() => root.unmount());
    container.remove();
  });
});
