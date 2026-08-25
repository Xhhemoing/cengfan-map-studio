import { applyDataViewChange } from "./catalog-usage";
import { solveCardLayout, type CardLayoutInput, type CardLayoutMode } from "./card-layout";
import { listContentLayoutIssues } from "./content-layout-objects";
import type { StudioAsset } from "./assets";
import { duplicateStudentIds } from "./data-duplicate";
import type { AgentToolCall, RiskLevel } from "./agent-risk";
import { buildProjectDigest } from "./project-digest";
import type { ProjectDocument } from "./project-document";
import { updateSceneTarget, type SceneSelection } from "./scene-document";
import type { DataViewId, Student } from "./project-data";
import { buildProvinceSummary } from "./project-data";

export const READ_ONLY_TOOLS = new Set(["inspect_project", "describe_capability", "check_health", "find_assets"]);

export interface AgentToolResult {
  id: string;
  ok: boolean;
  content: string;
}

export interface AgentStep {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: AgentToolResult;
  risk: RiskLevel;
  lostManualLayout?: boolean;
}

type SceneDomain = "canvas" | "map" | "province" | "cards" | "guests" | "text" | "asset";

const SCENE_DOMAIN_PROPS: Record<SceneDomain, readonly string[]> = {
  canvas: ["width", "height", "safeMargin", "backgroundColor", "backgroundImageSrc", "backgroundFit", "backgroundOpacity", "lineHeight"],
  map: ["x", "y", "width", "height", "scale", "zIndex", "opacity", "landColor", "activeColor", "edgeColor", "edgeStyle", "edgeWidth", "showProvinceLabels", "provinceLabelFontId", "provinceLabelTypography", "collapseSouthChinaSea", "fillMode", "heatScale", "emptyProvinceFill", "renderSource", "provinceStyles", "provinceTextureUniformSize"],
  province: ["fill", "textureSrc", "visible", "labelFontId", "appearance"],
  cards: ["preset", "displayFrame", "compactLayout", "x", "y", "maxWidth", "padding", "horizontalPadding", "bottomPadding", "gap", "columns", "background", "opacity", "textColor", "fontSize", "fieldFonts", "fieldTypography", "connectorStyle", "connectorColor", "connectorWidth", "connectorDash", "visibleFields", "noWrapFields", "citySubgroups", "expressionTemplates", "nameFormat", "layoutMode", "autoBalance", "allowMapOverlap", "showProvinceTexture", "showCount", "zIndex"],
  guests: ["title", "x", "y", "width", "padding", "background", "opacity", "textColor", "fontSize", "titleFontId", "peopleFontId", "titleTypography", "peopleTypography", "displayMode", "customText", "visibility", "people"],
  text: ["role", "content", "x", "y", "fontSize", "color", "fontWeight", "fontId", "textAlign", "maxWidth", "visibility"],
  asset: ["assetId", "label", "kind", "province", "x", "y", "width", "height", "rotation", "opacity", "zIndex", "visibility"],
};

const PROTECTED_SCENE_FIELDS: Record<SceneDomain, readonly string[]> = {
  canvas: [], map: [], province: [], cards: ["positions"], guests: [], text: ["id"], asset: ["id", "src"],
};

function validateScenePatch(domain: SceneDomain, patch: Record<string, unknown>): { ok: true } | { ok: false; error: { domain: SceneDomain; unknownProps: string[]; protectedProps: string[]; availableProps: string[] } } {
  const writable = SCENE_DOMAIN_PROPS[domain];
  const protectedFields = PROTECTED_SCENE_FIELDS[domain];
  const keys = Object.keys(patch);
  const unknownProps = keys.filter((key) => !writable.includes(key) && !protectedFields.includes(key));
  const protectedProps = keys.filter((key) => protectedFields.includes(key));
  return unknownProps.length === 0 && protectedProps.length === 0
    ? { ok: true }
    : { ok: false, error: { domain, unknownProps, protectedProps, availableProps: [...writable] } };
}

export function cloneProject(project: ProjectDocument): ProjectDocument {
  const cloned = structuredClone(project) as ProjectDocument;
  cloned.history = { past: [], future: [] };
  return cloned;
}

function readPath(value: unknown, path: string): unknown {
  const tokens = path.match(/[^.[\]]+/g) ?? [];
  let current: unknown = value;
  for (const token of tokens) {
    if (current && typeof current === "object" && token in current) current = (current as Record<string, unknown>)[token];
    else return undefined;
  }
  return current;
}

function sceneTargetForTool(name: string, args: Record<string, unknown>): SceneSelection | null {
  if (name === "update_canvas") return { type: "canvas" };
  if (name === "update_map") return { type: "map" };
  if (name === "update_cards") return { type: "cards" };
  if (name === "update_guests") return { type: "guests" };
  if (name === "update_province") return { type: "province", province: String(args.province ?? "") };
  if (name === "update_text") return { type: "text", id: String(args.id ?? "") };
  if (name === "update_asset") return { type: "asset", id: String(args.id ?? "") };
  return null;
}

function patchForTool(name: string, args: Record<string, unknown>): { domain: SceneDomain; patch: Record<string, unknown> } | null {
  const target = sceneTargetForTool(name, args);
  if (!target) return null;
  const patch = name.startsWith("update_") && ["update_province", "update_text", "update_asset"].includes(name)
    ? (args.patch ?? {})
    : args.patch ?? args;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { domain: target.type, patch: {} };
  return { domain: target.type, patch: patch as Record<string, unknown> };
}

function findStudent(project: ProjectDocument, args: Record<string, unknown>): Student | undefined {
  const studentId = typeof args.studentId === "string" ? args.studentId : "";
  const name = typeof args.name === "string" ? args.name.trim() : "";
  return project.students.find((student) => student.id === studentId || (!studentId && name && student.name === name));
}

function groupCards(project: ProjectDocument): CardLayoutInput[] {
  const summary = buildProvinceSummary(project.students);
  const mapCenterX = project.map.x + (project.map.width * project.map.scale) / 2;
  const mapCenterY = project.map.y + (project.map.height * project.map.scale) / 2;
  const maxWidth = Math.max(120, project.cards.maxWidth);
  return summary.map((group, index) => ({
    id: group.province,
    anchorX: mapCenterX + Math.cos(index * 1.7) * project.map.width * project.map.scale * 0.28,
    anchorY: mapCenterY + Math.sin(index * 1.7) * project.map.height * project.map.scale * 0.28,
    width: maxWidth,
    height: Math.max(72, project.cards.fontSize * Math.max(2, Math.min(group.students.length + 1, 6))),
  }));
}

function runAutoLayout(project: ProjectDocument, mode: string): { project: ProjectDocument; placements: unknown[] } {
  const cards = groupCards(project);
  const result = solveCardLayout(cards, {
    width: project.canvas.width,
    height: project.canvas.height,
    map: { x: project.map.x, y: project.map.y, width: project.map.width * project.map.scale, height: project.map.height * project.map.scale },
    margin: project.canvas.safeMargin,
    gap: Math.max(10, project.cards.gap),
    occupiedAreas: project.guests.visibility ? [{ x: project.guests.x, y: project.guests.y, width: project.guests.width, height: 120 }] : [],
    allowMapOverlap: project.cards.allowMapOverlap === true,
  }, {
    mode: (mode || project.cards.layoutMode || "quadrant") as CardLayoutMode,
    autoBalance: project.cards.autoBalance !== false,
    // 用户手工拖放过的卡片钉在原坐标，其余卡片绕开它们排版，与画布求解一致。
    fixedPositions: project.cards.positions,
  });
  const positions = Object.fromEntries(result.placements.map((placement) => [placement.id, { x: placement.x, y: placement.y }]));
  return {
    project: { ...project, cards: { ...project.cards, positions } },
    placements: result.placements,
  };
}

function scenePatch(project: ProjectDocument, target: SceneSelection, patch: Record<string, unknown>): Partial<ProjectDocument> {
  const next = updateSceneTarget(project, target, patch);
  switch (target.type) {
    case "canvas": return { canvas: next.canvas };
    case "map": return { map: next.map };
    case "province": return { map: next.map };
    case "cards": return { cards: next.cards };
    case "guests": return { guests: next.guests };
    case "text": return { textElements: next.textElements };
    case "asset": return { assetElements: next.assetElements };
  }
}

export function validateClientToolCall(call: AgentToolCall): string | null {
  if (call.name === "manage_students" && call.arguments.action === "update_fact") {
    const fields = call.arguments.fields;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return JSON.stringify({ ok: false, code: "TOOL_ARGUMENTS_INVALID", tool: call.name, message: "fields 必须是对象" });
    const fieldRecord = fields as Record<string, unknown>;
    const unknownProps = Object.keys(fieldRecord).filter((key) => !["name", "university", "city"].includes(key));
    if (unknownProps.length > 0) return JSON.stringify({ ok: false, code: "TOOL_ARGUMENTS_INVALID", tool: call.name, unknownProps, allowedProps: ["name", "university", "city"], message: "update_fact 只允许修改 name、university、city" });
    if (Object.values(fieldRecord).some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 200)) return JSON.stringify({ ok: false, code: "TOOL_ARGUMENTS_INVALID", tool: call.name, message: "update_fact 字段值必须是非空字符串且 trim 后不超过 200 个字符" });
  }
  const patch = patchForTool(call.name, call.arguments);
  if (!patch) return null;
  const validation = validateScenePatch(patch.domain, patch.patch);
  if (!validation.ok) return JSON.stringify({ ok: false, code: "PATCH_REJECTED", ...validation.error });
  if (call.name === "update_asset" && "src" in patch.patch) return JSON.stringify({ ok: false, code: "PROTECTED_FIELD", field: "src" });
  return null;
}

export function executeAgentToolCall(project: ProjectDocument, call: AgentToolCall, assets: StudioAsset[] | undefined): { project: ProjectDocument; result: AgentToolResult } {
  const rejected = validateClientToolCall(call);
  if (rejected) return { project, result: { id: call.id, ok: false, content: rejected } };
  const args = call.arguments;
  try {
    if (call.name === "inspect_project") {
      const path = String(args.path ?? "");
      return { project, result: { id: call.id, ok: true, content: JSON.stringify({ ok: true, path, value: readPath(buildProjectDigest(project), path) }) } };
    }
    if (call.name === "describe_capability") {
      const domain = String(args.domain);
      return { project, result: { id: call.id, ok: true, content: JSON.stringify({ ok: true, domain, properties: SCENE_DOMAIN_PROPS[domain as SceneDomain] ?? [] }) } };
    }
    if (call.name === "check_health") {
      // 与交付路径共用同一体检入口：实测卡片宽高、连接线冲突与出血检查完全一致。
      return { project, result: { id: call.id, ok: true, content: JSON.stringify({ ok: true, issues: listContentLayoutIssues(project) }) } };
    }
    if (call.name === "find_assets") {
      const province = String(args.province ?? "").trim();
      const keyword = String(args.keyword ?? "").trim().toLocaleLowerCase("zh-CN");
      const found = (assets ?? []).filter((asset) => {
        const provinceMatch = !province || asset.provinceIds.some((id) => id.includes(province) || province.includes(id.replace(/省|市|自治区|壮族自治区|回族自治区|维吾尔自治区/g, "")));
        const keywordMatch = !keyword || asset.label.toLocaleLowerCase("zh-CN").includes(keyword);
        return provinceMatch && keywordMatch;
      }).map(({ id, label, kind, provinceIds, source }) => ({ id, label, kind, provinceIds, source }));
      return { project, result: { id: call.id, ok: true, content: JSON.stringify({ ok: true, assets: found }) } };
    }
    const target = sceneTargetForTool(call.name, args);
    if (target) {
      const patch = patchForTool(call.name, args)?.patch ?? {};
      return { project: { ...project, ...scenePatch(project, target, patch) }, result: { id: call.id, ok: true, content: JSON.stringify({ ok: true, target }) } };
    }
    if (call.name === "set_data_view") {
      return { project: applyDataViewChange(project, String(args.view) as DataViewId), result: { id: call.id, ok: true, content: JSON.stringify({ ok: true, view: args.view }) } };
    }
    if (call.name === "auto_layout") {
      const previousPositions = project.cards.positions ?? {};
      const layout = runAutoLayout(project, String(args.mode ?? "quadrant"));
      const nextPositions = layout.project.cards.positions ?? {};
      // fixedPositions 钉住后手工位置原样保留；只有确实被丢弃或挪动的键
      // （如没有对应分组的残留键）才算丢手工布局。
      const lostManualLayout = Object.entries(previousPositions).some(([key, point]) => {
        const next = nextPositions[key];
        return !next || next.x !== point.x || next.y !== point.y;
      });
      return { project: layout.project, result: { id: call.id, ok: true, content: JSON.stringify({ ok: true, placements: layout.placements, lostManualLayout }) } };
    }
    if (call.name === "manage_students") {
      const action = String(args.action ?? "");
      if (action === "remove_duplicate") {
        const duplicateIds = duplicateStudentIds(project.students);
        const seenKeys = new Set<string>();
        const nextStudents = project.students.filter((student) => {
          const key = `${student.name}\u001f${student.university}\u001f${student.city}`;
          if (!duplicateIds.has(student.id)) return true;
          if (seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });
        const removed = project.students.length - nextStudents.length;
        return { project: { ...project, students: nextStudents }, result: { id: call.id, ok: true, content: JSON.stringify({ ok: true, removed }) } };
      }
      const student = findStudent(project, args);
      if (!student) throw new Error("找不到指定学生");
      if (action === "hide" || action === "show") {
        const nextStudents = project.students.map((item) => item.id === student.id ? { ...item, visibility: action === "show" } : item);
        return { project: { ...project, students: nextStudents }, result: { id: call.id, ok: true, content: JSON.stringify({ ok: true, studentId: student.id, visibility: action === "show" }) } };
      }
      if (action === "update_fact") {
        const fields = (args.fields ?? {}) as Partial<Pick<Student, "name" | "university" | "city" | "province">>;
        const nextStudents = project.students.map((item) => item.id === student.id ? { ...item, ...fields } : item);
        return { project: { ...project, students: nextStudents }, result: { id: call.id, ok: true, content: JSON.stringify({ ok: true, studentId: student.id, before: student, after: { ...student, ...fields } }) } };
      }
    }
    throw new Error(`未知工具 ${call.name}`);
  } catch (error) {
    return { project, result: { id: call.id, ok: false, content: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) } };
  }
}
