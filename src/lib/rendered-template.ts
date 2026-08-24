import type { ProjectDocument } from "./project-document";
import {
  createSystemTemplate,
  mergeTemplateDocuments,
  type TemplateDocument,
} from "./template-document";

/**
 * 把当前工程折算回一份模板文档,供「当前模板参数」这类只读展示使用。
 * 一律从内置模板出发再叠工程值:直接拿工程状态当模板,工程没覆盖过的字段就会空着。
 */
export function resolveRenderedTemplate(project: ProjectDocument): TemplateDocument {
  const base = createSystemTemplate(project.templateId);
  return mergeTemplateDocuments(base, {
    background: {
      ...base.background,
      color: project.canvas.backgroundColor || base.background.color,
      imageSrc: project.canvas.backgroundImageSrc,
      type: project.canvas.backgroundImageSrc ? "image" : "color",
    },
    map: {
      ...base.map,
      scale: project.map.scale,
      edgeColor: project.map.edgeColor,
      edgeStyle: project.map.edgeStyle ?? "solid",
      edgeWidth: project.map.edgeWidth ?? 1,
      landColor: project.map.landColor,
      activeColor: project.map.activeColor,
      showProvinceLabels: project.map.showProvinceLabels,
      provinceStyles: project.map.provinceStyles ?? {},
    },
    cards: {
      ...base.cards,
      preset: project.cards.preset,
    },
    visibleFields: project.cards.visibleFields,
    regionalAssets: project.style.regionalAssets,
  });
}
