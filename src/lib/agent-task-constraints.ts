import type { UserFont } from "./fonts";
import type { ResolvedProjectScene } from "./resolved-scene";
import type { AgentToolCall } from "./agent-risk";
import type { AgentTaskBrief } from "./agent-task-brief";
import type { ProjectDocument } from "./project-document";
import type { SceneSelection } from "./scene-document";
import { READ_ONLY_AGENT_TOOLS, agentToolPatch } from "./agent-tool-contract";

export interface AgentTaskContext { taskBrief?: AgentTaskBrief; selection?: SceneSelection | null; stage?: string; userFonts?: UserFont[]; scene?: ResolvedProjectScene | null }
export interface AgentConstraintFailure { ok: false; code: "SCOPE_REQUIRED" | "SCOPE_CONFLICT" | "CONSTRAINT_CONFLICT"; message: string }
const failure = (code: AgentConstraintFailure["code"], message: string): AgentConstraintFailure => ({ ok: false, code, message });

/** Enforce UI-authored constraints even if a model omits scope or asks to override them. */
export function constrainAgentCall(project: ProjectDocument, call: AgentToolCall, context: AgentTaskContext): AgentToolCall | AgentConstraintFailure {
  if (READ_ONLY_AGENT_TOOLS.has(call.name)) return call;
  const brief = context.taskBrief;
  if (!brief) return call;
  if (brief.preserve.includes("data") && call.name === "manage_students") return failure("CONSTRAINT_CONFLICT", "当前任务要求保留名单内容，不能执行名单修改。");
  if (brief.preserve.includes("map") && ["update_map", "update_province"].includes(call.name)) return failure("CONSTRAINT_CONFLICT", "当前任务要求保留地图。");
  if (brief.preserve.includes("positions") && call.name === "auto_layout") return failure("CONSTRAINT_CONFLICT", "当前任务要求保留展示框位置，不能重新排布。");
  if (brief.preserve.includes("style") && (call.name === "apply_card_style" || call.name === "update_cards" && Object.keys(agentToolPatch(call)?.patch ?? {}).some(key => !["x", "y", "layoutMode", "autoBalance", "allowMapOverlap"].includes(key)))) return failure("CONSTRAINT_CONFLICT", "当前任务要求保留展示框外观。");
  const selection = brief.selection ?? context.selection;
  const selectionScope = brief.scope === "selection" || brief.preserve.includes("other-cards");
  if (!selectionScope) return call;
  if (!selection) return failure("SCOPE_REQUIRED", "尚未确定作用对象，请先选择目标；不会扩大成全图修改。");
  const args = { ...call.arguments };
  if (selection.type === "cards") {
    if (!["update_cards", "auto_layout", "apply_card_style"].includes(call.name)) return failure("SCOPE_CONFLICT", "当前作用范围仅为展示框。");
    if (args.mode === "visual-and-layout") return failure("SCOPE_CONFLICT", "选区任务不能改变全局分组或布局策略。");
    const ids = "ids" in selection && Array.isArray(selection.ids) ? selection.ids as string[] : undefined;
    if ("scopeGrouping" in selection && selection.scopeGrouping && selection.scopeGrouping !== project.cards.grouping) return failure("SCOPE_CONFLICT", "分组已变化，请重新选择展示框。");
    if (ids) {
      if (!ids.length) return failure("SCOPE_REQUIRED", "当前选区为空。");
      if (Array.isArray(args.scopeIds) && args.scopeIds.some(id => !ids.includes(String(id)))) return failure("SCOPE_CONFLICT", "工具请求包含当前选区外的展示框。");
      args.scopeIds = args.scopeIds ?? ids;
    } else if (brief.preserve.includes("other-cards")) return failure("SCOPE_REQUIRED", "请指定具体展示框，再保留选区外对象。");
  } else {
    if (call.name !== `update_${selection.type}`) return failure("SCOPE_CONFLICT", "此操作不属于当前选中对象。");
    if ((selection.type === "text" || selection.type === "asset") && args.id !== selection.id) return failure("SCOPE_CONFLICT", "此操作指向另一个对象。");
    if (selection.type === "province" && args.province !== selection.province) return failure("SCOPE_CONFLICT", "此操作指向另一个省份。");
  }
  return { ...call, arguments: args };
}

export function unchangedTaskFacts(before: ProjectDocument, after: ProjectDocument, context: AgentTaskContext): AgentConstraintFailure | null {
  const preserves = context.taskBrief?.preserve ?? [];
  for (const [constraint, left, right] of [["data", before.students, after.students], ["map", before.map, after.map]] as const) {
    if (preserves.includes(constraint) && JSON.stringify(left) !== JSON.stringify(right)) return failure("CONSTRAINT_CONFLICT", constraint === "data" ? "候选改变了要求保留的名单，本次操作未执行。" : "候选改变了要求保留的地图，本次操作未执行。");
  }
  return null;
}
