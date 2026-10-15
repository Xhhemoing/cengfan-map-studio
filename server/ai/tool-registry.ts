import type { ToolDefinition } from "./agent-types";
import { scenePatchSchema, type SceneDomain } from "../../src/lib/scene-capabilities";
import { READ_ONLY_AGENT_TOOLS } from "../../src/lib/agent-tool-contract";

export const MAX_TOOL_RESULT_BYTES = 16 * 1024;
export const MAX_HEALTH_ISSUES = 20;
export const MAX_ASSET_RESULTS = 20;
export const MAX_LAYOUT_SAMPLES = 10;

const objectParameters = (description: string, properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  description,
  additionalProperties: false,
  properties,
  required,
});

const scopeIds = { type: "array", minItems: 1, maxItems: 200, items: { type: "string" }, description: "真实展示框 ID。省略为全图；指定后不能扩大范围。" };
const patchParameters = (domain: SceneDomain): Record<string, unknown> => ({ ...scenePatchSchema(domain) });
const updateParameters = (domain: SceneDomain): Record<string, unknown> => objectParameters("类型化场景修改，返回实际值与规范化差异。", { patch: patchParameters(domain), ...(domain === "cards" ? { scopeIds } : {}) }, ["patch"]);

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "inspect_project",
      description: "按需读取真实场景属性，缺失明确返回 NOT_AVAILABLE。path 使用点分路径，例如 cards.background、textElements.0.fontSize；名单仅返回聚合。",
      parameters: objectParameters("要读取的工程路径。", {
        path: { type: "string", description: "点分路径" },
      }, ["path"]),
    },
  },
  {
    type: "function",
    function: {
      name: "describe_capability",
      description: "查询一个场景域允许修改的属性、类型、枚举、单位和边界。domain 取 canvas、map、province、cards、guests、text、asset。",
      parameters: objectParameters("要查询的场景域。", {
        domain: { type: "string", enum: ["canvas", "map", "province", "cards", "guests", "text", "asset"] },
      }, ["domain"]),
    },
  },
  {
    type: "function",
    function: {
      name: "check_health",
      description: "使用与画布相同的场景输入检查布局和连线，返回测量状态、问题和指标；estimated 不得解释为实际字体已测。",
      parameters: objectParameters("可限定问题的展示框范围。", { scopeIds }),
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
      parameters: updateParameters("canvas"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_map",
      description: "修改地图位置、尺寸、缩放、配色、标签、填充和图层设置。",
      parameters: updateParameters("map"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_province",
      description: "修改指定省份的样式。appearance 的 src/assetId 只能引用 find_assets 返回的已有素材。",
      parameters: objectParameters("省份与样式补丁。", {
        province: { type: "string" },
        patch: patchParameters("province"),
      }, ["province", "patch"]),
    },
  },
  {
    type: "function",
    function: {
      name: "update_cards",
      description: "修改卡片预设、字号、字段、间距、连线和布局模式。cards.positions 受保护，只能由 auto_layout 修改。",
      parameters: updateParameters("cards"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_guests",
      description: "修改特邀嘉宾面板的标题、位置、尺寸、样式、显示模式和人员列表。",
      parameters: updateParameters("guests"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_text",
      description: "修改指定文本元素的内容、位置、字号、颜色、对齐和可见性。id 必须来自 inspect_project。",
      parameters: objectParameters("文本元素与补丁。", {
        id: { type: "string" },
        patch: patchParameters("text"),
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
        patch: patchParameters("asset"),
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
      description: "用与画布一致的分组、测量和求解器生成布局。scopeIds 限定范围；锁定框保持。不可行则不落地并返回原因。全图重排可能覆盖未锁定手工位置。",
      parameters: objectParameters("自动排版选项。", {
        mode: { type: "string", enum: ["quadrant", "radial", "right-stack", "grid"] },
        scopeIds,
        goal: { type: "string", enum: ["balanced", "readable", "map-clear"] },
        preservePositions: { type: "boolean", description: "保留已保存位置；显式锁定始终生效。" },
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
      name: "inspect_scene",
      description: "读取真实展示框 ID、实际解析样式、尺寸、位置和锁定状态；不返回整份姓名名单。",
      parameters: objectParameters("查询全部或指定展示框。", { scopeIds }),
    },
  },
  {
    type: "function",
    function: {
      name: "list_card_styles",
      description: "列出可用展示框外观模板的真实 ID 与中文说明；应用前先查询，禁止编造模板。",
      parameters: objectParameters("无需参数。", {}),
    },
  },
  {
    type: "function",
    function: {
      name: "apply_card_style",
      description: "应用展示框外观，默认保留分组、字段和位置。只有用户明确要求改变分组/布局时使用 visual-and-layout，且不能局部使用。",
      parameters: objectParameters("模板与作用范围。", { templateId: { type: "string" }, scopeIds, mode: { type: "string", enum: ["visual", "visual-and-layout"] } }, ["templateId"]),
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
export const READ_ONLY_TOOLS = READ_ONLY_AGENT_TOOLS;
export const WRITE_TOOLS = new Set(
  ALL_TOOL_NAMES.filter((name) => !READ_ONLY_TOOLS.has(name) && name !== "finish"),
);
