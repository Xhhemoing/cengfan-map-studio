import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DestinationCard, type CardProvinceTexture, type DestinationCardStyle, type PreparedCardRow } from "./DestinationCard";
import type { DisplayFrameFlowBlock, DisplayFrameItemStyle } from "../../lib/display-frame";
import type { LayoutGroup } from "../../lib/layout";

export const group: LayoutGroup = {
  key: "北京市",
  title: "北京市",
  count: 2,
  students: [],
};

export const rows: PreparedCardRow[] = [
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
    lines: [[{ text: "林舟", field: "name" }, { text: " · " }, { text: "北京大学", field: "university" }]],
  },
];

export const titleLines = [[{ text: "北京市", field: "title" as const }]];

export function createStyle(overrides: Partial<DestinationCardStyle> = {}): DestinationCardStyle {
  return {
    preset: "standard",
    background: "#ffffff",
    opacity: 0.9,
    textColor: "#1c3154",
    fontSize: 12,
    showCount: true,
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
      opacity: 0.9,
      padding: 12,
      margin: 0,
      align: "left",
      borderColor: "#1c3154",
      borderWidth: 1,
      borderRadius: 6,
    },
    frameBodyItem: { id: "name", kind: "field", field: "name", x: 12, y: 42, width: 196, height: 18, zIndex: 1 },
    frameTitleItem: { id: "title", kind: "field", field: "title", x: 12, y: 12, width: 180, height: 24, zIndex: 0 },
    customFrameItems: [],
    flowTitleFontSize: 12,
    flowNameFontSize: 12,
    flowContentStart: 0,
    userFonts: [],
    ...overrides,
  };
}

export function centeredFrameStyle(): DestinationCardStyle["frameStyle"] {
  return {
    fontSize: 12,
    color: "#1c3154",
    background: "#ffffff",
    opacity: 0.9,
    padding: 12,
    margin: 0,
    align: "center",
    borderColor: "#1c3154",
    borderWidth: 1,
    borderRadius: 6,
  };
}

export function flowBlocks(styles: Partial<Record<"title" | "name" | "city", DisplayFrameItemStyle>> = {}) {
  const block = (id: "title" | "name" | "city", order: number): DisplayFrameFlowBlock => ({
    id,
    kind: "field",
    field: id,
    order,
    spacing: order === 0 ? 0 : 6,
    lineHeight: 1.2,
    ...(styles[id] ? { style: styles[id] } : {}),
  });
  return {
    flowTitleBlock: block("title", 0),
    flowNameBlock: block("name", 1),
    flowCityBlock: block("city", 2),
  };
}

interface RenderOptions {
  headerExtra?: number;
  provinceTexture?: CardProvinceTexture | null;
  titleLines?: typeof titleLines;
}

export function renderCard(style: DestinationCardStyle, options: RenderOptions = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => flushSync(() => root.render(
    <svg>
      <DestinationCard
        style={style}
        group={group}
        province="北京市"
        rows={rows}
        titleLines={options.titleLines ?? titleLines}
        headerExtra={options.headerExtra ?? 0}
        width={220}
        height={110}
        provinceTexture={options.provinceTexture ?? null}
      />
    </svg>,
  ));
  render();
  return {
    container,
    render,
    dispose: () => {
      flushSync(() => root.unmount());
      container.remove();
    },
  };
}
