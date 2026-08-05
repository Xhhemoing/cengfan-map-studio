import { useMemo } from "react";
import type { ProjectDocument } from "../../lib/project-document";
import { applyCustomTemplateToProject, type CustomTemplateRecord } from "../../lib/template-store";
import { createDefaultScene } from "../../lib/scene-document";
import type { TemplateDocument } from "../../lib/template-document";
import { PosterCanvas } from "../canvas/PosterCanvas";

type PreviewTemplate = {
  project: ProjectDocument;
  template: TemplateDocument;
  customRecord?: CustomTemplateRecord;
};

export interface TemplatePreviewProps {
  project: ProjectDocument;
  template: TemplateDocument;
  customRecord?: CustomTemplateRecord;
}

function createPreviewProject({ project, template, customRecord }: PreviewTemplate): ProjectDocument {
  const base = customRecord
    ? applyCustomTemplateToProject(project, customRecord)
    : {
        ...project,
        templateId: template.id as ProjectDocument["templateId"],
        ...createDefaultScene(template.id as ProjectDocument["templateId"]),
      };
  const scene = customRecord?.scene;
  const canvas = {
    ...base.canvas,
    width: template.canvas.width,
    height: template.canvas.height,
    safeMargin: template.canvas.safeMargin,
    backgroundColor: template.background.color,
    backgroundImageSrc: template.background.imageSrc,
    backgroundOpacity: template.background.opacity,
  };
  const map = {
    ...base.map,
    scale: template.map.scale,
    x: scene?.map.x ?? template.map.offsetX,
    y: scene?.map.y ?? template.map.offsetY,
    landColor: template.map.landColor,
    activeColor: template.map.activeColor,
    edgeColor: template.map.edgeColor,
    edgeStyle: template.map.edgeStyle,
    edgeWidth: template.map.edgeWidth,
    showProvinceLabels: template.map.showProvinceLabels,
    provinceStyles: template.map.provinceStyles ?? {},
  };
  const cards = {
    ...base.cards,
    preset: template.cards.preset,
    grouping: scene?.cards.grouping ?? template.cards.grouping,
    maxWidth: template.cards.maxWidth,
    padding: template.cards.padding,
    background: template.cards.background,
    textColor: template.cards.textColor,
    visibleFields: [...template.visibleFields],
  };
  return {
    ...base,
    canvas,
    map,
    cards,
    style: {
      ...base.style,
      cardPreset: cards.preset,
      mapScale: map.scale,
      backgroundColor: canvas.backgroundColor,
      backgroundImageSrc: canvas.backgroundImageSrc,
      visibleFields: [...cards.visibleFields],
      regionalAssets: structuredClone(template.regionalAssets),
    },
  };
}

export function TemplatePreview({ project, template, customRecord }: TemplatePreviewProps) {
  const previewProject = useMemo(
    () => createPreviewProject({ project, template, customRecord }),
    [customRecord, project, template],
  );
  const orientation = template.canvas.width === template.canvas.height
    ? "方形"
    : template.canvas.width > template.canvas.height ? "横版" : "竖版";

  return (
    <section className="template-preview" aria-label={`${template.name}模板预览`}>
      <header className="template-preview__header">
        <div>
          <p className="template-preview__eyebrow">实时视觉预览</p>
          <h2>{template.name}</h2>
        </div>
        <div className="template-preview__facts">
          <strong>{template.canvas.width} × {template.canvas.height} px</strong>
          <span>{orientation} · 适合毕业去向海报</span>
        </div>
      </header>
      <div className="template-preview__canvas">
        <PosterCanvas
          project={previewProject}
          exportMode
          dataTemplateId={String(template.id)}
          userFonts={[]}
          renderIntervalMs={0}
        />
      </div>
    </section>
  );
}
