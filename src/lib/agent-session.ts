import { applyDataViewChange } from "./catalog-usage";
import { solveCardLayout, type CardLayoutInput, type CardLayoutMode } from "./card-layout";
import { checkLayoutHealth, type LayoutHealthInput, type LayoutHealthObject } from "./layout-health";
import type { StudioAsset } from "./assets";
import { duplicateStudentIds } from "./data-duplicate";
import { createId } from "./ids";
import { classifyAgentCall, highestRisk, type AgentToolCall, type RiskLevel } from "./agent-risk";
import { buildProjectDigest } from "./project-digest";
import type { ProjectDocument, ProjectTransaction } from "./project-document";
import { updateSceneTarget, type SceneSelection } from "./scene-document";
import type { DataViewId, Student } from "./project-data";
import { buildProvinceSummary } from "./project-data";
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

const MAX_ROUNDS = 20;
const READ_ONLY_TOOLS = new Set(["inspect_project", "describe_capability", "check_health", "find_assets"]);

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

export interface AgentSessionOptions {
  mode: "conservative" | "smart";
  assets?: StudioAsset[];
  endpoint?: string;
  onProgress?: (progress: { round: number; name: string; status: "running" | "done" | "rejected" }) => void;
}

interface AgentApiOutcome {
  kind: "tool-call" | "tool-rejected" | "finish" | "failed";
  calls?: AgentToolCall[];
  assistantMessage?: Record<string, unknown>;
  summary?: string;
  error?: string;
}

function cloneProject(project: ProjectDocument): ProjectDocument {
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
  }, { mode: (mode || project.cards.layoutMode || "quadrant") as CardLayoutMode, autoBalance: project.cards.autoBalance !== false });
  const positions = Object.fromEntries(result.placements.map((placement) => [placement.id, { x: placement.x, y: placement.y }]));
  return {
    project: { ...project, cards: { ...project.cards, positions } },
    placements: result.placements,
  };
}

function healthInput(project: ProjectDocument): LayoutHealthInput {
  const objects: LayoutHealthObject[] = [
    { id: "map", kind: "map", zIndex: project.map.zIndex, bounds: { x: project.map.x, y: project.map.y, width: project.map.width * project.map.scale, height: project.map.height * project.map.scale } },
    { id: "cards", kind: "card", zIndex: project.cards.zIndex, bounds: { x: project.cards.x, y: project.cards.y, width: project.cards.maxWidth, height: 180 } },
    ...(project.guests.visibility ? [{ id: "guests", kind: "guests" as const, zIndex: 20, bounds: { x: project.guests.x, y: project.guests.y, width: project.guests.width, height: 120 } }] : []),
    ...project.textElements.map((text) => ({
      id: text.id,
      kind: "text" as const,
      zIndex: 40,
      bounds: { x: text.x, y: text.y - text.fontSize, width: text.maxWidth, height: text.fontSize * 1.3 },
      visible: text.visibility,
      content: text.content,
      textColor: text.color,
      backgroundColor: project.canvas.backgroundColor,
    })),
    ...project.assetElements.map((asset) => ({ id: asset.id, kind: "asset" as const, zIndex: asset.zIndex, bounds: { x: asset.x, y: asset.y, width: asset.width, height: asset.height }, visible: asset.visibility })),
  ];
  return { canvas: { width: project.canvas.width, height: project.canvas.height, safeMargin: project.canvas.safeMargin }, objects, cardsPositions: project.cards.positions };
}

export class AgentSession {
  private shadow: ProjectDocument;
  private readonly options: AgentSessionOptions;
  private readonly conversation: Array<Record<string, unknown>> = [];
  private _steps: AgentStep[] = [];

  constructor(project: ProjectDocument, options: AgentSessionOptions) {
    this.shadow = cloneProject(project);
    this.options = options;
  }

  get shadowProject(): ProjectDocument {
    return this.shadow;
  }

  get steps(): AgentStep[] {
    return [...this._steps];
  }

  private validateClientCall(call: AgentToolCall): string | null {
    const patch = patchForTool(call.name, call.arguments);
    if (!patch) return null;
    const validation = validateScenePatch(patch.domain, patch.patch);
    if (!validation.ok) return JSON.stringify({ ok: false, code: "PATCH_REJECTED", ...validation.error });
    if (call.name === "update_asset" && "src" in patch.patch) return JSON.stringify({ ok: false, code: "PROTECTED_FIELD", field: "src" });
    return null;
  }

  private execute(call: AgentToolCall): AgentToolResult {
    const rejected = this.validateClientCall(call);
    if (rejected) return { id: call.id, ok: false, content: rejected };
    const args = call.arguments;
    try {
      if (call.name === "inspect_project") {
        const path = String(args.path ?? "");
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, path, value: readPath(buildProjectDigest(this.shadow), path) }) };
      }
      if (call.name === "describe_capability") {
        const domain = String(args.domain);
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, domain, properties: SCENE_DOMAIN_PROPS[domain as SceneDomain] ?? [] }) };
      }
      if (call.name === "check_health") {
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, issues: checkLayoutHealth(healthInput(this.shadow)) }) };
      }
      if (call.name === "find_assets") {
        const province = String(args.province ?? "").trim();
        const keyword = String(args.keyword ?? "").trim().toLocaleLowerCase("zh-CN");
        const assets = (this.options.assets ?? []).filter((asset) => {
          const provinceMatch = !province || asset.provinceIds.some((id) => id.includes(province) || province.includes(id.replace(/省|市|自治区|壮族自治区|回族自治区|维吾尔自治区/g, "")));
          const keywordMatch = !keyword || asset.label.toLocaleLowerCase("zh-CN").includes(keyword);
          return provinceMatch && keywordMatch;
        }).map(({ id, label, kind, provinceIds, source }) => ({ id, label, kind, provinceIds, source }));
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, assets }) };
      }
      const target = sceneTargetForTool(call.name, args);
      if (target) {
        const patch = patchForTool(call.name, args)?.patch ?? {};
        this.shadow = { ...this.shadow, ...scenePatch(this.shadow, target, patch) };
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, target }) };
      }
      if (call.name === "set_data_view") {
        this.shadow = applyDataViewChange(this.shadow, String(args.view) as DataViewId);
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, view: args.view }) };
      }
      if (call.name === "auto_layout") {
        const hadManualPositions = Object.keys(this.shadow.cards.positions ?? {}).length > 0;
        const layout = runAutoLayout(this.shadow, String(args.mode ?? "quadrant"));
        this.shadow = layout.project;
        return { id: call.id, ok: true, content: JSON.stringify({ ok: true, placements: layout.placements, lostManualLayout: hadManualPositions }) };
      }
      if (call.name === "manage_students") {
        const action = String(args.action ?? "");
        if (action === "remove_duplicate") {
          const duplicateIds = duplicateStudentIds(this.shadow.students);
          const seenKeys = new Set<string>();
          const nextStudents = this.shadow.students.filter((student) => {
            const key = `${student.name}\u001f${student.university}\u001f${student.city}`;
            if (!duplicateIds.has(student.id)) return true;
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
          });
          const removed = this.shadow.students.length - nextStudents.length;
          this.shadow = { ...this.shadow, students: nextStudents };
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, removed }) };
        }
        const student = findStudent(this.shadow, args);
        if (!student) throw new Error("找不到指定学生");
        if (action === "hide" || action === "show") {
          this.shadow = { ...this.shadow, students: this.shadow.students.map((item) => item.id === student.id ? { ...item, visibility: action === "show" } : item) };
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, studentId: student.id, visibility: action === "show" }) };
        }
        if (action === "update_fact") {
          const fields = (args.fields ?? {}) as Partial<Pick<Student, "name" | "university" | "city" | "province">>;
          this.shadow = { ...this.shadow, students: this.shadow.students.map((item) => item.id === student.id ? { ...item, ...fields } : item) };
          return { id: call.id, ok: true, content: JSON.stringify({ ok: true, studentId: student.id, before: student, after: { ...student, ...fields } }) };
        }
      }
      throw new Error(`未知工具 ${call.name}`);
    } catch (error) {
      return { id: call.id, ok: false, content: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) };
    }
  }

  async run(message: string): Promise<{ kind: "finish" | "tool-rejected" | "failed"; summary?: string; error?: string }> {
    this.conversation.length = 0;
    this.conversation.push({ role: "user", content: message });
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const response = await fetch(this.options.endpoint ?? "/api/ai/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: message, digest: buildProjectDigest(this.shadow), messages: this.conversation }),
      });
      if (!response.ok) return { kind: "failed", error: `Agent 接口错误：${response.status}` };
      const outcome = await response.json() as AgentApiOutcome;
      if (outcome.kind === "failed") return { kind: "failed", error: outcome.error ?? "Agent 失败" };
      if (outcome.kind === "finish") return { kind: "finish", summary: outcome.summary ?? "已完成。" };
      if (outcome.assistantMessage) this.conversation.push(outcome.assistantMessage);
      if (outcome.kind === "tool-rejected") {
        const assistantToolCalls = Array.isArray(outcome.assistantMessage?.tool_calls)
          ? outcome.assistantMessage.tool_calls as Array<{ id?: unknown }>
          : [];
        if (assistantToolCalls.length === 0) {
          this.conversation.push({ role: "tool", tool_call_id: "rejected", content: outcome.error ?? "工具参数被拒绝" });
        } else {
          for (const toolCall of assistantToolCalls) {
            this.conversation.push({
              role: "tool",
              tool_call_id: typeof toolCall.id === "string" ? toolCall.id : "rejected",
              content: outcome.error ?? "工具参数被拒绝",
            });
          }
        }
        continue;
      }
      for (const call of outcome.calls ?? []) {
        const risk = classifyAgentCall(this.shadow, call);
        this.options.onProgress?.({ round: round + 1, name: call.name, status: "running" });
        const toolResult = this.execute(call);
        const lostManualLayout = call.name === "auto_layout" && Boolean(JSON.parse(toolResult.content).lostManualLayout);
        this._steps.push({ id: call.id, name: call.name, arguments: call.arguments, result: toolResult, risk: lostManualLayout ? "high" : risk.level, lostManualLayout });
        this.options.onProgress?.({ round: round + 1, name: call.name, status: toolResult.ok ? "done" : "rejected" });
        this.conversation.push({ role: "tool", tool_call_id: call.id, content: toolResult.content });
      }
    }
    return { kind: "finish", summary: "已达到 20 轮上限，已交付当前完成的修改。" };
  }

  landingPreview(): { steps: AgentStep[]; needsConfirmation: boolean; highestRisk: RiskLevel } {
    const steps = this._steps.filter((step) => !READ_ONLY_TOOLS.has(step.name));
    const level = highestRisk(steps.map((step) => ({ level: step.risk, reason: "" })));
    return { steps, needsConfirmation: this.options.mode === "conservative" || level === "high", highestRisk: level };
  }

  transaction(): ProjectTransaction {
    const stepCount = this._steps.filter((step) => !READ_ONLY_TOOLS.has(step.name)).length;
    const finalSnapshot = cloneProject(this.shadow);
    return {
      id: createId("tx-ai-agent"),
      label: `AI 助手：${stepCount} 项改动`,
      source: "ai",
      apply: (current) => ({
        ...finalSnapshot,
        history: current.history,
        version: current.version,
      }),
    };
  }
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
