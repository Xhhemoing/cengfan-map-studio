import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { LayoutGroup } from "../../lib/layout";
import { DestinationCard, type DestinationCardStyle } from "./DestinationCard";

const group: LayoutGroup = {
  key: "北京市",
  title: "北京市",
  count: 1,
  students: [],
};

function centerAlignedStyle(): DestinationCardStyle {
  return {
    preset: "standard",
    background: "#ffffff",
    opacity: 1,
    textColor: "#1c3154",
    fontSize: 12,
    showCount: false,
    horizontalPadding: 12,
    lineHeightMultiplier: 1,
    rowHeight: 20,
    edgeColor: "#1c3154",
    activeColor: "#e95646",
    frameMode: "fixed",
    frameStyle: {
      fontSize: 12,
      color: "#1c3154",
      background: "#ffffff",
      opacity: 1,
      padding: 12,
      margin: 0,
      align: "center",
      borderColor: "#1c3154",
      borderWidth: 1,
      borderRadius: 6,
    },
    frameTitleItem: {
      id: "title",
      kind: "field",
      field: "title",
      x: 12,
      y: 12,
      width: 180,
      height: 24,
      zIndex: 0,
    },
    frameBodyItem: {
      id: "name",
      kind: "field",
      field: "name",
      x: 12,
      y: 42,
      width: 196,
      height: 18,
      zIndex: 1,
    },
    customFrameItems: [],
    flowTitleFontSize: 12,
    flowNameFontSize: 12,
    flowContentStart: 0,
    userFonts: [],
  };
}

describe("DestinationCard Round 3 frame alignment", () => {
  it("anchors fixed-mode title text in the middle when frame alignment is center", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    try {
      flushSync(() => root.render(
        <svg>
          <DestinationCard
            style={centerAlignedStyle()}
            group={group}
            province="北京市"
            rows={[]}
            titleLines={[[{ text: "北京市", field: "title" }]]}
            headerExtra={0}
            width={220}
            height={110}
            provinceTexture={null}
          />
        </svg>,
      ));

      const title = container.querySelector("[data-card-title-line]");
      expect(title?.getAttribute("text-anchor")).toBe("middle");
      expect(title?.getAttribute("x")).toBe("102");
    } finally {
      flushSync(() => root.unmount());
      container.remove();
    }
  });
});
