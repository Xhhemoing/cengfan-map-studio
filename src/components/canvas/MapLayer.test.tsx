import { describe, expect, it, vi } from "vitest";
import { geoMercator, geoPath } from "d3-geo";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MapLayer } from "./MapLayer";
import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";

const feature: MapFeature = {
  type: "Feature",
  properties: { adcode: 1, name: "北京市", center: [116, 40] },
  geometry: { type: "Polygon", coordinates: [[[115.5, 39.5], [116.5, 39.5], [116.5, 40.5], [115.5, 40.5], [115.5, 39.5]]] },
  id: "1",
  name: "北京市",
  shortName: "北京",
  center: [116, 40],
};

const baseMapSettings: Pick<MapSettings, "edgeStyle" | "edgeWidth" | "provinceStyles"> = {
  edgeStyle: "solid",
  edgeWidth: 1,
  provinceStyles: {},
};

describe("MapLayer", () => {
  it("renders the selected province label font over the map-wide font", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{
            x: 0, y: 0, width: 800, height: 690, scale: 1,
            landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: true,
            provinceLabelFontId: "font-system-serif",
            ...baseMapSettings,
            provinceStyles: { 北京市: { labelFontId: "font-system-kaiti" } },
          }}
          features={[feature]}
          counts={new Map()}
        />
      </svg>,
    ));

    expect(container.querySelector('[data-province-label="1"]')?.getAttribute("font-family")).toContain("KaiTi");
    flushSync(() => root.unmount());
  });

  it("uses scene frame and scale and reports map selection", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onSelect = vi.fn();
    flushSync(() => root.render(
      <MapLayer
        settings={{ x: 350, y: 120, width: 800, height: 690, scale: 1.2, landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: true, ...baseMapSettings }}
        features={[feature]}
        counts={new Map([["北京市", 1]])}
        onSelectMap={onSelect}
      />,
    ));
    const group = container.querySelector("[data-map-layer]")!;
    expect(group.getAttribute("transform")).toContain("translate(350 120)");
    expect(group.getAttribute("data-width")).toBe("800");
    expect(group.getAttribute("data-height")).toBe("690");
    expect(group.getAttribute("data-scale")).toBe("1.2");
    flushSync(() => group.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith({ type: "map" });
    root.unmount();
    container.remove();
  });

  it("applies map opacity to the rendered map content without hiding the frame", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{
            x: 0,
            y: 0,
            width: 800,
            height: 690,
            scale: 1,
            opacity: 0.45,
            landColor: "#eee",
            activeColor: "#123",
            edgeColor: "#456",
            showProvinceLabels: true,
            ...baseMapSettings,
          }}
          features={[feature]}
          counts={new Map()}
        />
      </svg>,
    ));

    expect(container.querySelector("[data-map-content]")?.getAttribute("opacity")).toBe("0.45");
    expect(container.querySelector("[data-map-frame]")).not.toBeNull();
    root.unmount();
    container.remove();
  });

  it("renders map data from supplied counts and hides its editor overlay for export", () => {
    const theme = {
      ink: "#112233",
      heatColors: ["#cce8df", "#92cabb", "#4e9f8c", "#17675e"],
    };
    const settings = {
      x: 350,
      y: 120,
      width: 800,
      height: 690,
      scale: 1.2,
      landColor: "#eee",
      activeColor: "#123",
      edgeColor: "#456",
      showProvinceLabels: true,
      ...baseMapSettings,
    };

    const editorContainer = document.createElement("div");
    const exportContainer = document.createElement("div");
    const editorRoot = createRoot(editorContainer);
    const exportRoot = createRoot(exportContainer);

    flushSync(() => editorRoot.render(
      <svg>
        <MapLayer
          settings={settings}
          features={[feature]}
          counts={new Map([["北京市", 3]])}
          dataView="heat"
          theme={theme}
          onSelectMap={vi.fn()}
        />
      </svg>,
    ));
    flushSync(() => exportRoot.render(
      <svg>
        <MapLayer
          settings={settings}
          features={[feature]}
          counts={new Map([["北京市", 3]])}
          dataView="heat"
          theme={theme}
          onSelectMap={vi.fn()}
          exportMode
        />
      </svg>,
    ));

    expect(editorContainer.querySelector('[data-province-id="1"]')?.getAttribute("fill")).toBe(
      "#17675e",
    );
    expect(editorContainer.querySelector('[data-province-label="1"]')?.getAttribute("fill")).toBe(
      "#112233",
    );
    expect(editorContainer.querySelector('[data-province-label="1"]')?.textContent).toBe("北京*");
    expect(editorContainer.querySelector("[data-map-selection-overlay]")).not.toBeNull();
    expect(exportContainer.querySelector("[data-map-selection-overlay]")).toBeNull();

    editorRoot.unmount();
    exportRoot.unmount();
    editorContainer.remove();
    exportContainer.remove();
  });

  it("positions province labels at the projected administrative center", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{ x: 0, y: 0, width: 800, height: 690, scale: 1, landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: true, ...baseMapSettings }}
          features={[feature]}
          counts={new Map()}
        />
      </svg>,
    ));
    const label = container.querySelector('[data-province-label="1"]')!;
    expect(Number(label.getAttribute("x"))).toBeGreaterThan(0);
    expect(Number(label.getAttribute("y"))).toBeGreaterThan(0);
    expect(label.getAttribute("data-label-anchor")).toBe("administrative-center");
    expect(label.textContent).toBe("北京");
    root.unmount();
    container.remove();
  });

  it("centers province textures on the geometry centroid instead of the administrative center", () => {
    const asymmetricFeature: MapFeature = {
      ...feature,
      center: [116.4, 40.3],
      properties: { ...feature.properties, center: [116.4, 40.3] },
      geometry: {
        type: "Polygon",
        coordinates: [[[115.5, 39.5], [116.5, 39.5], [116.5, 40], [116, 40], [116, 40.5], [115.5, 40.5], [115.5, 39.5]]],
      },
    };
    const settings: MapSettings = {
      x: 0, y: 0, width: 800, height: 690, scale: 1,
      landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: true,
      ...baseMapSettings,
      provinceStyles: {
        北京市: {
          appearance: {
            kind: "texture",
            assetId: "texture-beijing",
            src: "data:image/png;base64,AAAA",
            fit: "contain",
            overflow: true,
          },
        },
      },
    };
    const projection = geoMercator().fitExtent(
      [[0, 0], [settings.width, settings.height]],
      { type: "FeatureCollection", features: [asymmetricFeature] } as never,
    );
    const expected = geoPath(projection).centroid(asymmetricFeature as never);
    const administrativeCenter = projection(asymmetricFeature.center)!;
    expect(Math.hypot(expected[0] - administrativeCenter[0], expected[1] - administrativeCenter[1])).toBeGreaterThan(10);

    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapLayer settings={settings} features={[asymmetricFeature]} counts={new Map()} />
      </svg>,
    ));

    const texture = container.querySelector('[data-province-texture="1"]')!;
    const label = container.querySelector('[data-province-label="1"]')!;
    expect(Number(texture.getAttribute("data-texture-cx"))).toBeCloseTo(expected[0], 4);
    expect(Number(texture.getAttribute("data-texture-cy"))).toBeCloseTo(expected[1], 4);
    expect(label.getAttribute("data-label-anchor")).toBe("administrative-center");
    root.unmount();
    container.remove();
  });

  it("selects and previews a province texture drag before committing once on pointer up", async () => {
    const settings: MapSettings = {
      x: 0, y: 0, width: 800, height: 690, scale: 1,
      landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
      ...baseMapSettings,
      provinceStyles: {
        北京市: { appearance: {
          kind: "texture",
          assetId: "texture-beijing",
          src: "data:image/png;base64,AAAA",
          fit: "contain",
          overflow: true,
        } },
      },
    };
    const onSelectProvince = vi.fn();
    const onMoveProvinceTexture = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={settings}
          features={[feature]}
          counts={new Map()}
          selectedProvince="北京市"
          onSelectProvince={onSelectProvince}
          onMoveProvinceTexture={onMoveProvinceTexture}
        />
      </svg>,
    ));

    const texture = container.querySelector<SVGImageElement>('[data-province-texture="1"]')!;
    const editor = container.querySelector<SVGGElement>('[data-province-texture-editor="1"]')!;
    Object.assign(editor, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
    });
    const initialX = Number(texture.getAttribute("x"));
    const initialY = Number(texture.getAttribute("y"));
    flushSync(() => editor.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, clientX: 100, clientY: 100, pointerId: 7,
    })));
    expect(onSelectProvince).toHaveBeenCalledWith("北京市");
    expect(container.querySelector('[data-province-texture-selection="1"]')).not.toBeNull();

    const moveEvent = new PointerEvent("pointermove", {
      bubbles: true, clientX: 130, clientY: 120, pointerId: 7,
    });
    expect(moveEvent.clientX).toBe(130);
    expect(moveEvent.clientY).toBe(120);
    editor.dispatchEvent(moveEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(Number(container.querySelector('[data-province-texture-editor="1"]')?.getAttribute("data-texture-offset-x"))).toBeCloseTo(30, 2);
    expect(Number(container.querySelector('[data-province-texture-editor="1"]')?.getAttribute("data-texture-offset-y"))).toBeCloseTo(20, 2);
    expect(Number(texture.getAttribute("x"))).toBeCloseTo(initialX + 30, 2);
    expect(Number(texture.getAttribute("y"))).toBeCloseTo(initialY + 20, 2);
    expect(onMoveProvinceTexture).not.toHaveBeenCalled();

    flushSync(() => editor.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true, clientX: 130, clientY: 120, pointerId: 7,
    })));
    expect(onMoveProvinceTexture).toHaveBeenCalledTimes(1);
    expect(onMoveProvinceTexture).toHaveBeenCalledWith("北京市", 30, 20);
    root.unmount();
    container.remove();
  });

  it("renders one labeled pin per visible student in the pins view", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{ x: 0, y: 0, width: 800, height: 690, scale: 1, landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false, ...baseMapSettings }}
          features={[feature]}
          counts={new Map([["北京市", 2]])}
          dataView="pins"
          pins={[
            { id: "student-1", province: "北京市", label: "林舟" },
            { id: "student-2", province: "北京市", label: "陈宁" },
          ]}
        />
      </svg>,
    ));

    expect(container.querySelectorAll("[data-student-pin]")).toHaveLength(2);
    expect(container.textContent).toContain("林舟");
    expect(container.textContent).toContain("陈宁");

    root.unmount();
    container.remove();
  });

  it("renders a compact unlabeled marker for a selected student outside the pins view", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{ x: 0, y: 0, width: 800, height: 690, scale: 1, landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false, ...baseMapSettings }}
          features={[feature]}
          counts={new Map([["北京市", 2]])}
          dataView="province"
          pins={[{ id: "student-1", province: "北京市", label: "林舟" }]}
          selectedStudentId="student-1"
        />
      </svg>,
    ));

    const pin = container.querySelector('[data-student-pin="student-1"]')!;
    expect(pin).not.toBeNull();
    expect(pin.getAttribute("data-selected")).toBe("true");
    expect(pin.querySelector("circle")?.getAttribute("r")).toBe("4");
    expect(pin.querySelector("text")).toBeNull();

    root.unmount();
    container.remove();
  });

  it("renders an uploaded map image while preserving province selection through the SVG hit area", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onSelectProvince = vi.fn();
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{
            x: 0, y: 0, width: 800, height: 690, scale: 1,
            landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
            renderSource: { kind: "image", assetId: "map-upload", src: "data:image/png;base64,AAAA", fit: "contain", opacity: 0.75 },
            ...baseMapSettings,
          }}
          features={[feature]}
          counts={new Map([["北京市", 1]])}
          onSelectProvince={onSelectProvince}
        />
      </svg>,
    ));

    const image = container.querySelector("[data-map-image]");
    const province = container.querySelector('[data-province-hit="1"]')!;
    expect(image?.getAttribute("href")).toBe("data:image/png;base64,AAAA");
    expect(image?.getAttribute("opacity")).toBe("0.75");
    flushSync(() => province.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelectProvince).toHaveBeenCalledWith("北京市");

    root.unmount();
    container.remove();
  });

  it("places aligned overlay images with rotation and keeps vector fills in overlay mode", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{
            x: 0, y: 0, width: 800, height: 600, scale: 1,
            landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
            renderSource: {
              kind: "image",
              assetId: "map-upload",
              src: "data:image/png;base64,BBBB",
              fit: "contain",
              opacity: 0.6,
              composition: "overlay",
              clipToMap: true,
              alignment: {
                sourceWidth: 1000,
                sourceHeight: 500,
                sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
                x: 40,
                y: 50,
                width: 720,
                height: 360,
                rotation: 12,
              },
            },
            ...baseMapSettings,
          }}
          features={[feature]}
          counts={new Map([["北京市", 2]])}
        />
      </svg>,
    ));

    const image = container.querySelector("[data-map-image]")!;
    expect(image.getAttribute("x")).toBe("40");
    expect(image.getAttribute("y")).toBe("50");
    expect(image.getAttribute("width")).toBe("720");
    expect(image.getAttribute("height")).toBe("360");
    expect(image.getAttribute("preserveAspectRatio")).toBe("none");
    expect(image.closest("[data-map-image-aligned]")?.getAttribute("transform")).toContain("rotate(12)");
    expect(container.querySelector("[data-map-image-clip]")).not.toBeNull();
    // overlay keeps vector fills visible
    expect(container.querySelector('[data-province-id="1"]')?.getAttribute("fill")).not.toBe("none");
    expect(container.querySelector('[data-province-id="1"]')?.getAttribute("fill")).not.toBeNull();

    root.unmount();
    container.remove();
  });

  it("keeps province texture images above a replace-mode uploaded map", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const texturedFeature: MapFeature = {
      ...feature,
      geometry: {
        type: "Polygon",
        coordinates: [[[115, 39], [117, 39], [117, 41], [115, 41], [115, 39]]],
      },
    };
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{
            x: 0, y: 0, width: 800, height: 690, scale: 1,
            landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
            renderSource: {
              kind: "image",
              assetId: "map-upload",
              src: "data:image/png;base64,MAP",
              fit: "contain",
              opacity: 1,
              composition: "replace",
            },
            ...baseMapSettings,
            provinceStyles: {
              北京市: {
                appearance: {
                  kind: "texture",
                  assetId: "province-image",
                  src: "data:image/png;base64,PROVINCE",
                  fit: "contain",
                  scale: 0.7,
                  overflow: true,
                },
              },
            },
          }}
          features={[texturedFeature]}
          counts={new Map([["北京市", 1]])}
        />
      </svg>,
    ));

    const mapImage = container.querySelector("[data-map-image]");
    const provinceImage = container.querySelector('[data-province-texture="1"]');
    expect(mapImage).not.toBeNull();
    expect(provinceImage).not.toBeNull();
    expect(provinceImage?.getAttribute("href")).toBe("data:image/png;base64,PROVINCE");
    expect(provinceImage?.getAttribute("data-province-overflow")).toBe("1");
    expect(mapImage?.compareDocumentPosition(provinceImage!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    root.unmount();
    container.remove();
  });

  it("hides vector fills in replace mode without alignment (legacy fit)", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={{
            x: 0, y: 0, width: 800, height: 690, scale: 1,
            landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
            renderSource: {
              kind: "image",
              assetId: "map-upload",
              src: "data:image/png;base64,CCCC",
              fit: "cover",
              opacity: 1,
              composition: "replace",
            },
            ...baseMapSettings,
          }}
          features={[feature]}
          counts={new Map([["北京市", 1]])}
        />
      </svg>,
    ));

    const image = container.querySelector("[data-map-image]")!;
    expect(image.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
    // first MapDataLayer with fills should be suppressed in replace mode
    const fills = Array.from(container.querySelectorAll('[data-province-id="1"]'));
    // borders still render in second pass; fill pass should not paint land colors when replace
    expect(fills.some((node) => node.getAttribute("fill") === "#eee" || node.getAttribute("fill") === "#123")).toBe(false);

    root.unmount();
    container.remove();
  });

  it("orders an uploaded overlay below borders by default", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const base: MapSettings = {
      x: 0, y: 0, width: 800, height: 690, scale: 1,
      landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
      edgeStyle: "solid", edgeWidth: 1, provinceStyles: {},
      renderSource: {
        kind: "image",
        assetId: "map-upload",
        src: "[screenshot]",
        fit: "contain",
        opacity: 1,
        composition: "replace",
        alignment: {
          sourceWidth: 1000,
          sourceHeight: 500,
          sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
          x: 40,
          y: 50,
          width: 720,
          height: 360,
          rotation: 0,
        },
      },
    };

    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={base}
          features={[feature]}
          counts={new Map([["北京市", 1]])}
        />
      </svg>,
    ));

    const mapImage = container.querySelector("[data-map-image]");
    const borders = container.querySelector("[data-map-borders]");
    expect(mapImage).not.toBeNull();
    expect(borders).not.toBeNull();
    expect(mapImage?.compareDocumentPosition(borders!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    root.unmount();
    container.remove();
  });

  it("orders an uploaded overlay above borders when zIndex >= 50", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const base: MapSettings = {
      x: 0, y: 0, width: 800, height: 690, scale: 1,
      landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
      edgeStyle: "solid", edgeWidth: 1, provinceStyles: {},
      renderSource: {
        kind: "image",
        assetId: "map-upload",
        src: "[screenshot]",
        fit: "contain",
        opacity: 1,
        composition: "replace",
        zIndex: 60,
        alignment: {
          sourceWidth: 1000,
          sourceHeight: 500,
          sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
          x: 40,
          y: 50,
          width: 720,
          height: 360,
          rotation: 0,
        },
      },
    };

    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={base}
          features={[feature]}
          counts={new Map([["北京市", 1]])}
        />
      </svg>,
    ));

    const mapImage = container.querySelector("[data-map-image]");
    const borders = container.querySelector("[data-map-borders]");
    expect(mapImage).not.toBeNull();
    expect(borders).not.toBeNull();
    expect(borders?.compareDocumentPosition(mapImage!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    root.unmount();
    container.remove();
  });
  it("renders resize handles for an overlay image when the map is selected", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const base: MapSettings = {
      x: 0, y: 0, width: 800, height: 690, scale: 1,
      landColor: "#eee", activeColor: "#123", edgeColor: "#456", showProvinceLabels: false,
      edgeStyle: "solid", edgeWidth: 1, provinceStyles: {},
      renderSource: {
        kind: "image",
        assetId: "map-upload",
        src: "[screenshot]",
        fit: "contain",
        opacity: 1,
        composition: "replace",
        alignment: {
          sourceWidth: 1000,
          sourceHeight: 500,
          sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
          x: 40,
          y: 50,
          width: 720,
          height: 360,
          rotation: 0,
        },
      },
    };
    const onResize = vi.fn();

    flushSync(() => root.render(
      <svg>
        <MapLayer
          settings={base}
          features={[feature]}
          counts={new Map([["北京市", 1]])}
          selected
          onResizeMapImage={onResize}
        />
      </svg>,
    ));

    const handles = container.querySelectorAll("[data-resize-handles]");
    expect(handles.length).toBe(1);
    const se = handles[0]!.querySelector("[data-resize-handle='se']");
    expect(se).not.toBeNull();

    root.unmount();
    container.remove();
  });
});
