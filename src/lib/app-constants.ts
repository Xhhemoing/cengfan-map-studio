/**
 * Editor-wide constants and small pure data tables for the App shell.
 * Extracted from App.tsx so the entry file stays within the project's
 * line-count guideline while the studio shell refactor is in flight.
 */
import { getProvinceNames } from "./map-data";
import type { DataViewId } from "./project-data";

export const DRAFT_KEY = "cengfan-map-studio:draft";
export const ROOM_ACCESS_STORAGE_PREFIX = "cengfan-map-studio:room-access:";
export const COLLABORATION_DISPLAY_NAME = "本机协作者";
export const DRAFT_SAVED_AT_KEY = "cengfan-map-studio:draft-saved-at";
export const RENDER_SETTINGS_KEY = "cengfan-map-studio:render-settings";
export const COLLABORATION_SEND_DELAY_MS = 600;

export type ActivePanel = "roster" | "map" | "layout" | "content" | "assets" | "deliver";

export const provinceNames = getProvinceNames();

export const dataViews: Array<{ id: DataViewId; name: string; description: string }> = [
  { id: "province", name: "省份卡片", description: "按省份聚合，同校合并展示" },
  { id: "city", name: "城市卡片", description: "按城市聚合，同校合并展示" },
  { id: "university", name: "院校卡片", description: "按就读院校聚合名单" },
  { id: "pins", name: "地图图钉", description: "在地图内定位" },
  { id: "heat", name: "人数热力", description: "颜色表达数量" },
];
