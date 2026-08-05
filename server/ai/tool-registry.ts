import type { ToolDefinition } from "./agent-types";

const objectParameters = (description: string, properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  description,
  additionalProperties: false,
  properties,
  required,
});

const patchParameters = (description: string): Record<string, unknown> => ({
  type: "object",
  description,
  additionalProperties: true,
});

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "inspect_project",
      description: "读取工程精简投影中的真实当前值。修改前先查询，path 使用点分路径，例如 map.scale、cards.fontSize、textElements.0.fontSize。",
      parameters: objectParameters("要读取的工程路径。", {
        path: { type: "string", description: "点分路径" },
      }, ["path"]),
    },
  },
  {
    type: "function",
    function: {
      name: "describe_capability",
      description: "查询一个场景域允许修改的属性名。domain 取 canvas、map、province、cards、guests、text、asset。",
      parameters: objectParameters("要查询的场景域。", {
        domain: { type: "string", enum: ["canvas", "map", "province", "cards", "guests", "text", "asset"] },
      }, ["domain"]),
    },
  },
  {
    type: "function",
    function: {
      name: "check_health",
      description: "检查当前影子画布的出界、遮挡、文字不可读和连线冲突问题。修改布局后应调用。",
      parameters: objectParameters("无需参数。", {}),
    },
  },
  {
    type: "function",
    function: {
      name: "find_assets",
      description: "按省份或关键词检索系统和用户素材，返回可引用的 assetId；不得自行编造 assetId 或 data URL。",
      parameters: objectParameters("素材筛选条件。", {
        province: { type: "string" },
        keyword: { type: "string" },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "update_canvas",
      description: "修改画布的尺寸、边距、背景和全局行高等设置。",
      parameters: patchParameters("属性名到新值的补丁；先用 describe_capability 查询。"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_map",
      description: "修改地图位置、尺寸、缩放、配色、标签、填充和图层设置。",
      parameters: patchParameters("属性名到新值的补丁；不要写 cards 或 text 的属性。"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_province",
      description: "修改指定省份的样式。appearance 的 src/assetId 只能引用 find_assets 返回的已有素材。",
      parameters: objectParameters("省份与样式补丁。", {
        province: { type: "string" },
        patch: patchParameters("省份样式补丁。"),
      }, ["province", "patch"]),
    },
  },
  {
    type: "function",
    function: {
      name: "update_cards",
      description: "修改卡片预设、字号、字段、间距、连线和布局模式。cards.positions 受保护，只能由 auto_layout 修改。",
      parameters: patchParameters("卡片设置补丁；禁止包含 positions。"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_guests",
      description: "修改特邀嘉宾面板的标题、位置、尺寸、样式、显示模式和人员列表。",
      parameters: patchParameters("嘉宾面板补丁。"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_text",
      description: "修改指定文本元素的内容、位置、字号、颜色、对齐和可见性。id 必须来自 inspect_project。",
      parameters: objectParameters("文本元素与补丁。", {
        id: { type: "string" },
        patch: patchParameters("文本元素补丁；不能修改 id。"),
      }, ["id", "patch"]),
    },
  },
  {
    type: "function",
    function: {
      name: "update_asset",
      description: "修改指定贴图元素的位置、尺寸、旋转、透明度、层级和可见性。不能修改 src 或 id。",
      parameters: objectParameters("贴图元素与补丁。", {
        id: { type: "string" },
        patch: patchParameters("贴图元素补丁；不能修改 src 或 id。"),
      }, ["id", "patch"]),
    },
  },
  {
    type: "function",
    function: {
      name: "set_data_view",
      description: "切换数据分组视图。此操作通过现有数据视图逻辑执行并保留 cards.positions。",
      parameters: objectParameters("新的数据视图。", {
        view: { type: "string", enum: ["province", "pins", "heat", "city", "university"] },
      }, ["view"]),
    },
  },
  {
    type: "function",
    function: {
      name: "auto_layout",
      description: "使用真实自动排版算法重新计算所有卡片位置。会覆盖手工卡片位置，若已有手工位置属于高风险。",
      parameters: objectParameters("自动排版选项。", {
        mode: { type: "string", enum: ["quadrant", "radial", "right-stack", "grid"] },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "manage_students",
      description: "隐藏、恢复或去重学生；改写姓名/院校/城市事实字段必须高风险确认。",
      parameters: objectParameters("名单操作。", {
        action: { type: "string", enum: ["hide", "show", "remove_duplicate", "update_fact"] },
        studentId: { type: "string" },
        name: { type: "string" },
        fields: { type: "object" },
      }, ["action"]),
    },
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "任务完成后返回中文总结。若丢弃了手工位置，必须将 lostManualLayout 设为 true 并说明。",
      parameters: objectParameters("完成总结。", {
        summary: { type: "string" },
        lostManualLayout: { type: "boolean" },
      }, ["summary"]),
    },
  },
];

export const ALL_TOOL_NAMES = AGENT_TOOLS.map((tool) => tool.function.name);
export const READ_ONLY_TOOLS = new Set([
  "inspect_project",
  "describe_capability",
  "check_health",
  "find_assets",
]);
export const WRITE_TOOLS = new Set(
  ALL_TOOL_NAMES.filter((name) => !READ_ONLY_TOOLS.has(name) && name !== "finish"),
);
