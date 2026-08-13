import type { CardSettings } from "./scene-document";
import type { DisplayFrameDefinition } from "./display-frame";
import { createId } from "./ids";

export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  category: "classic" | "ticket" | "photo" | "minimal" | "compact" | "flow" | "grouped";
  cards: Partial<CardSettings>;
  displayFrame?: DisplayFrameDefinition;
  builtin: boolean;
}

const BUILTIN_TEMPLATES: CardTemplate[] = [
  {
    id: "standard",
    name: "标准毕业去向表",
    description: "白色背景+浅灰细边框，字段垂直堆叠，经典毕业去向展示",
    category: "classic",
    cards: { preset: "standard", compactLayout: false, showCount: true, showProvinceTexture: false, grouping: "province", connectorStyle: "curve" },
    builtin: true,
  },
  {
    id: "ticket",
    name: "票券风格",
    description: "白色背景+较粗虚线边框，撕票感，适合邀请函/车票风格",
    category: "ticket",
    cards: { preset: "ticket", compactLayout: false, showCount: true, showProvinceTexture: false, grouping: "province", connectorDash: "dashed" },
    builtin: true,
  },
  {
    id: "photo",
    name: "照片卡片",
    description: "左侧缩略图位+右侧文字区，适合地域特色展示",
    category: "photo",
    cards: { preset: "photo", compactLayout: false, showCount: true, showProvinceTexture: true, grouping: "province" },
    builtin: true,
  },
  {
    id: "borderless",
    name: "无边框极简",
    description: "纯背景色、无边框、杂志风现代简约",
    category: "minimal",
    cards: { preset: "borderless", compactLayout: true, showCount: false, showProvinceTexture: false, grouping: "province", connectorStyle: "curve" },
    builtin: true,
  },
  {
    id: "compact",
    name: "超紧凑名单",
    description: "大幅压缩行间距，适合60+学生名单展示",
    category: "compact",
    cards: { preset: "standard", compactLayout: true, showCount: true, showProvinceTexture: false, grouping: "province", gap: 4, padding: 6, fontSize: 11, maxWidth: 200 },
    builtin: true,
  },
  {
    id: "ticket-with-texture",
    name: "地域特色票券",
    description: "票券+省份贴图，强调高考地域感",
    category: "ticket",
    cards: { preset: "ticket", compactLayout: false, showCount: true, showProvinceTexture: true, grouping: "province", connectorDash: "dashed" },
    builtin: true,
  },
  {
    id: "academic",
    name: "院校分组专业风",
    description: "按院校分组，标准卡片，避免贴图干扰",
    category: "grouped",
    cards: { preset: "standard", compactLayout: false, showCount: true, showProvinceTexture: false, grouping: "university" },
    builtin: true,
  },
  {
    id: "city-story",
    name: "城市分组连接线强调",
    description: "按城市分组，elbow+rail纹理，讲故事线展示",
    category: "grouped",
    cards: { preset: "standard", compactLayout: false, showCount: true, showProvinceTexture: false, grouping: "city", connectorStyle: "elbow", connectorDash: "rail" },
    builtin: true,
  },
  {
    id: "three-line",
    name: "姓名+大学+城市三行紧凑",
    description: "flow模式三行紧凑模板（姓名在上、大学中、城市下）",
    category: "flow",
    cards: { preset: "standard", compactLayout: true, showCount: true, grouping: "province" },
    displayFrame: {
      mode: "flow",
      style: { fontSize: 12, color: "#1c3154", background: "#ffffff", opacity: 1, padding: 8, margin: 0, align: "left", borderColor: "#1c3154", borderWidth: 1, borderRadius: 6 },
      fieldOrder: ["name", "university", "city"],
      fixed: { items: [] },
      flow: {
        blocks: [
          { id: createId("block"), kind: "field", field: "name", order: 0, spacing: 2, lineHeight: 1.2 },
          { id: createId("block"), kind: "text", content: "·", order: 1, spacing: 2, lineHeight: 1.2 },
          { id: createId("block"), kind: "field", field: "university", order: 2, spacing: 2, lineHeight: 1.2 },
          { id: createId("block"), kind: "text", content: "·", order: 3, spacing: 2, lineHeight: 1.2 },
          { id: createId("block"), kind: "field", field: "city", order: 4, spacing: 2, lineHeight: 1.2 },
        ],
      },
    },
    builtin: true,
  },
  {
    id: "flow-custom",
    name: "Flow 模式自定义样板",
    description: "flow 模式基础样板，支持静态文本「去往」等",
    category: "flow",
    cards: { preset: "standard", compactLayout: false, showCount: true, grouping: "province" },
    displayFrame: {
      mode: "flow",
      style: { fontSize: 13, color: "#1c3154", background: "#ffffff", opacity: 1, padding: 10, margin: 2, align: "left", borderColor: "#1c3154", borderWidth: 1, borderRadius: 4 },
      fieldOrder: ["name", "university", "city"],
      fixed: { items: [] },
      flow: {
        blocks: [
          { id: createId("block"), kind: "field", field: "name", order: 0, spacing: 4, lineHeight: 1.3 },
          { id: createId("block"), kind: "text", content: "去往", order: 1, spacing: 4, lineHeight: 1.3 },
          { id: createId("block"), kind: "field", field: "university", order: 2, spacing: 4, lineHeight: 1.3 },
          { id: createId("block"), kind: "text", content: "·", order: 3, spacing: 4, lineHeight: 1.3 },
          { id: createId("block"), kind: "field", field: "city", order: 4, spacing: 4, lineHeight: 1.3 },
        ],
      },
    },
    builtin: true,
  },
];

export function listCardTemplates(): CardTemplate[] {
  return [...BUILTIN_TEMPLATES];
}

export function getCardTemplateById(id: string): CardTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}

const LEGACY_PRESET_MAP: Record<string, string> = {
  standard: "standard",
  ticket: "ticket",
  photo: "photo",
  borderless: "borderless",
  compact: "compact",
};

export function applyCardTemplate(templateId: string, _currentCards: CardSettings): Partial<CardSettings> {
  const template = getCardTemplateById(templateId) || getCardTemplateById(LEGACY_PRESET_MAP[templateId] || "");
  if (!template) return {};
  // displayFrame 显式写入：模板带 displayFrame 则应用，否则清除旧自定义展示框，
  // 避免切换回普通模板后渲染仍停留在旧的自定义排版。
  return {
    ...template.cards,
    templateId: template.id,
    displayFrame: template.displayFrame,
  };
}

export function getLegacyPresetTemplateId(preset: string): string {
  return LEGACY_PRESET_MAP[preset] || "standard";
}
