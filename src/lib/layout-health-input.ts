import type { LayoutHealthInput, LayoutHealthObject } from "./layout-health";
import type { ProjectDocument } from "./project-document";

/** 数据框还没被单独摆放时的估算高度,布局体检只看包围盒是否越界与重叠。 */
const CARD_BOUND_HEIGHT = 180;
const GUESTS_BOUND_HEIGHT = 120;
const GUESTS_Z_INDEX = 20;
const TEXT_Z_INDEX = 40;

/** 文本按对齐方式决定包围盒起点:居中与右对齐时 x 是锚点,不是左边界。 */
function textBounds(text: ProjectDocument["textElements"][number]) {
  const x = text.textAlign === "right"
    ? text.x - text.maxWidth
    : text.textAlign === "center"
      ? text.x - text.maxWidth / 2
      : text.x;
  return { x, y: text.y - text.fontSize, width: text.maxWidth, height: text.fontSize * 1.3 };
}

/** 把工程状态投影成布局体检的输入。纯映射,不做任何判定。 */
export function buildProjectLayoutHealthInput(project: ProjectDocument): LayoutHealthInput {
  const positionKeys = Object.keys(project.cards.positions ?? {});
  const objects: LayoutHealthObject[] = [
    {
      id: "map",
      kind: "map",
      zIndex: project.map.zIndex,
      bounds: {
        x: project.map.x,
        y: project.map.y,
        width: project.map.width * project.map.scale,
        height: project.map.height * project.map.scale,
      },
    },
    ...positionKeys.map((id) => ({
      id,
      kind: "card" as const,
      positionKey: id,
      zIndex: project.cards.zIndex,
      bounds: { x: 0, y: 0, width: project.cards.maxWidth, height: CARD_BOUND_HEIGHT },
    })),
    // 一个都没单独摆过时,整组卡片按统一锚点参与体检。
    ...(positionKeys.length === 0
      ? [{
        id: "cards",
        kind: "card" as const,
        zIndex: project.cards.zIndex,
        bounds: { x: project.cards.x, y: project.cards.y, width: project.cards.maxWidth, height: CARD_BOUND_HEIGHT },
      }]
      : []),
    ...(project.guests.visibility
      ? [{
        id: "guests",
        kind: "guests" as const,
        zIndex: GUESTS_Z_INDEX,
        bounds: { x: project.guests.x, y: project.guests.y, width: project.guests.width, height: GUESTS_BOUND_HEIGHT },
      }]
      : []),
    ...project.textElements.map((text) => ({
      id: text.id,
      kind: "text" as const,
      zIndex: TEXT_Z_INDEX,
      bounds: textBounds(text),
      visible: text.visibility,
      content: text.content,
      textColor: text.color,
      backgroundColor: project.canvas.backgroundColor,
    })),
    ...project.assetElements.map((asset) => ({
      id: asset.id,
      kind: "asset" as const,
      zIndex: asset.zIndex,
      bounds: { x: asset.x, y: asset.y, width: asset.width, height: asset.height },
      visible: asset.visibility,
    })),
  ];
  return {
    canvas: { width: project.canvas.width, height: project.canvas.height, safeMargin: project.canvas.safeMargin },
    cardsPositions: project.cards.positions,
    objects,
  };
}
