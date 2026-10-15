import { updateSceneTarget, type SceneSelection } from "./scene-document";
import { applyDataViewChange } from "./catalog-usage";
import { applyCardTemplate, getCardTemplateById, listCardTemplates } from "./card-templates";
import { getCardScopeKey, normalizeCardStyleOverride, patchCardStyles, resolveCardSettings } from "./card-settings-scope";
import { buildResolvedSceneInput } from "./resolved-scene";
import { measureLayoutProposal } from "./card-layout-proposals";
import { fingerprintProject } from "./project-digest";
import type { ProjectDocument } from "./project-document";
import type { AgentToolCall } from "./agent-risk";
import { agentToolPatch } from "./agent-tool-contract";
import { SCENE_CAPABILITIES, SCENE_DOMAIN_PROPS, type SceneDomain } from "./scene-capabilities";
import { inspectProjectValue, describeActualPatch, patchFeedback, type AgentValueDiff } from "./agent-scene-inspection";
import { missingCardScope, resolveAgentScene, type AgentToolExecution } from "./agent-layout-tools";
import type { AgentTaskContext } from "./agent-task-constraints";

function targetFor(call: AgentToolCall): SceneSelection | null {
  const type = call.name.slice("update_".length);
  if (["canvas", "map", "cards", "guests"].includes(type)) return { type } as SceneSelection;
  if (type === "province") return { type, province: String(call.arguments.province) };
  if (type === "text" || type === "asset") return { type, id: String(call.arguments.id) };
  return null;
}
function targetValue(project: ProjectDocument, target: SceneSelection): Record<string, unknown> | undefined {
  if (target.type === "text") return project.textElements.find(item => item.id === target.id) as unknown as Record<string, unknown> | undefined;
  if (target.type === "asset") return project.assetElements.find(item => item.id === target.id) as unknown as Record<string, unknown> | undefined;
  if (target.type === "province") return (project.map.provinceStyles?.[target.province] ?? {}) as Record<string, unknown>;
  return project[target.type] as unknown as Record<string, unknown>;
}
function mergeNestedStyle(before: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...patch };
  for (const key of ["fieldFonts", "fieldTypography", "expressionTemplates", "provinceLabelTypography", "titleTypography", "peopleTypography", "heatScale"]) {
    if (patch[key] && typeof patch[key] === "object" && !Array.isArray(patch[key])) next[key] = { ...(before[key] as object ?? {}), ...patch[key] as object };
  }
  if (patch.fieldTypography && typeof patch.fieldTypography === "object") next.fieldTypography = Object.fromEntries(Object.entries(next.fieldTypography as object).map(([field, style]) => [field, { ...((before.fieldTypography as Record<string, object> | undefined)?.[field] ?? {}), ...style as object }]));
  return next;
}

export function executeAgentSceneTool(project: ProjectDocument, call: AgentToolCall, context: AgentTaskContext): AgentToolExecution | null {
  const args = call.arguments;
  if (call.name === "inspect_project") return { project, payload: inspectProjectValue(project, String(args.path)) };
  if (call.name === "describe_capability") return { project, payload: { ok: true, domain: args.domain, properties: SCENE_DOMAIN_PROPS[args.domain as SceneDomain], schema: SCENE_CAPABILITIES[args.domain as SceneDomain] } };
  if (call.name === "list_card_styles") return { project, payload: { ok: true, styles: listCardTemplates().map(({ id, name, description, category }) => ({ id, name, description, category })), modes: ["visual", "visual-and-layout"] } };
  const target = call.name === "apply_card_style" ? { type: "cards" as const } : targetFor(call);
  if (!target) return null;
  const before = targetValue(project, target);
  if (!before) return { project, payload: { ok: false, code: "SCENE_TARGET_MISSING", target } };
  let patch = agentToolPatch(call)?.patch ?? {};
  if (call.name === "apply_card_style") {
    if (!getCardTemplateById(String(args.templateId))) return { project, payload: { ok: false, code: "STYLE_NOT_FOUND", message: "模板不存在，请先列出可用样式。" } };
    patch = applyCardTemplate(String(args.templateId), project.cards, args.mode === "visual-and-layout" ? "visual-and-layout" : "visual") as Record<string, unknown>;
  }
  const scopeIds = target.type === "cards" ? args.scopeIds as string[] | undefined : undefined;
  const missing = missingCardScope(project, scopeIds, context);
  if (missing.length) return { project, payload: { ok: false, code: "SCENE_TARGET_MISSING", missingIds: missing } };
  let next: ProjectDocument;
  let diff: AgentValueDiff[];
  let ignoredFields: string[] = [];
  if (scopeIds) {
    const supported = normalizeCardStyleOverride(patch);
    const unsupported = Object.keys(patch).filter(key => !(key in supported));
    if (unsupported.length && call.name !== "apply_card_style") return { project, payload: { ok: false, code: "SCOPED_PROPERTY_UNSUPPORTED", unsupportedProps: unsupported, message: "这些属性属于整组布局；局部操作不会静默修改全局。" } };
    next = { ...project, cards: patchCardStyles(project.cards, scopeIds, supported) };
    ignoredFields = unsupported;
    const requested = Object.fromEntries(Object.keys(supported).map(key => [key, patch[key]]));
    diff = scopeIds.flatMap(id => describeActualPatch(resolveCardSettings(project.cards, id) as unknown as Record<string, unknown>, resolveCardSettings(next.cards, id) as unknown as Record<string, unknown>, requested, `cards[${id}]`));
  } else {
    const base = call.name === "apply_card_style" && args.mode === "visual-and-layout" && ["province", "city", "university"].includes(String(patch.grouping))
      ? applyDataViewChange(project, patch.grouping as "province" | "city" | "university") : project;
    const scene = updateSceneTarget(base, target, mergeNestedStyle(before, patch));
    const domain = target.type === "province" ? "map" : target.type === "text" ? "textElements" : target.type === "asset" ? "assetElements" : target.type;
    next = { ...base, [domain]: scene[domain] };
    diff = describeActualPatch(before, targetValue(next, target)!, patch, target.type === "text" || target.type === "asset" ? `${target.type}[${target.id}]` : target.type);
  }
  // A scoped style must not indirectly move neighboring cards when its dimensions change.
  const geometryChanged = target.type === "cards" && buildResolvedSceneInput(project, { userFonts: context.userFonts }).key !== buildResolvedSceneInput(next, { userFonts: context.userFonts }).key;
  if (geometryChanged && (scopeIds || context.taskBrief?.preserve.includes("positions"))) {
    const frozen = Object.fromEntries(resolveAgentScene(project, context).cards.map(card => [card.group.key, { x: card.placement.x, y: card.placement.y }]));
    const positionSources = { ...next.cards.positionSources };
    for (const id of Object.keys(frozen)) {
      const key = getCardScopeKey(next.cards, id);
      if (!positionSources[key] || positionSources[key] === "auto") positionSources[key] = "frozen";
    }
    next = { ...next, cards: { ...next.cards, positions: { ...frozen, ...project.cards.positions }, positionSources } };
  }
  const feedback: ReturnType<typeof patchFeedback> & { ignoredFields: string[] } = { ...patchFeedback(next, diff), ignoredFields };
  if (fingerprintProject(project) === fingerprintProject(next) || feedback.noop === true) return { project, payload: { ok: true, target, scopeIds, ...feedback, noop: true } };
  const beforeScene = resolveAgentScene(project, context);
  const afterScene = resolveAgentScene(next, context);
  return { project: next, payload: { ok: true, target, scopeIds, ...feedback, metrics: { before: measureLayoutProposal(beforeScene), after: measureLayoutProposal(afterScene, beforeScene) }, issues: afterScene.diagnostics, measurementStatus: afterScene.measurementStatus, layoutStatus: afterScene.layoutStatus } };
}
