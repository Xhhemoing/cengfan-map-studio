import { createId } from "./ids";
import type { MapTemplateId, Student } from "./project-data";
import type { ProjectDocument } from "./project-document";
import { normalizeScene, type SceneDocument } from "./scene-document";
import {
  createSystemTemplate,
  mergeTemplateDocuments,
  type TemplateDocument,
} from "./template-document";

export type TemplateSaveScope = "visual" | "layout";

export interface CustomTemplateRecord {
  id: string;
  name: string;
  baseTemplateId: MapTemplateId;
  scope: TemplateSaveScope;
  document: TemplateDocument;
  scene?: SceneDocument;
  createdAt: string;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const CUSTOM_TEMPLATES_KEY = "cengfan-map-studio:custom-templates";
const MAP_TEMPLATE_IDS = ["original", "cartoon", "grain", "q", "scenery", "regional"] as const;

function isMapTemplateId(value: unknown): value is MapTemplateId {
  return MAP_TEMPLATE_IDS.includes(value as MapTemplateId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stripStudentData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripStudentData);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "students")
      .map(([key, nestedValue]) => [key, stripStudentData(nestedValue)]),
  );
}

function isTemplateDocument(value: unknown): value is TemplateDocument {
  if (!isRecord(value)) return false;
  const canvas = value.canvas;
  const background = value.background;
  const map = value.map;
  const cards = value.cards;
  const markers = value.markers;
  const connectors = value.connectors;
  const typography = value.typography;

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isRecord(canvas) &&
    isFiniteNumber(canvas.width) &&
    isFiniteNumber(canvas.height) &&
    isFiniteNumber(canvas.safeMargin) &&
    isRecord(background) &&
    typeof background.type === "string" &&
    typeof background.color === "string" &&
    isFiniteNumber(background.opacity) &&
    isFiniteNumber(background.blur) &&
    typeof background.layer === "string" &&
    isRecord(map) &&
    isFiniteNumber(map.scale) &&
    isFiniteNumber(map.offsetX) &&
    isFiniteNumber(map.offsetY) &&
    typeof map.landColor === "string" &&
    typeof map.activeColor === "string" &&
    typeof map.edgeColor === "string" &&
    typeof map.edgeStyle === "string" &&
    typeof map.edgeWidth === "number" &&
    typeof map.showProvinceLabels === "boolean" &&
    isRecord(map.provinceStyles) &&
    isRecord(cards) &&
    typeof cards.grouping === "string" &&
    typeof cards.preset === "string" &&
    isFiniteNumber(cards.maxWidth) &&
    isFiniteNumber(cards.padding) &&
    typeof cards.background === "string" &&
    typeof cards.textColor === "string" &&
    isRecord(markers) &&
    typeof markers.style === "string" &&
    typeof markers.color === "string" &&
    isFiniteNumber(markers.size) &&
    isRecord(connectors) &&
    typeof connectors.style === "string" &&
    typeof connectors.color === "string" &&
    isFiniteNumber(connectors.width) &&
    typeof connectors.dashed === "boolean" &&
    isRecord(typography) &&
    isFiniteNumber(typography.titleSize) &&
    isFiniteNumber(typography.bodySize) &&
    isFiniteNumber(typography.nameWeight) &&
    isFiniteNumber(typography.universityWeight) &&
    Array.isArray(value.visibleFields) &&
    value.visibleFields.every((field) => typeof field === "string") &&
    isRecord(value.regionalAssets)
  );
}

function sanitizeCustomTemplateRecord(value: unknown): CustomTemplateRecord | null {
  const sanitized = stripStudentData(value);
  if (!isRecord(sanitized)) return null;

  const baseTemplateId = sanitized.baseTemplateId;
  if (
    typeof sanitized.id !== "string" ||
    typeof sanitized.name !== "string" ||
    !isMapTemplateId(baseTemplateId) ||
    (sanitized.scope !== "visual" && sanitized.scope !== "layout") ||
    typeof sanitized.createdAt !== "string" ||
    !isTemplateDocument(sanitized.document)
  ) {
    return null;
  }

  return {
    id: sanitized.id,
    name: sanitized.name,
    baseTemplateId: baseTemplateId as MapTemplateId,
    scope: sanitized.scope,
    document: sanitized.document,
    scene: isSceneDocument(sanitized.scene) ? normalizeScene(sanitized.scene) : undefined,
    createdAt: sanitized.createdAt,
  };
}

function isSceneDocument(value: unknown): value is SceneDocument {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.canvas)
    && isFiniteNumber(value.canvas.width)
    && isFiniteNumber(value.canvas.height)
    && isFiniteNumber(value.canvas.safeMargin)
    && typeof value.canvas.backgroundColor === "string"
    && typeof value.canvas.backgroundFit === "string"
    && isFiniteNumber(value.canvas.backgroundOpacity)
    && isRecord(value.map)
    && isFiniteNumber(value.map.x)
    && isFiniteNumber(value.map.y)
    && isFiniteNumber(value.map.width)
    && isFiniteNumber(value.map.height)
    && isFiniteNumber(value.map.scale)
    && isRecord(value.cards)
    && Array.isArray(value.cards.visibleFields)
    && Array.isArray(value.textElements)
    && Array.isArray(value.assetElements)
  );
}

function stripStudentFacts(document: TemplateDocument): TemplateDocument {
  // TemplateDocument never stores student arrays; structured clone is enough.
  return structuredClone(document);
}

export function createCustomTemplateFromProject(input: {
  name: string;
  baseTemplateId: MapTemplateId;
  scope: TemplateSaveScope;
  overrides: Partial<TemplateDocument>;
  scene?: SceneDocument;
  students: Student[];
}): CustomTemplateRecord {
  void input.students;
  const base = createSystemTemplate(input.baseTemplateId);
  const merged = mergeTemplateDocuments(base, input.overrides);
  const scoped: TemplateDocument =
    input.scope === "visual"
      ? {
          ...merged,
          cards: {
            ...base.cards,
            ...merged.cards,
            grouping: base.cards.grouping,
          },
        }
      : merged;

  const document = stripStudentFacts({
    ...scoped,
    id: createId("custom"),
    name: input.name.trim() || "自定义模板",
  });

  const scene = input.scene ? normalizeScene(structuredClone(input.scene)) : undefined;
  if (scene) {
    document.canvas = {
      ...document.canvas,
      width: scene.canvas.width,
      height: scene.canvas.height,
      safeMargin: scene.canvas.safeMargin,
    };
    document.background = {
      ...document.background,
      type: scene.canvas.backgroundImageSrc ? "image" : "color",
      color: scene.canvas.backgroundColor,
      imageSrc: scene.canvas.backgroundImageSrc,
      opacity: scene.canvas.backgroundOpacity,
    };
    document.map = {
      ...document.map,
      scale: scene.map.scale,
      offsetX: scene.map.x,
      offsetY: scene.map.y,
      landColor: scene.map.landColor,
      activeColor: scene.map.activeColor,
      edgeColor: scene.map.edgeColor,
      edgeStyle: scene.map.edgeStyle,
      edgeWidth: scene.map.edgeWidth,
      showProvinceLabels: scene.map.showProvinceLabels,
      fillMode: scene.map.fillMode,
      emptyProvinceFill: scene.map.emptyProvinceFill,
      provinceStyles: { ...scene.map.provinceStyles },
    };
    document.cards = {
      ...document.cards,
      grouping: scene.cards.grouping,
      preset: scene.cards.preset,
      maxWidth: scene.cards.maxWidth,
      padding: scene.cards.padding,
      background: scene.cards.background,
      textColor: scene.cards.textColor,
    };
    document.visibleFields = [...scene.cards.visibleFields];
  }

  return {
    id: String(document.id),
    name: document.name,
    baseTemplateId: input.baseTemplateId,
    scope: input.scope,
    document,
    scene,
    createdAt: new Date().toISOString(),
  };
}

export function saveCustomTemplates(
  templates: CustomTemplateRecord[],
  storage: StorageAdapter = localStorage,
): void {
  const sanitized = templates
    .map((template) => sanitizeCustomTemplateRecord(template))
    .filter((template): template is CustomTemplateRecord => template !== null);
  storage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(sanitized));
}

export function loadCustomTemplates(
  storage: StorageAdapter = localStorage,
): CustomTemplateRecord[] {
  const raw = storage.getItem(CUSTOM_TEMPLATES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .map((template) => sanitizeCustomTemplateRecord(template))
          .filter((template): template is CustomTemplateRecord => template !== null)
      : [];
  } catch {
    return [];
  }
}

export function applyCustomTemplateToProject(
  project: ProjectDocument,
  template: CustomTemplateRecord,
): ProjectDocument {
  if (template.scene) {
    return {
      ...project,
      templateId: template.baseTemplateId,
      canvas: structuredClone(template.scene.canvas),
      map: structuredClone(template.scene.map),
      cards: structuredClone(template.scene.cards),
      guests: structuredClone(template.scene.guests ?? project.guests),
      textElements: structuredClone(template.scene.textElements),
      assetElements: structuredClone(template.scene.assetElements),
      style: {
        ...project.style,
        cardPreset: template.scene.cards.preset,
        mapScale: template.scene.map.scale,
        backgroundColor: template.scene.canvas.backgroundColor,
        backgroundImageSrc: template.scene.canvas.backgroundImageSrc,
        visibleFields: [...template.scene.cards.visibleFields],
      },
      dataView: template.scene.cards.grouping === "city"
        || template.scene.cards.grouping === "university"
        ? template.scene.cards.grouping
        : project.dataView,
    };
  }

  return {
    ...project,
    templateId: template.baseTemplateId,
    canvas: {
      ...project.canvas,
      backgroundColor: template.document.background.color,
      backgroundImageSrc: template.document.background.imageSrc,
      backgroundOpacity: template.document.background.opacity,
    },
    map: {
      ...project.map,
      x: template.document.map.offsetX,
      y: template.document.map.offsetY,
      scale: template.document.map.scale,
      landColor: template.document.map.landColor,
      activeColor: template.document.map.activeColor,
      edgeColor: template.document.map.edgeColor,
      edgeStyle: template.document.map.edgeStyle,
      edgeWidth: template.document.map.edgeWidth,
      showProvinceLabels: template.document.map.showProvinceLabels,
      provinceStyles: { ...template.document.map.provinceStyles },
    },
    cards: {
      ...project.cards,
      preset: template.document.cards.preset,
      grouping: template.document.cards.grouping,
      maxWidth: template.document.cards.maxWidth,
      padding: template.document.cards.padding,
      background: template.document.cards.background,
      textColor: template.document.cards.textColor,
      visibleFields: [...template.document.visibleFields],
    },
    style: {
      ...project.style,
      cardPreset: template.document.cards.preset,
      mapScale: template.document.map.scale,
      backgroundColor: template.document.background.color,
      backgroundImageSrc: template.document.background.imageSrc,
      visibleFields: [...template.document.visibleFields],
      regionalAssets: structuredClone(template.document.regionalAssets),
    },
    dataView: template.document.cards.grouping === "city"
      || template.document.cards.grouping === "university"
      ? template.document.cards.grouping
      : project.dataView,
  };
}
