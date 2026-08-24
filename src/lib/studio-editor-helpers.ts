import type { UserAsset } from "./assets";
import { applyDataViewChange, findAssetUsage, isAssetInUse, type STYLE_LAYER_TARGETS } from "./catalog-usage";
import type { CustomTemplateRecord } from "./template-store";
import { createCustomTemplateFromProject, type TemplateSaveScope } from "./template-store";
import { checkLayoutHealth } from "./layout-health";
import { createId } from "./ids";
import { snapPoint } from "./grid";
import type { UserFont } from "./fonts";
import type { DataViewId, MapTemplateId } from "./project-data";
import type { ProjectDocument, ProjectTransaction } from "./project-document";
import { createProjectPackageEnvelope, type ProjectPackage } from "./project-package";
import type { RenderSettings } from "./render-settings";
import { createDefaultScene, type SceneSelection } from "./scene-document";
import { createSystemTemplate, mergeTemplateDocuments, type TemplateDocument } from "./template-document";

/** 编辑器工作区的最新完整状态（用于打包保存与协作快照）。 */
export interface WorkspaceStateSnapshot {
  project: ProjectDocument;
  assets: UserAsset[];
  fonts: UserFont[];
  customTemplates: CustomTemplateRecord[];
  renderSettings: RenderSettings;
}

export function snapCanvasPoint(x: number, y: number, showGrid: boolean, gridSize: number): { x: number; y: number } {
  if (!showGrid) return { x: Math.round(x), y: Math.round(y) };
  return snapPoint({ x, y }, gridSize);
}

export function freezeCardPositions(
  current: ProjectDocument,
  positions: Record<string, { x: number; y: number }> | null,
): ProjectDocument["cards"] {
  if (!positions || Object.keys(positions).length === 0) return current.cards;
  return { ...current.cards, positions: { ...positions, ...current.cards.positions } };
}

/** 协作快照统一去掉历史记录，避免把撤销栈同步给其他成员。 */
export function buildCollaborationPackage(latest: WorkspaceStateSnapshot, exportedAt: string): ProjectPackage {
  const pack = createProjectPackageEnvelope(latest);
  return { ...pack, exportedAt, project: { ...pack.project, history: { past: [], future: [] } } };
}

export function buildResolvedTemplate(renderProject: ProjectDocument): TemplateDocument {
  const base = createSystemTemplate(renderProject.templateId);
  return mergeTemplateDocuments(base, {
    background: {
      ...base.background,
      color: renderProject.canvas.backgroundColor || base.background.color,
      imageSrc: renderProject.canvas.backgroundImageSrc,
      type: renderProject.canvas.backgroundImageSrc ? "image" : "color",
    },
    map: {
      ...base.map,
      scale: renderProject.map.scale,
      edgeColor: renderProject.map.edgeColor,
      edgeStyle: renderProject.map.edgeStyle ?? "solid",
      edgeWidth: renderProject.map.edgeWidth ?? 1,
      landColor: renderProject.map.landColor,
      activeColor: renderProject.map.activeColor,
      showProvinceLabels: renderProject.map.showProvinceLabels,
      provinceStyles: renderProject.map.provinceStyles ?? {},
    },
    cards: {
      ...base.cards,
      preset: renderProject.cards.preset,
    },
    visibleFields: renderProject.cards.visibleFields,
    regionalAssets: renderProject.style.regionalAssets,
  });
}

export function buildAssetUsageMap(project: ProjectDocument, userAssets: UserAsset[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const asset of userAssets) {
    if (!isAssetInUse(project, asset.id, asset) && asset.src !== project.canvas.backgroundImageSrc) continue;
    const usage = findAssetUsage(project, asset.id);
    const parts: string[] = [];
    if (usage.provinces.length) parts.push(usage.provinces.map((name) => name.replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/, "")).join("/"));
    if (usage.instances.length) parts.push(`${usage.instances.length} 个实例`);
    if (asset.src === project.canvas.backgroundImageSrc) parts.push("背景");
    map[asset.id] = parts.length ? `使用中 · ${parts.join(" · ")}` : "使用中";
  }
  return map;
}

export function listContentLayoutIssues(project: ProjectDocument) {
  return checkLayoutHealth({
    canvas: { width: project.canvas.width, height: project.canvas.height, safeMargin: project.canvas.safeMargin },
    cardsPositions: project.cards.positions,
    objects: [
      { id: "map", kind: "map", zIndex: project.map.zIndex, bounds: { x: project.map.x, y: project.map.y, width: project.map.width * project.map.scale, height: project.map.height * project.map.scale } },
      ...Object.keys(project.cards.positions ?? {}).map((id) => ({ id, kind: "card" as const, positionKey: id, zIndex: project.cards.zIndex, bounds: { x: 0, y: 0, width: project.cards.maxWidth, height: 180 } })),
      ...(Object.keys(project.cards.positions ?? {}).length === 0 ? [{ id: "cards", kind: "card" as const, zIndex: project.cards.zIndex, bounds: { x: project.cards.x, y: project.cards.y, width: project.cards.maxWidth, height: 180 } }] : []),
      ...(project.guests.visibility ? [{ id: "guests", kind: "guests" as const, zIndex: 20, bounds: { x: project.guests.x, y: project.guests.y, width: project.guests.width, height: 120 } }] : []),
      ...project.textElements.map((text) => ({
        id: text.id,
        kind: "text" as const,
        zIndex: 40,
        bounds: { x: text.textAlign === "right" ? text.x - text.maxWidth : text.textAlign === "center" ? text.x - text.maxWidth / 2 : text.x, y: text.y - text.fontSize, width: text.maxWidth, height: text.fontSize * 1.3 },
        visible: text.visibility,
        content: text.content,
        textColor: text.color,
        backgroundColor: project.canvas.backgroundColor,
      })),
      ...project.assetElements.map((asset) => ({ id: asset.id, kind: "asset" as const, zIndex: asset.zIndex, bounds: { x: asset.x, y: asset.y, width: asset.width, height: asset.height }, visible: asset.visibility })),
    ],
  });
}

export function resolveStyleLayerSelection(target: (typeof STYLE_LAYER_TARGETS)[number]): SceneSelection {
  if (target.type === "text") return { type: "text", id: target.id };
  if (target.type === "map") return { type: "map" };
  if (target.type === "canvas") return { type: "canvas" };
  if (target.type === "guests") return { type: "guests" };
  return { type: "cards" };
}

/** 由排版问题 id 找到画布上应选中的对象；找不到时返回 null（保持当前选择不变）。 */
export function resolveLayoutIssueSelection(project: ProjectDocument, issueId: string): SceneSelection | null {
  const target = issueId.split(":").find((id) => (
    id === "map"
    || id === "cards"
    || id === "guests"
    || Boolean(project.cards.positions?.[id])
    || project.textElements.some((text) => text.id === id)
    || project.assetElements.some((asset) => asset.id === id)
  ));
  if (!target) return null;
  if (target === "map") return { type: "map" };
  if (target === "cards" || project.cards.positions?.[target]) return { type: "cards" };
  if (target === "guests") return { type: "guests" };
  if (project.textElements.some((text) => text.id === target)) return { type: "text", id: target };
  if (project.assetElements.some((asset) => asset.id === target)) return { type: "asset", id: target };
  return null;
}

export function createApplySystemTemplateTransaction(templateId: MapTemplateId): ProjectTransaction {
  const scene = createDefaultScene(templateId);
  return {
    id: createId(`tx-template-${templateId}`),
    label: `应用内置模板：${createSystemTemplate(templateId).name}`,
    source: "manual",
    apply: (current) => ({
      ...current,
      templateId,
      canvas: scene.canvas,
      map: scene.map,
      cards: scene.cards,
      textElements: scene.textElements,
      assetElements: scene.assetElements,
      style: {
        ...current.style,
        cardPreset: scene.cards.preset,
        mapScale: scene.map.scale,
        backgroundColor: scene.canvas.backgroundColor,
        visibleFields: [...scene.cards.visibleFields],
      },
    }),
  };
}

export function buildCustomTemplateDraft(
  project: ProjectDocument,
  name: string,
  scope: TemplateSaveScope,
): CustomTemplateRecord {
  return createCustomTemplateFromProject({
    name: name.trim(),
    baseTemplateId: project.templateId,
    scope,
    overrides: {
      background: {
        type: project.canvas.backgroundImageSrc ? "image" : "color",
        color: project.canvas.backgroundColor || createSystemTemplate(project.templateId).background.color,
        imageSrc: project.canvas.backgroundImageSrc,
        opacity: project.canvas.backgroundOpacity,
        blur: 0,
        layer: "behind-map",
      },
      map: {
        ...createSystemTemplate(project.templateId).map,
        scale: project.map.scale,
        offsetX: project.map.x,
        offsetY: project.map.y,
        landColor: project.map.landColor,
        activeColor: project.map.activeColor,
        edgeColor: project.map.edgeColor,
        edgeStyle: project.map.edgeStyle ?? "solid",
        edgeWidth: project.map.edgeWidth ?? 1,
        showProvinceLabels: project.map.showProvinceLabels,
        provinceStyles: project.map.provinceStyles ?? {},
      },
      cards: {
        ...createSystemTemplate(project.templateId).cards,
        preset: project.cards.preset,
        grouping: project.cards.grouping,
        maxWidth: project.cards.maxWidth,
        padding: project.cards.padding,
        background: project.cards.background,
        textColor: project.cards.textColor,
      },
      visibleFields: project.cards.visibleFields,
      regionalAssets: project.style.regionalAssets,
    },
    scene: {
      canvas: project.canvas,
      map: project.map,
      cards: project.cards,
      guests: project.guests,
      textElements: project.textElements,
      assetElements: project.assetElements,
    },
    students: project.students,
  });
}

export type StudentEditPatch = Partial<Pick<ProjectDocument["students"][number], "name" | "university" | "city" | "province" | "locationScope">>;

export function createDataViewTransaction(view: DataViewId): ProjectTransaction {
  return {
    id: createId(`tx-data-view-${view}`),
    label: `切换数据呈现：${view}`,
    source: "manual",
    apply: (current) => applyDataViewChange(current, view),
  };
}

export function createAppendStudentsTransaction(records: ProjectDocument["students"]): ProjectTransaction {
  return {
    id: createId("tx-append"),
    label: `追加 ${records.length} 名学生`,
    source: "import",
    apply: (current) => ({ ...current, students: [...current.students, ...records] }),
  };
}

export function createReplaceStudentsTransaction(records: ProjectDocument["students"]): ProjectTransaction {
  return {
    id: createId("tx-replace"),
    label: `替换为 ${records.length} 名学生`,
    source: "import",
    apply: (current) => ({ ...current, students: records }),
  };
}

export function createStudentUpdateTransaction(id: string, patch: StudentEditPatch): ProjectTransaction {
  return {
    id: createId(`tx-student-update-${id}`),
    label: "编辑学生记录",
    source: "manual",
    apply: (current) => ({
      ...current,
      students: current.students.map((student) => {
        if (student.id !== id) return student;
        const next = { ...student, ...patch };
        if ("province" in patch && !patch.province) {
          const { province: _cleared, ...withoutProvince } = next;
          if ("locationScope" in patch && !patch.locationScope) {
            const { locationScope: _locationScope, ...withoutLocationScope } = withoutProvince;
            return withoutLocationScope;
          }
          return withoutProvince;
        }
        if ("locationScope" in patch && !patch.locationScope) {
          const { locationScope: _cleared, ...rest } = next;
          return rest;
        }
        return next;
      }),
    }),
  };
}

export function createStudentVisibilityToggleTransaction(id: string): ProjectTransaction {
  return {
    id: createId(`tx-student-visibility-${id}`),
    label: "切换学生显示状态",
    source: "manual",
    apply: (current) => ({
      ...current,
      students: current.students.map((student) => student.id === id ? { ...student, visibility: student.visibility === false } : student),
    }),
  };
}

export function createStudentDeleteTransaction(id: string): ProjectTransaction {
  return {
    id: createId(`tx-student-delete-${id}`),
    label: "删除学生记录",
    source: "manual",
    apply: (current) => ({ ...current, students: current.students.filter((student) => student.id !== id) }),
  };
}

export function createStudentsVisibilityTransaction(visibility: boolean): ProjectTransaction {
  return {
    id: createId(`tx-students-visibility-${visibility}`),
    label: visibility ? "全部显示学生" : "全部隐藏学生",
    source: "manual",
    apply: (current) => ({ ...current, students: current.students.map((student) => ({ ...student, visibility })) }),
  };
}
