import type { ProjectDocument } from "./project-document";
import { createSystemTemplate, mergeTemplateDocuments, type TemplateDocument } from "./template-document";
import { createCustomTemplateFromProject, type CustomTemplateRecord, type TemplateSaveScope } from "./template-store";

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
