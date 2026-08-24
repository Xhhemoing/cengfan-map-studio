import type { ProjectDocument } from "./project-document";
import { createSystemTemplate } from "./template-document";
import {
  createCustomTemplateFromProject,
  type CustomTemplateRecord,
  type TemplateSaveScope,
} from "./template-store";

/** 自定义模板列表的上限:再多就翻不动了,新的排在最前面。 */
export const MAX_CUSTOM_TEMPLATES = 20;

/**
 * 把当前工程的画布状态收成一份自定义模板记录。
 * 覆盖项一律从内置模板出发再叠当前值:直接塞画布状态会把内置模板里那些工程没覆盖过的
 * 字段丢掉,套用时就会退回系统默认。
 */
export function captureCustomTemplate(input: {
  name: string;
  scope: TemplateSaveScope;
  project: ProjectDocument;
}): CustomTemplateRecord {
  const { project } = input;
  const base = createSystemTemplate(project.templateId);
  return createCustomTemplateFromProject({
    name: input.name.trim(),
    baseTemplateId: project.templateId,
    scope: input.scope,
    overrides: {
      background: {
        type: project.canvas.backgroundImageSrc ? "image" : "color",
        color: project.canvas.backgroundColor || base.background.color,
        imageSrc: project.canvas.backgroundImageSrc,
        opacity: project.canvas.backgroundOpacity,
        blur: 0,
        layer: "behind-map",
      },
      map: {
        ...base.map,
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
        ...base.cards,
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

/** 新模板排在最前,超出上限的旧模板被挤掉。 */
export function withCapturedTemplate(
  existing: readonly CustomTemplateRecord[],
  record: CustomTemplateRecord,
): CustomTemplateRecord[] {
  return [record, ...existing].slice(0, MAX_CUSTOM_TEMPLATES);
}
