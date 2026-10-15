import type { AgentToolCall } from "./agent-risk";
import { isSceneDomain, validateScenePatch, type SceneDomain } from "./scene-capabilities";

export const READ_ONLY_AGENT_TOOLS = new Set(["inspect_project", "inspect_scene", "describe_capability", "check_health", "find_assets", "list_card_styles"]);
/** The allow-list is shared with the browser replay path; a model response must not invent a tool name. */
export const AGENT_TOOL_NAMES = new Set([
  "inspect_project", "inspect_scene", "describe_capability", "check_health", "find_assets", "list_card_styles",
  "update_canvas", "update_map", "update_province", "update_cards", "update_guests", "update_text", "update_asset",
  "set_data_view", "auto_layout", "manage_students", "apply_card_style", "finish",
]);
export function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
export function agentToolPatch(call: AgentToolCall): { domain: SceneDomain; patch: Record<string, unknown> } | null {
  const domain = call.name.slice("update_".length);
  if (!call.name.startsWith("update_") || !isSceneDomain(domain)) return null;
  const { scopeIds: _scopeIds, ...direct } = call.arguments;
  const value = call.arguments.patch ?? direct;
  return record(value) ? { domain, patch: value } : null;
}
export function validScopeIds(value: unknown): value is string[] { return Array.isArray(value) && value.length > 0 && value.length <= 200 && value.every(id => typeof id === "string" && id.trim().length > 0 && id.length <= 256); }

/** Called on both sides of transport, and again before replaying a persisted proposal. */
export function validateAgentCall(call: AgentToolCall): Record<string, unknown> | null {
  const args = call.arguments;
  const invalid = (message: string) => ({ ok: false, code: "TOOL_ARGUMENTS_INVALID", tool: call.name, message });
  if (!record(args)) return invalid("工具参数必须是对象");
  if (!AGENT_TOOL_NAMES.has(call.name)) return invalid("未知工具；只能调用已注册的场景工具。");
  const allowed: Record<string, string[]> = {
    inspect_project: ["path"], inspect_scene: ["scopeIds"], describe_capability: ["domain"], check_health: ["scopeIds"], find_assets: ["province", "keyword"], list_card_styles: [],
    auto_layout: ["mode", "scopeIds", "goal", "preservePositions"], apply_card_style: ["templateId", "scopeIds", "mode"], set_data_view: ["view"], manage_students: ["action", "studentId", "name", "fields"], finish: ["summary", "lostManualLayout"],
  };
  const legalArgs = allowed[call.name] ?? (args.patch !== undefined ? ["patch", ...(call.name === "update_cards" ? ["scopeIds"] : []), ...(call.name === "update_province" ? ["province"] : []), ...(["update_text", "update_asset"].includes(call.name) ? ["id"] : [])] : undefined);
  const unknownArgs = legalArgs ? Object.keys(args).filter(key => !legalArgs.includes(key)) : [];
  if (unknownArgs.length) return { ...invalid("存在未知工具参数；不会忽略可能影响范围的参数。"), unknownProps: unknownArgs };
  if (args.scopeIds !== undefined && !validScopeIds(args.scopeIds)) return invalid("scopeIds 必须为非空的展示框 ID 数组");
  if (call.name.startsWith("update_")) {
    const target = agentToolPatch(call);
    if (!target) return invalid("patch 必须是对象且场景域必须存在");
    if (["update_text", "update_asset"].includes(call.name) && (typeof args.id !== "string" || !args.id)) return invalid("必须指定真实目标 id");
    if (call.name === "update_province" && (typeof args.province !== "string" || !args.province)) return invalid("必须指定省份");
    if (["update_text", "update_asset", "update_province"].includes(call.name) && !record(args.patch)) return invalid("必须指定 patch 对象");
    const checked = validateScenePatch(target.domain, target.patch);
    if (!checked.ok) return { ok: false, code: "PATCH_REJECTED", ...checked.error };
  }
  if (call.name === "inspect_project" && (typeof args.path !== "string" || !args.path.trim())) return invalid("path 必须是非空路径");
  if (call.name === "describe_capability" && (typeof args.domain !== "string" || !isSceneDomain(args.domain))) return invalid("未知场景域");
  if (call.name === "find_assets" && [args.province, args.keyword].some(value => value !== undefined && typeof value !== "string")) return invalid("素材筛选必须是字符串");
  if (call.name === "auto_layout") {
    if (args.mode !== undefined && !["quadrant", "radial", "right-stack", "grid"].includes(String(args.mode))) return invalid("未知排布模式");
    if (args.goal !== undefined && !["balanced", "readable", "map-clear"].includes(String(args.goal))) return invalid("未知排布目标");
    if (args.preservePositions !== undefined && typeof args.preservePositions !== "boolean") return invalid("preservePositions 必须是布尔值");
  }
  if (call.name === "apply_card_style") {
    if (typeof args.templateId !== "string" || !args.templateId) return invalid("必须指定已有模板 templateId");
    if (args.mode !== undefined && !["visual", "visual-and-layout"].includes(String(args.mode))) return invalid("未知模板作用方式");
    if (args.mode === "visual-and-layout" && args.scopeIds !== undefined) return invalid("局部外观不能改变全图分组和布局策略");
  }
  if (call.name === "set_data_view" && !["province", "pins", "heat", "city", "university"].includes(String(args.view))) return invalid("未知数据视图");
  if (call.name === "manage_students") {
    if (!["hide", "show", "remove_duplicate", "update_fact"].includes(String(args.action))) return invalid("未知名单操作");
    if (args.action === "update_fact") {
      if (!record(args.fields) || !Object.keys(args.fields).length) return invalid("fields 必须是非空对象");
      const unknownProps = Object.keys(args.fields).filter(key => !["name", "university", "city"].includes(key));
      if (unknownProps.length) return { ...invalid("update_fact 只允许修改 name、university、city"), unknownProps, allowedProps: ["name", "university", "city"] };
      if (Object.values(args.fields).some(value => typeof value !== "string" || !value.trim() || value.trim().length > 200)) return invalid("事实字段必须是非空且不超过 200 字符的字符串");
    }
  }
  return null;
}
