import { listSystemAssets, type UserAsset } from "./assets";
import { BUILT_IN_FONTS, type UserFont } from "./fonts";
import type { ProjectDocument } from "./project-document";
import type { DisplayFrameDefinition } from "./display-frame";

export type ResourceHealthKind = "resource" | "font";
export type ResourceHealthSeverity = "warning" | "error";

export interface ResourceHealthIssue {
  kind: ResourceHealthKind;
  target: string;
  detail: string;
  severity: ResourceHealthSeverity;
}

interface ResourceReference {
  target: string;
  id?: string;
  src?: string;
  label: string;
}

function hasResource(reference: ResourceReference, assets: readonly UserAsset[]): boolean {
  const available = [...listSystemAssets(), ...assets];
  return available.some((asset) => (
    reference.id && asset.id === reference.id
  ) || (
    reference.src && asset.src === reference.src
  ));
}

function addMissingResource(
  issues: ResourceHealthIssue[],
  reference: ResourceReference,
  assets: readonly UserAsset[],
): void {
  if (!reference.id && !reference.src) return;
  if (hasResource(reference, assets)) return;
  issues.push({
    kind: "resource",
    target: reference.target,
    detail: `${reference.label}缺失${reference.id ? `（${reference.id}）` : ""}`,
    severity: "error",
  });
}

function hasFont(fontId: string | undefined, fonts: readonly UserFont[]): boolean {
  if (!fontId) return true;
  return BUILT_IN_FONTS.some((font) => font.id === fontId)
    || fonts.some((font) => font.id === fontId || font.family === fontId);
}

function addMissingFont(
  issues: ResourceHealthIssue[],
  target: string,
  fontId: string | undefined,
  label: string,
  fonts: readonly UserFont[],
): void {
  if (!fontId || hasFont(fontId, fonts)) return;
  issues.push({
    kind: "font",
    target,
    detail: `${label}字体缺失（${fontId}）`,
    severity: "error",
  });
}

function displayFrameFontReferences(frame: DisplayFrameDefinition | undefined): Array<{ target: string; fontId?: string; label: string }> {
  if (!frame) return [];
  return [
    { target: "display-frame:style", fontId: frame.style.fontId, label: "展示框" },
    ...frame.fixed.items.map((item) => ({ target: `display-frame:${item.id}`, fontId: item.fontId ?? item.style?.fontId, label: `展示框 ${item.id}` })),
    ...frame.flow.blocks.map((block) => ({ target: `display-frame:${block.id}`, fontId: block.fontId ?? block.style?.fontId, label: `展示框 ${block.id}` })),
  ];
}

export function listResourceHealthIssues(
  project: ProjectDocument,
  userAssets: readonly UserAsset[],
  userFonts: readonly UserFont[],
): ResourceHealthIssue[] {
  const issues: ResourceHealthIssue[] = [];
  addMissingResource(issues, {
    target: "background",
    src: project.canvas.backgroundImageSrc,
    label: "背景素材",
  }, userAssets);

  const mapSource = project.map.renderSource;
  if (mapSource?.kind === "image") {
    addMissingResource(issues, {
      target: "map",
      id: mapSource.assetId,
      src: mapSource.src,
      label: "地图图片",
    }, userAssets);
  }

  for (const [province, style] of Object.entries(project.map.provinceStyles ?? {})) {
    const appearance = style?.appearance;
    if (!appearance || appearance.kind === "manual-color") continue;
    addMissingResource(issues, {
      target: `province:${province}`,
      id: appearance.assetId,
      src: appearance.src,
      label: `${province} 外观素材`,
    }, userAssets);
  }

  for (const element of project.assetElements) {
    addMissingResource(issues, {
      target: `asset:${element.id}`,
      id: element.assetId,
      src: element.src,
      label: `素材实例 ${element.label}`,
    }, userAssets);
  }

  for (const text of project.textElements) {
    addMissingFont(issues, `text:${text.id}`, text.fontId, `文字 ${text.content || text.id}`, userFonts);
  }
  for (const [field, fontId] of Object.entries(project.cards.fieldFonts ?? {})) {
    addMissingFont(issues, `cards:${field}`, fontId, `卡片 ${field}`, userFonts);
  }
  addMissingFont(issues, "map-labels", project.map.provinceLabelFontId, "地图标签", userFonts);
  for (const [province, style] of Object.entries(project.map.provinceStyles ?? {})) {
    addMissingFont(issues, `map-label:${province}`, style?.labelFontId, `${province} 标签`, userFonts);
  }
  addMissingFont(issues, "guests:title", project.guests.titleFontId, "嘉宾标题", userFonts);
  addMissingFont(issues, "guests:people", project.guests.peopleFontId, "嘉宾名单", userFonts);
  for (const person of project.guests.people) {
    addMissingFont(issues, `guest:${person.id}`, person.fontId, `嘉宾 ${person.name}`, userFonts);
  }
  for (const reference of displayFrameFontReferences(project.cards.displayFrame)) {
    addMissingFont(issues, reference.target, reference.fontId, reference.label, userFonts);
  }

  return issues;
}
