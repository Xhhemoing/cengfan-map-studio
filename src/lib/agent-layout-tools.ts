import { createCardLayoutProposals, measureLayoutProposal, type CardLayoutGoal } from "./card-layout-proposals";
import { getCardPositionPolicy, getCardPositionSource, resolveCardSettings } from "./card-settings-scope";
import { resolveProjectScene } from "./resolved-scene";
import type { ProjectDocument } from "./project-document";
import type { AgentTaskContext } from "./agent-task-constraints";
import type { AgentToolCall } from "./agent-risk";
import { SCENE_DOMAIN_PROPS } from "./scene-capabilities";
import { safeAgentValue } from "./agent-scene-inspection";
import { fingerprintProject } from "./project-digest";

export interface AgentToolExecution { project: ProjectDocument; payload: Record<string, unknown> }
export function resolveAgentScene(project: ProjectDocument, context: AgentTaskContext) {
  return resolveProjectScene(project, { userFonts: context.userFonts, baseScene: context.scene ?? undefined });
}
export function missingCardScope(project: ProjectDocument, ids: readonly string[] | undefined, context: AgentTaskContext = {}): string[] {
  if (!ids) return [];
  const existing = new Set(resolveAgentScene(project, context).cards.map(card => card.group.key));
  return ids.filter(id => !existing.has(id));
}
export function executeAgentLayoutTool(project: ProjectDocument, call: AgentToolCall, context: AgentTaskContext): AgentToolExecution | null {
  if (!["inspect_scene", "check_health", "auto_layout"].includes(call.name)) return null;
  const args = call.arguments;
  const scopeIds = args.scopeIds as string[] | undefined;
  const base = resolveAgentScene(project, context);
  const missing = scopeIds?.filter(id => !base.cards.some(card => card.group.key === id)) ?? [];
  if (missing.length) return { project, payload: { ok: false, code: "SCENE_TARGET_MISSING", missingIds: missing, message: "部分展示框已不属于当前分组，请重新选择；不会扩大作用范围。" } };
  if (call.name === "inspect_scene") return { project, payload: {
    ok: true, revision: base.revision, measurementStatus: base.measurementStatus, layoutStatus: base.layoutStatus,
    cards: base.cards.filter(card => !scopeIds || scopeIds.includes(card.group.key)).map(card => {
      const style = resolveCardSettings(project.cards, card.group.key);
      return { id: card.group.key, province: card.province, width: card.width, height: card.height, placement: card.placement, positionPolicy: getCardPositionPolicy(project.cards, card.group.key), positionSource: getCardPositionSource(project.cards, card.group.key), style: safeAgentValue(Object.fromEntries(SCENE_DOMAIN_PROPS.cards.map(key => [key, style[key as keyof typeof style]]))) };
    }),
  } };
  if (call.name === "check_health") return { project, payload: {
    ok: true, revision: base.revision, measurementStatus: base.measurementStatus, layoutStatus: base.layoutStatus,
    issues: scopeIds ? base.diagnostics.filter(issue => scopeIds.some(id => issue.id.includes(id))) : base.diagnostics,
    metrics: measureLayoutProposal(base),
  } };
  if (!base.cards.length) return { project, payload: { ok: true, noop: true, placements: [], layoutStatus: "feasible", measurementStatus: base.measurementStatus, message: "没有需要排布的可见展示框。" } };
  const proposals = createCardLayoutProposals(project, { mode: args.mode as ProjectDocument["cards"]["layoutMode"], goal: (args.goal ?? "balanced") as CardLayoutGoal, scopeIds, baseScene: base, userFonts: context.userFonts, preserveManual: args.preservePositions === true });
  const chosen = proposals.find(proposal => proposal.status === "feasible");
  const candidates = proposals.map(({ id, title, status, explanation, metrics }) => ({ id, title, status, explanation, metrics }));
  if (!chosen) return { project, payload: { ok: false, code: "LAYOUT_UNRESOLVED", layoutStatus: proposals[0]?.status ?? "no-candidate-found", candidates, issues: proposals[0]?.diagnostics ?? [], measurementStatus: base.measurementStatus, message: "未找到满足约束的布局，原有位置保持。请调整范围、宽度或画布。" } };
  const after = resolveAgentScene(chosen.project, context);
  const lostManualLayout = chosen.movedIds.some(id => project.cards.positions?.[id] && getCardPositionSource(project.cards, id) !== "auto");
  const diff = chosen.movedIds.map(id => ({ path: `cards.positions.${id}`, before: project.cards.positions?.[id] ?? base.cards.find(card => card.group.key === id)?.placement ?? null, after: chosen.project.cards.positions?.[id], normalized: false }));
  const noop = fingerprintProject(project) === fingerprintProject(chosen.project);
  return { project: noop ? project : chosen.project, payload: { ok: true, noop, revision: after.revision, scopeIds, placements: after.cards.map(card => card.placement), movedIds: chosen.movedIds, lostManualLayout, layoutStatus: chosen.status, measurementStatus: after.measurementStatus, diff, metrics: { before: measureLayoutProposal(base), after: measureLayoutProposal(after, base) }, issues: after.diagnostics, candidates } };
}
