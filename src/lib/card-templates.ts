import type { CardSettings } from "./scene-document";


export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  category: "classic" | "ticket" | "photo" | "minimal" | "compact" | "flow" | "grouped";
  cards: Partial<CardSettings>;
  builtin: boolean;
}

const BUILTIN_TEMPLATES: CardTemplate[] = [
  {
    id: "color-pill",
    name: "彩色胶囊省份卡",
    description: "省名叠放、圆角纯色卡片，适合活泼班级海报",
    category: "compact",
    cards: { presentation: "color-pill", preset: "borderless", grouping: "province", compactLayout: true, showCount: false, citySubgroups: false, connectorStyle: "straight", connectorDash: "dotted", opacity: 1, padding: 9, horizontalPadding: 15, bottomPadding: 10, maxWidth: 210 },
    builtin: true,
  },
  {
    id: "emblem-list",
    name: "校徽开放名单",
    description: "无底框地区标题、校徽与学校姓名名单，适合粉彩海报",
    category: "minimal",
    cards: { presentation: "emblem-list", preset: "borderless", grouping: "province", compactLayout: false, showCount: false, showProvinceTexture: false, connectorStyle: "curve", connectorDash: "solid", opacity: 0, padding: 8, horizontalPadding: 8, bottomPadding: 8, maxWidth: 245 },
    builtin: true,
  },
  {
    id: "city-label",
    name: "城市自由标注",
    description: "大城市标题与开放式学校名单，适合地图内外交错排版",
    category: "minimal",
    cards: { presentation: "city-label", preset: "borderless", grouping: "city", compactLayout: true, showCount: false, showProvinceTexture: false, connectorStyle: "curve", connectorDash: "dotted", allowMapOverlap: true, opacity: 0, padding: 6, horizontalPadding: 6, bottomPadding: 6, maxWidth: 220 },
    builtin: true,
  },
  {
    id: "glass-stat",
    name: "半透明统计卡",
    description: "省份顶栏、人数与城市分组，适合信息密集型版图",
    category: "grouped",
    cards: { presentation: "glass-stat", preset: "standard", grouping: "province", compactLayout: true, showCount: true, citySubgroups: true, connectorStyle: "straight", connectorDash: "dashed", opacity: 0.78, padding: 8, horizontalPadding: 10, bottomPadding: 8, maxWidth: 230 },
    builtin: true,
  },
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
  return {
    ...template.cards,
    templateId: template.id,
    displayFrame: undefined,
  };
}

export function getLegacyPresetTemplateId(preset: string): string {
  return LEGACY_PRESET_MAP[preset] || "standard";
}
