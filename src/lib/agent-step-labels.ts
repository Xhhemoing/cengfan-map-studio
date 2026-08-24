/**
 * AI 修改预览的中文步骤标签（I-13-04）：把工具名与补丁字段翻译成与属性
 * 面板一致的中文说法，未收录的字段按原名回退，保证任何步骤都有可读标签。
 */

const TOOL_LABELS: Record<string, string> = {
  update_canvas: "调整画布",
  update_map: "调整地图",
  update_cards: "调整数据卡片",
  update_guests: "调整嘉宾栏",
  update_text: "调整文本",
  update_asset: "调整素材",
  update_province: "调整省份样式",
  set_data_view: "切换数据视图",
  auto_layout: "自动排版",
  manage_students: "管理学生数据",
};

const FIELD_LABELS: Record<string, string> = {
  x: "水平位置",
  y: "垂直位置",
  width: "宽度",
  height: "高度",
  zIndex: "图层顺序",
  opacity: "透明度",
  visibility: "显示状态",
  fontSize: "字号",
  safeMargin: "安全边距",
  backgroundColor: "背景色",
  backgroundFit: "背景填充",
  backgroundOpacity: "背景透明度",
  backgroundImageSrc: "画布背景图",
  lineHeight: "行高",
  scale: "缩放",
  landColor: "陆地颜色",
  activeColor: "高亮颜色",
  edgeColor: "描边颜色",
  edgeStyle: "描边样式",
  edgeWidth: "描边宽度",
  showProvinceLabels: "省份名称标注",
  collapseSouthChinaSea: "南海诸岛折叠",
  fillMode: "填充模式",
  emptyProvinceFill: "无人省份填充",
  heatScale: "热力色阶",
  preset: "卡片样式",
  compactLayout: "紧凑排版",
  maxWidth: "最大宽度",
  padding: "内边距",
  horizontalPadding: "水平内边距",
  bottomPadding: "底部内边距",
  gap: "卡片间距",
  columns: "列数",
  background: "背景色",
  textColor: "文字颜色",
  connectorStyle: "连接线样式",
  connectorColor: "连接线颜色",
  connectorWidth: "连接线宽度",
  connectorDash: "连接线虚线",
  layoutMode: "排布方式",
  autoBalance: "自动平衡左右",
  allowMapOverlap: "允许覆盖地图",
  showProvinceTexture: "省份贴图",
  showCount: "显示人数",
  grouping: "分组方式",
  citySubgroups: "城市子分组",
  visibleFields: "显示字段",
  content: "文字内容",
  title: "标题",
  people: "嘉宾名单",
  fontFamily: "字体",
  fontWeight: "字重",
  color: "文字颜色",
  textAlign: "对齐方式",
  label: "名称",
  appearance: "省份贴图",
  textureSrc: "贴图图片",
};

const DATA_VIEW_LABELS: Record<string, string> = {
  province: "省份卡片",
  city: "城市卡片",
  university: "院校卡片",
  pins: "地图图钉",
  heat: "人数热力",
};

const LAYOUT_MODE_LABELS: Record<string, string> = {
  quadrant: "四象限",
  radial: "极角环绕",
  "right-stack": "右侧单列",
  grid: "边缘网格",
};

/** patch 之外直接平铺参数时，这些键只是定位目标，不作为「改了什么」展示。 */
const IDENTIFIER_KEYS = new Set(["id", "province", "view", "mode", "action", "studentId", "studentIds"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function agentStepLabel(step: { name: string; arguments: Record<string, unknown> }): string {
  if (step.name === "set_data_view") {
    const view = String(step.arguments.view ?? "");
    return `切换数据视图：${DATA_VIEW_LABELS[view] ?? view}`;
  }
  if (step.name === "auto_layout") {
    const mode = String(step.arguments.mode ?? "quadrant");
    return `自动排版：${LAYOUT_MODE_LABELS[mode] ?? mode}`;
  }
  const tool = TOOL_LABELS[step.name] ?? step.name;
  const patch = isPlainRecord(step.arguments.patch)
    ? step.arguments.patch
    : step.name.startsWith("update_")
      ? Object.fromEntries(Object.entries(step.arguments).filter(([key]) => !IDENTIFIER_KEYS.has(key)))
      : {};
  const fields = Object.keys(patch).map((key) => FIELD_LABELS[key] ?? key);
  return fields.length > 0 ? `${tool}：${fields.join("、")}` : tool;
}
