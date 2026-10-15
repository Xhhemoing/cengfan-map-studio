import type { PreparedCardContent } from "./prepared-card-content";
import type { ProjectDocument } from "./project-document";
import type { LayoutHealthIssue, LayoutHealthMeasurementSource } from "./layout-health";
import { resolveCardSettings } from "./card-settings-scope";
import { measureStyledCardText, type StyledCardTextOptions } from "./styled-card-text";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "./display-frame";
import type { SceneTextOptions } from "./scene-text-measurement";
import type { CardFontField } from "./scene-document";

function measurementSource(text: SceneTextOptions): LayoutHealthMeasurementSource {
  // The shared browser measurer reports fallback widths one call at a time. A
  // callback alone cannot tell callers whether it used Canvas or the
  // deterministic fallback. Scene compilation supplies the status getter, so
  // Node measurements remain explicitly estimated.
  return text.getMeasurementStatus?.() ?? text.measurementStatus ?? (text.measureText ? "measured" : "estimated");
}

function rowTextOptions(
  settings: ReturnType<typeof resolveCardSettings>,
  cityHeading: boolean,
  reference: boolean,
  text: SceneTextOptions,
): StyledCardTextOptions {
  return {
    fontSize: cityHeading
      ? settings.fieldTypography?.city?.fontSize ?? Math.max(9, settings.fontSize - 1)
      : settings.fontSize,
    fontWeight: cityHeading
      ? reference ? 800 : 700
      : reference
        ? settings.presentation === "color-pill" || settings.presentation === "city-label" ? 600 : 500
        : 400,
    fieldTypography: settings.fieldTypography,
    fieldFonts: settings.fieldFonts,
    userFonts: text.userFonts,
    measureText: text.measureText,
  };
}

function fieldFontSize(
  settings: ReturnType<typeof resolveCardSettings>,
  field: CardFontField,
  cityHeading: boolean,
): number {
  if (cityHeading && field === "city") return settings.fieldTypography?.city?.fontSize ?? Math.max(9, settings.fontSize - 1);
  return settings.fieldTypography?.[field]?.fontSize ?? settings.fontSize;
}

/** Validates the content the renderer will paint; explicit no-wrap remains respected. */
export function diagnoseCardTypography(
  project: ProjectDocument,
  cards: PreparedCardContent[],
  text: SceneTextOptions = {},
): LayoutHealthIssue[] {
  const issues: LayoutHealthIssue[] = [];

  for (const card of cards) {
    const settings = card.resolvedSettings ?? resolveCardSettings(project.cards, card.group.key);
    const minimum = settings.minFontSize ?? 8;
    const reference = Boolean(settings.presentation && settings.presentation !== "standard");
    const sizes: Array<{ label: string; size: number }> = [];
    const titleSize = card.referenceMetrics?.titleFontSize
      ?? settings.fieldTypography?.title?.fontSize
      ?? settings.fontSize;
    sizes.push({ label: "title", size: titleSize });
    if (settings.showCount !== false) sizes.push({ label: "count", size: settings.fontSize });
    card.rows.forEach((row, rowIndex) => {
      row.lines.forEach((line, lineIndex) => {
        // A line can contain several semantic fields, each with a different
        // fieldTypography size. City headings deliberately use the smaller
        // heading size, independent of body city text.
        const lineFields = new Set<CardFontField>(line.flatMap((fragment) => fragment.field ? [fragment.field] : []));
        if (lineFields.size === 0) {
          sizes.push({ label: `row:${rowIndex}:${lineIndex}`, size: fieldFontSize(settings, row.cityHeading ? "city" : "name", Boolean(row.cityHeading)) });
        } else {
          for (const field of lineFields) sizes.push({ label: `row:${rowIndex}:${lineIndex}:${field}`, size: fieldFontSize(settings, field, Boolean(row.cityHeading)) });
        }
      });
    });

    const tooSmall = sizes.filter(({ size }) => size < minimum);
    if (tooSmall.length > 0) {
      issues.push({
        id: `${card.group.key}:font-size`,
        kind: "unreadable-text",
        severity: "error",
        detail: `${card.group.title} 的 ${tooSmall.slice(0, 3).map(({ label }) => label).join("、")} 小于设定的 ${minimum}px 字号下限，请增大字号或调整布局`,
      });
    }

    const frame = settings.displayFrame === undefined
      ? deriveFixedDisplayFrameFromCardSettings(settings)
      : normalizeDisplayFrame(settings.displayFrame);
    const body = frame.fixed.items.find((item) => item.id === "name") ?? frame.fixed.items[0];
    const padding = frame.mode === "fixed" ? body?.x ?? settings.horizontalPadding ?? settings.padding : frame.style.padding;
    const available = card.referenceMetrics?.contentWidth ?? Math.max(1, card.width - padding * 2);
    for (let rowIndex = 0; rowIndex < card.rows.length; rowIndex += 1) {
      const row = card.rows[rowIndex]!;
      const options = rowTextOptions(settings, Boolean(row.cityHeading), reference, text);
      const noWrapFields = new Set(settings.noWrapFields ?? []);
      const noWrapOverflow = new Set<CardFontField>();
      let lineOverflow = false;
      for (const line of row.lines) {
        if (measureStyledCardText(line, options) > available + 0.5) lineOverflow = true;
        // `wrapStyledCardText` keeps a no-wrap fragment intact even when that
        // fragment alone is wider than the content box. Measure each semantic
        // fragment so the issue can locate the exact field instead of only
        // reporting a generic row overflow.
        for (const field of noWrapFields) {
          const fragments = line.filter((fragment) => fragment.field === field);
          if (fragments.length > 0 && measureStyledCardText(fragments, options) > available + 0.5) noWrapOverflow.add(field);
        }
      }
      for (const field of noWrapOverflow) {
        issues.push({
          id: `${card.group.key}:row:${rowIndex}:no-wrap:${field}`,
          kind: "text-overflow",
          severity: "warning",
          detail: `${card.group.title} 第 ${rowIndex + 1} 行的 ${field} 字段被设为不换行但超出内容宽度，请增宽展示框或允许该字段换行`,
        });
      }
      if (lineOverflow && noWrapOverflow.size === 0) {
        issues.push({
          id: `${card.group.key}:row:${rowIndex}`,
          kind: "text-overflow",
          severity: "warning",
          detail: `${card.group.title} 第 ${rowIndex + 1} 行超出内容宽度，请增宽展示框或允许该字段换行`,
        });
      }
    }
  }

  const source = measurementSource(text);
  return issues.map((issue) => ({ ...issue, source }));
}
