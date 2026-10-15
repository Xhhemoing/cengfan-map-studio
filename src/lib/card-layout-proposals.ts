import type { CardLayoutMode, CardPlacement } from "./card-layout";
import { solveConstrainedCardLayout, type ConstrainedLayoutStatus } from "./card-layout-constraints";
import { getCardPositionPolicy, getCardPositionSource, getCardScopeKey } from "./card-settings-scope";
import { fingerprintProject } from "./project-digest";
import type { ProjectDocument, ProjectTransaction } from "./project-document";
import { createId } from "./ids";
import type { UserFont } from "./fonts";
import { createSceneTextMeasurement, getSceneTextMeasurer } from "./scene-text-measurement";
import { buildResolvedSceneInput, createResolvedSceneSnapshot, resolveProjectScene, type ResolvedProjectScene } from "./resolved-scene";

export type CardLayoutGoal = "balanced" | "readable" | "map-clear";
export interface CardLayoutProposalRequest {
  goal: CardLayoutGoal;
  scopeIds?: string[];
  preserveManual?: boolean;
  mode?: CardLayoutMode;
  /** A serializable, already measured scene from the visible canvas. */
  baseScene?: ResolvedProjectScene;
  userFonts?: UserFont[];
}
export interface CardLayoutProposalMetrics {
  movedCount: number;
  overlapCount: number;
  outOfBoundsCount: number;
  connectorConflicts: number;
  minFontSize: number;
  totalMovement: number;
}
export interface CardLayoutProposal {
  id: string;
  baseRevision: string;
  title: string;
  goal: CardLayoutGoal;
  status: ConstrainedLayoutStatus;
  explanation: string;
  project: ProjectDocument;
  metrics: CardLayoutProposalMetrics;
  previousMetrics: CardLayoutProposalMetrics;
  movedIds: string[];
  targetIds: string[];
  diagnostics: ResolvedProjectScene["diagnostics"];
  measurementStatus: ResolvedProjectScene["measurementStatus"];
  fontRevision?: number;
}

function overlap(a: CardPlacement, b: CardPlacement) {
  return a.x < b.x + b.width - .001 && a.x + a.width > b.x + .001
    && a.y < b.y + b.height - .001 && a.y + a.height > b.y + .001;
}

export function measureLayoutProposal(scene: ResolvedProjectScene, previous?: ResolvedProjectScene, fallbackFontSize = 12): CardLayoutProposalMetrics {
  const placements = scene.cards.map((card) => card.placement);
  const before = new Map(previous?.cards.map((card) => [card.group.key, card.placement]));
  let overlapCount = 0;
  for (let index = 0; index < placements.length; index += 1) {
    for (let other = index + 1; other < placements.length; other += 1) if (overlap(placements[index]!, placements[other]!)) overlapCount += 1;
  }
  const distances = placements.map((card) => {
    const old = before.get(card.id);
    return old ? Math.hypot(card.x - old.x, card.y - old.y) : 0;
  });
  const fontSizes = scene.cards.flatMap((card) => {
    const settings = card.resolvedSettings;
    if (!settings) return [fallbackFontSize];
    return settings.visibleFields.map((field) => settings.fieldTypography?.[field]?.fontSize ?? settings.fontSize);
  });
  return {
    movedCount: distances.filter((distance) => distance > .001).length,
    totalMovement: distances.reduce((sum, value) => sum + value, 0),
    overlapCount,
    outOfBoundsCount: placements.filter((card) => card.x < 0 || card.y < 0 || card.x + card.width > scene.bounds.width || card.y + card.height > scene.bounds.height).length,
    connectorConflicts: scene.diagnostics.filter((issue) => issue.kind === "connector-conflict").length,
    minFontSize: fontSizes.length ? Math.min(...fontSizes) : 0,
  };
}

function proposalProject(project: ProjectDocument, placements: CardPlacement[], locked: Set<string>, mode: CardLayoutMode, avoidMap: boolean): ProjectDocument {
  const positions = { ...project.cards.positions };
  const positionSources = { ...project.cards.positionSources };
  const positionPolicies = { ...project.cards.positionPolicies };
  for (const placement of placements) {
    positions[placement.id] = { x: placement.x, y: placement.y };
    if (!locked.has(placement.id)) {
      const key = getCardScopeKey(project.cards, placement.id);
      positionSources[key] = "auto";
      positionPolicies[key] = "auto";
    }
  }
  return { ...project, cards: { ...project.cards, positions, positionSources, positionPolicies, layoutMode: mode, ...(avoidMap ? { allowMapOverlap: false } : {}) } };
}

/** All candidates use the same content and hard constraints. Goals rank real geometry,
 * never remove roster fields or make text smaller to manufacture a feasible result. */
export function createCardLayoutProposals(project: ProjectDocument, request: CardLayoutProposalRequest): CardLayoutProposal[] {
  const baseRevision = fingerprintProject(project);
  const text = createSceneTextMeasurement(request.userFonts);
  const prepared = request.baseScene?.revision === baseRevision ? undefined : buildResolvedSceneInput(project, text.options);
  if (prepared) { prepared.measurementStatus = text.getStatus(); prepared.fontRevision = text.fontRevision; }
  const base = request.baseScene?.revision === baseRevision ? request.baseScene : resolveProjectScene(project, { input: prepared });
  const ids = base.cards.map((card) => card.group.key);
  if (ids.length === 0) return [];
  const scopeIds = request.scopeIds ? [...new Set(request.scopeIds)].filter((id) => ids.includes(id)) : undefined;
  if (request.scopeIds && scopeIds?.length === 0) throw new Error("所选展示框已不属于当前分组，请重新选择。");
  const previousPositions = Object.fromEntries(base.cards.map((card) => [card.group.key, { x: card.placement.x, y: card.placement.y }]));
  const locked = new Set(ids.filter((id) => {
    const policy = project.cards.positionPolicies?.[getCardScopeKey(project.cards, id)];
    return getCardPositionPolicy(project.cards, id) === "locked" || policy === "preserve"
      || (request.preserveManual !== false && getCardPositionSource(project.cards, id) !== "auto");
  }));
  const protectedIds = new Set(locked);
  if (scopeIds) ids.filter((id) => !scopeIds.includes(id)).forEach((id) => locked.add(id));
  const previousMetrics = measureLayoutProposal(base, undefined, project.cards.fontSize);
  const currentMode = project.cards.layoutMode ?? "quadrant";
  const modes: Array<{ mode: CardLayoutMode; title: string; preserve: boolean }> = request.mode ? [
    { mode: request.mode, title: "按指定方式整理", preserve: false },
  ] : [
    { mode: currentMode, title: "尽量保持原有位置", preserve: true },
    { mode: request.goal === "map-clear" ? "radial" : "quadrant", title: request.goal === "readable" ? "正文避让优先" : "均衡分配空间", preserve: false },
    { mode: "grid", title: "沿边缘整齐排列", preserve: false },
  ];
  const seen = new Set<string>();
  const proposals: CardLayoutProposal[] = [];
  for (const variant of modes) {
    const avoidMap = request.goal === "map-clear";
    const candidate = { ...project, cards: { ...project.cards, layoutMode: variant.mode, ...(avoidMap ? { allowMapOverlap: false } : {}) } };
    const compiled = buildResolvedSceneInput(candidate, { userFonts: request.userFonts });
    // These variants change only placement, so preserve the actual canvas text measurements.
    const input = { ...compiled, preparedCards: base.input.preparedCards, measurementStatus: base.measurementStatus };
    const cards = input.preparedCards.map(({ group, anchorX, anchorY, width, height }) => ({ id: group.key, anchorX, anchorY, width, height }));
    const fontConflict = base.cards.find((card) => {
      const settings = card.resolvedSettings ?? project.cards;
      return settings.visibleFields.some((field) => (settings.fieldTypography?.[field]?.fontSize ?? settings.fontSize) < (settings.minFontSize ?? 8));
    });
    const result = fontConflict ? {
      status: "proven-infeasible" as const, placements: base.cards.map((card) => card.placement), movedIds: [],
      diagnostics: [{ id: fontConflict.group.key, kind: "unreadable-text" as const, severity: "warning" as const, detail: "当前文字字号低于设置的下限，请先增大字号或明确调整下限；整理位置不会擅自改变字体。" }],
    } : solveConstrainedCardLayout(cards, input.bounds, input.options, { previousPositions, lockedIds: [...locked], scopeIds, preservePositions: variant.preserve });
    const completePlacements = result.placements.length === cards.length ? result.placements : base.cards.map((card) => card.placement);
    const next = proposalProject(project, completePlacements, protectedIds, scopeIds ? currentMode : variant.mode, avoidMap && !scopeIds);
    const scene = createResolvedSceneSnapshot(next, input, completePlacements, result.status === "feasible" ? "solved" : "fallback");
    const signature = JSON.stringify([result.status, completePlacements.map((card) => [card.id, Math.round(card.x * 100), Math.round(card.y * 100)]), avoidMap]);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const metrics = measureLayoutProposal(scene, base, project.cards.fontSize);
    const explanation = result.status === "feasible"
      ? `${scopeIds ? "选区外保持原位；" : ""}${locked.size} 个受保护框保持原位；字号与名单内容保持。${avoidMap ? "展示框避开地图主体。" : ""}`
      : result.diagnostics.map((issue) => issue.detail).join("；");
    proposals.push({
      id: `layout-${proposals.length + 1}`, baseRevision, title: variant.title, goal: request.goal,
      status: result.status, project: next, explanation, metrics, previousMetrics,
      movedIds: result.movedIds, targetIds: scopeIds ?? ids,
      diagnostics: [...result.diagnostics, ...scene.diagnostics], measurementStatus: scene.measurementStatus,
      ...(base.fontRevision !== undefined ? { fontRevision: base.fontRevision } : {}),
    });
  }
  return proposals.sort((left, right) => {
    if (left.status !== right.status) return left.status === "feasible" ? -1 : right.status === "feasible" ? 1 : 0;
    if (request.goal === "balanced") return left.metrics.connectorConflicts - right.metrics.connectorConflicts || left.metrics.totalMovement - right.metrics.totalMovement;
    return left.metrics.overlapCount - right.metrics.overlapCount || left.metrics.outOfBoundsCount - right.metrics.outOfBoundsCount || left.metrics.totalMovement - right.metrics.totalMovement;
  });
}

/** Rechecking the document on actual transaction application also protects collaboration races. */
export function createCardLayoutProposalTransaction(proposal: CardLayoutProposal, report?: (applied: boolean) => void): ProjectTransaction {
  return {
    id: createId("layout-proposal"), label: `智能整理：${proposal.title}`, source: "manual",
    apply: (current) => {
      const valid = proposal.status === "feasible" && fingerprintProject(current) === proposal.baseRevision
        && (proposal.fontRevision === undefined || proposal.fontRevision === getSceneTextMeasurer().getVersion());
      if (report) queueMicrotask(() => report(valid));
      return valid ? { ...current, cards: proposal.project.cards } : current;
    },
  };
}
