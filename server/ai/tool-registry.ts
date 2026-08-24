import type { ToolDefinition } from "./agent-types";
import { SCENE_DOMAIN_PROPS, type SceneDomain } from "./patch-validator";

export const MAX_TOOL_RESULT_BYTES = 16 * 1024;
export const MAX_HEALTH_ISSUES = 20;
export const MAX_ASSET_RESULTS = 20;
export const MAX_LAYOUT_SAMPLES = 10;
export const MAX_STUDENT_RESULTS = 50;

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

/** 把静态可写属性清单直接写进工具说明，模型无需先 describe_capability 就能选对键。 */
function writableProps(domain: SceneDomain): string {
  return SCENE_DOMAIN_PROPS[domain].join("、");
}

const domainPatchParameters = (domain: SceneDomain, description: string): Record<string, unknown> =>
  patchParameters(`${description} 合法属性名：${writableProps(domain)}。`);

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "inspect_project",
      description: "读取 digest 未覆盖的场景真实值。digest 已给出的值不要重复读取；path 使用点分路径，例如 cards.padding、cards.connectorColor、guests.textColor、textElements.0.fontWeight。",
      parameters: objectParameters("要读取的工程路径。", {
        path: { type: "string", description: "点分路径" },
      }, ["path"]),
    },
  },
  {
    type: "function",
    function: {
      name: "describe_capability",
      description: "可选：查询一个场景域允许修改的属性名（同一清单已写在各 update_* 工具说明里）。domain 取 canvas、map、province、cards、guests、text、asset。",
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
      name: "query_students",
      description: `按省份、城市、院校或姓名检索学生名单（只读，包含匹配）。一次最多返回 ${MAX_STUDENT_RESULTS} 条 {id,name,province,city,university,visibility}，用 offset 翻页，结果里的 total 是命中总数。重名学生会返回多条，请用 id 区分。`,
      parameters: objectParameters("学生筛选条件；全部省略表示返回全部学生的前一页。", {
        province: { type: "string" },
        city: { type: "string" },
        university: { type: "string" },
        name: { type: "string" },
        offset: { type: "number", description: `分页偏移，默认 0，每页 ${MAX_STUDENT_RESULTS} 条` },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "update_canvas",
      description: `修改画布的尺寸、边距、背景和全局行高等设置。可写属性：${writableProps("canvas")}。`,
      parameters: domainPatchParameters("canvas", "属性名到新值的补丁。"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_map",
      description: `修改地图位置、尺寸、缩放、配色、标签、填充和图层设置。可写属性：${writableProps("map")}。`,
      parameters: domainPatchParameters("map", "属性名到新值的补丁；不要写 cards 或 text 的属性。"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_province",
      description: `修改指定省份的样式，province 必须是工程中已存在的省份。可写属性：${writableProps("province")}。appearance 的 src/assetId 只能引用 find_assets 返回的已有素材。`,
      parameters: objectParameters("省份与样式补丁。", {
        province: { type: "string" },
        patch: domainPatchParameters("province", "省份样式补丁。"),
      }, ["province", "patch"]),
    },
  },
  {
    type: "function",
    function: {
      name: "update_cards",
      description: `修改卡片预设、字号、字段、间距、连线和布局模式。可写属性：${writableProps("cards")}。cards.positions 受保护，只能由 auto_layout 修改。`,
      parameters: domainPatchParameters("cards", "卡片设置补丁；禁止包含 positions。"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_guests",
      description: `修改特邀嘉宾面板的标题、位置、尺寸、样式、显示模式和人员列表。可写属性：${writableProps("guests")}。`,
      parameters: domainPatchParameters("guests", "嘉宾面板补丁。"),
    },
  },
  {
    type: "function",
    function: {
      name: "update_text",
      description: `修改指定文本元素的内容、位置、字号、颜色、对齐和可见性。可写属性：${writableProps("text")}。id 必须是 digest.textElements 中已存在的 id。`,
      parameters: objectParameters("文本元素与补丁。", {
        id: { type: "string" },
        patch: domainPatchParameters("text", "文本元素补丁；不能修改 id。"),
      }, ["id", "patch"]),
    },
  },
  {
    type: "function",
    function: {
      name: "update_asset",
      description: `修改指定贴图元素的位置、尺寸、旋转、透明度、层级和可见性。可写属性：${writableProps("asset")}。id 必须是 digest.assetElements 中已存在的 id，不能修改 src 或 id。`,
      parameters: objectParameters("贴图元素与补丁。", {
        id: { type: "string" },
        patch: domainPatchParameters("asset", "贴图元素补丁；不能修改 src 或 id。"),
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
      description: "隐藏、恢复或去重学生；改写姓名/院校/城市事实字段必须高风险确认。studentId 用 query_students 查得，重名时必须用 id。fields 只接受 name、university、city；改 city 时省份由系统按城市自动推导。",
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
  "query_students",
]);
export const WRITE_TOOLS = new Set(
  ALL_TOOL_NAMES.filter((name) => !READ_ONLY_TOOLS.has(name) && name !== "finish"),
);
