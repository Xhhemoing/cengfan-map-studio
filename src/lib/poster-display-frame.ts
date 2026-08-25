import type { DisplayFrameDefinition, DisplayFrameFixedItem, DisplayFrameFlowBlock } from "./display-frame";
import type { CardFontField, CardSettings } from "./scene-document";

/** Positions and typography derived from the card display frame, shared by card
 *  measurement (content width) and card rendering (title/body placement). */
export interface CardFrameLayout {
  frameTitleItem: DisplayFrameFixedItem | undefined;
  frameBodyItem: DisplayFrameFixedItem | undefined;
  flowBlocks: DisplayFrameFlowBlock[];
  flowBlockFor: (field: CardFontField) => DisplayFrameFlowBlock | undefined;
  flowTitleBlock: DisplayFrameFlowBlock | undefined;
  flowTitleFontSize: number;
  flowNameFontSize: number;
  flowContentStart: number;
  customFrameItems: DisplayFrameFixedItem[];
  horizontalPadding: number;
}

export function deriveCardFrameLayout(displayFrame: DisplayFrameDefinition, cards: CardSettings): CardFrameLayout {
  const frameTitleItem = displayFrame.fixed.items.find((item) => item.id === "title");
  const frameBodyItem = displayFrame.fixed.items.find((item) => item.id === "name") ?? displayFrame.fixed.items[0];
  const flowBlocks = displayFrame.mode === "flow" ? displayFrame.flow.blocks.slice().sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)) : [];
  const flowBlockFor = (field: CardFontField) => flowBlocks.find((block) => block.field === field);
  const flowTitleBlock = flowBlockFor("title");
  const flowNameBlock = flowBlockFor("name");
  const flowTitleFontSize = flowTitleBlock?.style?.fontSize ?? cards.fieldTypography?.title?.fontSize ?? cards.fontSize;
  const flowNameFontSize = flowNameBlock?.style?.fontSize ?? cards.fieldTypography?.name?.fontSize ?? cards.fontSize;
  const flowContentStart = displayFrame.mode === "flow"
    ? flowBlocks.reduce((cursor, block) => cursor + block.spacing + (block.style?.fontSize ?? (block.field === "city" ? Math.max(9, cards.fontSize - 1) : cards.fontSize)) * block.lineHeight, 12)
    : 0;
  const customFrameItems = displayFrame.mode === "fixed"
    ? displayFrame.fixed.items.filter((item) => item.kind === "text" || item.kind === "decoration").slice().sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id))
    : [];
  const horizontalPadding = displayFrame.mode === "fixed"
    ? frameBodyItem?.x ?? cards.horizontalPadding ?? cards.padding
    : displayFrame.style.padding;
  return {
    frameTitleItem,
    frameBodyItem,
    flowBlocks,
    flowBlockFor,
    flowTitleBlock,
    flowTitleFontSize,
    flowNameFontSize,
    flowContentStart,
    customFrameItems,
    horizontalPadding,
  };
}
