import { destinationCardFixedRowHeight, destinationCardFlowContentStart, destinationCardRowFontSize } from "../../lib/destination-card-metrics";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "../../lib/display-frame";
import { resolveFontFamily } from "../../lib/fonts";
import { cardFieldFontSize } from "../../lib/prepared-card-content";
import type { CardFontField, CardSettings } from "../../lib/scene-document";
import type { DestinationCardStyle } from "./DestinationCard";
import type { DestinationCardsAppearance } from "./DestinationCardsLayer";

/** Paint and measurement read the same per-card settings. Legacy frames remain supported. */
export function resolveDestinationCardStyle(base: DestinationCardStyle, appearance: DestinationCardsAppearance, cards?: CardSettings) {
  if (!cards) return { style: base, appearance };
  const frame = cards.displayFrame === undefined ? deriveFixedDisplayFrameFromCardSettings(cards) : normalizeDisplayFrame(cards.displayFrame);
  const body = frame.fixed.items.find((item) => item.id === "name") ?? frame.fixed.items[0];
  const blocks = frame.mode === "flow" ? frame.flow.blocks.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) : [];
  const blockFor = (field: CardFontField) => blocks.find((block) => block.field === field);
  const title = blockFor("title");
  const name = blockFor("name");
  const style: DestinationCardStyle = {
    ...base,
    preset: cards.preset, background: cards.background, opacity: cards.opacity, textColor: cards.textColor,
    fontSize: cards.fontSize, showCount: cards.showCount !== false,
    horizontalPadding: frame.mode === "fixed" ? body?.x ?? cards.horizontalPadding ?? cards.padding : frame.style.padding,
    fieldFonts: cards.fieldFonts, fieldTypography: cards.fieldTypography,
    rowHeight: destinationCardFixedRowHeight({
      rowFontSize: destinationCardRowFontSize({
        visibleFieldFontSizes: cards.visibleFields.map((field) => cards.fieldTypography?.[field]?.fontSize ?? cards.fontSize),
        cityHeadingFontSize: cardFieldFontSize("city", cards.fontSize, cards.fieldTypography),
      }), compactLayout: cards.compactLayout === true || cards.preset === "compact", lineHeightMultiplier: base.lineHeightMultiplier,
    }),
    frameMode: frame.mode, frameStyle: frame.style, frameTitleItem: frame.fixed.items.find((item) => item.id === "title"), frameBodyItem: body,
    customFrameItems: frame.mode === "fixed" ? frame.fixed.items.filter((item) => item.kind === "text" || item.kind === "decoration").slice().sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id)) : [],
    flowTitleBlock: title, flowNameBlock: name, flowCityBlock: blockFor("city"),
    flowTitleFontSize: title?.style?.fontSize ?? cards.fieldTypography?.title?.fontSize ?? cards.fontSize,
    flowNameFontSize: name?.style?.fontSize ?? cards.fieldTypography?.name?.fontSize ?? cards.fontSize,
    flowContentStart: frame.mode === "flow" ? destinationCardFlowContentStart(blocks, cards.fontSize) : 0,
  };
  return { style, appearance: { ...appearance, preset: cards.preset, presentation: cards.presentation ?? "standard",
    background: cards.background, opacity: cards.opacity, textColor: cards.textColor, fontSize: cards.fontSize,
    showProvinceTexture: cards.showProvinceTexture === true, titleFont: resolveFontFamily(cards.fieldFonts?.title, base.userFonts),
  } };
}
