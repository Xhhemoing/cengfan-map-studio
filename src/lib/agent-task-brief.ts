import type { SceneSelection } from "./scene-document";

export const TASK_GOALS = { balanced: "整体更均衡", readability: "提高文字可读性", compact: "紧凑利用空间", style: "调整展示框外观", inspect: "检查排版问题", custom: "按当前需求调整" } as const;
export const TASK_PRESERVES = { data: "保留名单内容", map: "保留地图", positions: "保留展示框位置", "other-cards": "保留选区外展示框", style: "保留展示框外观" } as const;

/** A bounded, factual task contract. Raw prompts and student names stay out of durable history. */
export interface AgentTaskBrief {
  goal: keyof typeof TASK_GOALS;
  scope: "project" | "selection";
  selection: SceneSelection | null;
  preserve: Array<keyof typeof TASK_PRESERVES>;
}

export function createTaskBrief(): AgentTaskBrief {
  return { goal: "custom", scope: "project", selection: null, preserve: [] };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readSelection(value: unknown): SceneSelection | null | undefined {
  if (value === null) return null;
  if (!record(value)) return undefined;
  if (["canvas", "map", "guests"].includes(String(value.type))) return { type: value.type } as SceneSelection;
  if (value.type === "cards") {
    if (value.ids !== undefined && (!Array.isArray(value.ids) || value.ids.length > 200 || !value.ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 256))) return undefined;
    if (value.scopeGrouping !== undefined && !["province", "city", "university"].includes(String(value.scopeGrouping))) return undefined;
    return { type: "cards", ...(Array.isArray(value.ids) ? { ids: [...value.ids] } : {}), ...(value.scopeGrouping !== undefined ? { scopeGrouping: value.scopeGrouping } : {}) } as SceneSelection;
  }
  if (value.type === "province" && typeof value.province === "string" && value.province.length <= 100) return { type: "province", province: value.province };
  if ((value.type === "text" || value.type === "asset") && typeof value.id === "string" && value.id.length <= 256) return { type: value.type, id: value.id };
  return undefined;
}

export function parseTaskBrief(value: unknown): AgentTaskBrief | null {
  if (!record(value) || !Object.hasOwn(TASK_GOALS, String(value.goal)) || (value.scope !== "project" && value.scope !== "selection") || !Array.isArray(value.preserve) || value.preserve.length > 5 || !value.preserve.every((item) => typeof item === "string" && Object.hasOwn(TASK_PRESERVES, item))) return null;
  const selection = readSelection(value.selection);
  if (selection === undefined) return null;
  return { goal: value.goal as AgentTaskBrief["goal"], scope: value.scope, selection, preserve: [...new Set(value.preserve)] as AgentTaskBrief["preserve"] };
}

export function taskSelectionLabel(selection: SceneSelection | null): string {
  if (!selection) return "尚未指定对象";
  if (selection.type === "cards") {
    const ids = "ids" in selection && Array.isArray(selection.ids) ? selection.ids : [];
    return ids.length ? `${ids.length} 个展示框` : "全部展示框";
  }
  if (selection.type === "province") return `${selection.province} 省区`;
  return ({ canvas: "画布", map: "地图", guests: "嘉宾板块", text: "所选文字", asset: "所选素材" } as const)[selection.type];
}

/** IDs containing roster facts cannot leak through the otherwise enum-only brief. Missing scope never broadens. */
export function redactTaskBrief(brief: AgentTaskBrief | undefined, facts: readonly string[]): AgentTaskBrief | undefined {
  const parsed = parseTaskBrief(brief);
  if (!parsed) return undefined;
  if (parsed.selection && facts.some((fact) => fact && JSON.stringify(parsed.selection).includes(fact))) return { ...parsed, selection: null };
  return parsed;
}
