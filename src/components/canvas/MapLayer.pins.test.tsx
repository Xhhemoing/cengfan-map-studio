import { describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { MapLayer } from "./MapLayer";
import { baseMapSettings, feature, installMapLayerTestHarness, trackedRoot } from "./map-layer-test-harness";

installMapLayerTestHarness();

describe("MapLayer student pins", () => {
  it("renders one labeled pin per visible student in the pins view", () => {
    const { container, root } = trackedRoot();
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

  });

  it("renders a compact unlabeled marker for a selected student outside the pins view", () => {
    const { container, root } = trackedRoot();
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

  });
});
