import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { MapLayer } from "./MapLayer";
import { baseMapSettings, feature, installMapLayerTestHarness, trackedRoot } from "./map-layer-test-harness";

installMapLayerTestHarness();

describe("MapLayer scene frame", () => {
  it("uses scene frame and scale and reports map selection", () => {
    const { container, root } = trackedRoot();
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
  });

  it("applies map opacity to the rendered map content without hiding the frame", () => {
    const { container, root } = trackedRoot();
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

    const { container: editorContainer, root: editorRoot } = trackedRoot();
    const { container: exportContainer, root: exportRoot } = trackedRoot();

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
  });
});
