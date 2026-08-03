import type { DataViewId } from "./project-data";

export const PRESENTATION_VIEWS: Array<{ id: DataViewId; label: string; description: string }> = [
  { id: "province", label: "省份", description: "按省份汇总数据卡片" },
  { id: "city", label: "城市", description: "按城市汇总数据卡片" },
  { id: "university", label: "学校", description: "按院校汇总数据卡片" },
  { id: "pins", label: "图钉", description: "在地图上定位记录" },
  { id: "heat", label: "热力", description: "用颜色表达数量" },
];
