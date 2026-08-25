import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { MapLayer } from "./MapLayer";
import { feature, installMapLayerTestHarness, trackedRoot } from "./map-layer-test-harness";
import type { MapSettings } from "../../lib/scene-document";

installMapLayerTestHarness();

describe("MapLayer aligned overlay stacking and handles", () => {
  it("orders an uploaded overlay below borders by default", () => {
    const { container, root } = trackedRoot();
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

  });

  it("orders an uploaded overlay above borders when zIndex >= 50", () => {
    const { container, root } = trackedRoot();
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

  });
  it("renders resize handles for an overlay image when the map is selected", () => {
    const { container, root } = trackedRoot();
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

  });
});
