import type { CardLayoutModeValue } from "./scene-document";

/** 顶栏重算菜单与卡片检查器共用的排布算法清单，避免两处文案漂移。 */
export const CARD_LAYOUT_MODE_OPTIONS: ReadonlyArray<{ id: CardLayoutModeValue; label: string }> = [
  { id: "quadrant", label: "四象限" },
  { id: "radial", label: "极角环绕" },
  { id: "right-stack", label: "右侧单列" },
  { id: "grid", label: "边缘网格" },
];

export function cardLayoutModeLabel(mode: CardLayoutModeValue): string {
  return CARD_LAYOUT_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? "四象限";
}
