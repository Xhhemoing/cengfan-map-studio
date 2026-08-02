import type { CardGrouping, CardPreset } from "./template-document";

export interface LayoutStrategy {
  grouping: CardGrouping;
  cardPreset: CardPreset;
  densify: boolean;
  warning?: string;
}

export function chooseLayoutStrategy(studentCount: number): LayoutStrategy {
  if (studentCount <= 50) {
    return {
      grouping: "province",
      cardPreset: "standard",
      densify: false,
    };
  }

  if (studentCount <= 70) {
    return {
      grouping: "province",
      cardPreset: "compact",
      densify: true,
    };
  }

  return {
    grouping: "province",
    cardPreset: "compact",
    densify: true,
    warning: "超过 70 人时单页可读性不足，建议按班级或地区拆分",
  };
}
