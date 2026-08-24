import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ReferenceCardVisual, referenceCardColor, readableTextColor, referenceRowLines, type ReferenceCardPresentation } from "./ReferenceCardVisual";
import type { PreparedCardRow } from "./DestinationCard";
import type { LayoutGroup } from "../../lib/layout";

const group: LayoutGroup = { key: "北京市", title: "北京市", count: 3, students: [] };

/** One heading plus a row whose content `wrapCardText` already split across three lines. */
const rows: PreparedCardRow[] = [
  {
    key: "city-北京市",
    parts: [{ field: "city", value: "北京市" }],
    cityHeading: "北京市",
    city: "北京市",
    remainingPeople: 0,
    lines: [[{ text: "北京市", field: "city" }]],
  },
  {
    key: "student-1",
    parts: [{ field: "name", value: "林舟" }],
    city: "北京市",
    university: "北京大学",
    names: "林舟",
    remainingPeople: 0,
    lines: [
      [{ text: "林舟 · ", field: "name" }],
      [{ text: "北京大学", field: "university" }],
      [{ text: "环境科学与工程", field: "university" }],
    ],
  },
];

function renderVisual(presentation: ReferenceCardPresentation) {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(
    <svg>
      <ReferenceCardVisual
        presentation={presentation}
        group={group}
        rows={rows}
        width={200}
        height={140}
        accent="#e95646"
        background="#ffffff"
        opacity={0.9}
        textColor="#1c3154"
        fontSize={12}
        edgeColor="#1c3154"
      />
    </svg>,
  ));
  return {
    container,
    dispose: () => {
      flushSync(() => root.unmount());
      container.remove();
    },
  };
}

const presentations: ReferenceCardPresentation[] = ["color-pill", "emblem-list", "city-label", "glass-stat"];

describe("ReferenceCardVisual", () => {
  it.each(presentations)("draws every wrapped line of %s on its own baseline", (presentation) => {
    const { container, dispose } = renderVisual(presentation);

    const studentLines = Array.from(container.querySelectorAll('[data-card-row-line="student-1"]'));
    expect(studentLines.map((line) => line.textContent)).toEqual(["林舟 · ", "北京大学", "环境科学与工程"]);

    const baselines = studentLines.map((line) => Number(line.getAttribute("y")));
    expect(baselines).toEqual([...baselines].sort((left, right) => left - right));
    expect(new Set(baselines).size).toBe(baselines.length);

    dispose();
  });

  it("keeps the card visual hook and the group title for every presentation", () => {
    for (const presentation of presentations) {
      const { container, dispose } = renderVisual(presentation);

      expect(container.querySelector(`[data-card-visual="${presentation}"]`)).not.toBeNull();
      expect(container.textContent).toContain("北京市");

      dispose();
    }
  });

  it("hides the city heading everywhere except the stat card, which keeps it smaller", () => {
    const pill = renderVisual("color-pill");
    expect(pill.container.querySelector('[data-card-row-line="city-北京市"]')).toBeNull();
    pill.dispose();

    const stat = renderVisual("glass-stat");
    const heading = stat.container.querySelector('[data-card-row-line="city-北京市"]')!;
    expect(heading.getAttribute("font-size")).toBe("11");
    expect(heading.getAttribute("fill")).toBe("#e95646");
    stat.dispose();
  });

  it("numbers body lines continuously so later rows start below the wrapped ones", () => {
    const entries = referenceRowLines(rows);

    expect(entries.map((entry) => entry.start)).toEqual([0, 1]);
    expect(entries[1]?.texts).toHaveLength(3);
  });

  it("picks a stable accent and a readable foreground", () => {
    expect(referenceCardColor("北京市", "#000000")).toBe(referenceCardColor("北京市", "#000000"));
    expect(readableTextColor("#f3c847")).toBe("#1c3154");
    expect(readableTextColor("#263b78")).toBe("#ffffff");
    expect(readableTextColor("not-a-color")).toBe("#ffffff");
  });
});
