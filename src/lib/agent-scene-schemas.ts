import { alternative, array, dictionary, flag, object, oneOf, scalar, text, type ValueSchema } from './agent-value-schema';
import { EDGE_STYLES } from './edge-styles';

const pixel = { ...scalar(1, 16384), description: 'Canvas pixels; positive finite number.' };
const position = scalar();
const spacing = scalar(0, 4096);
const opacity = scalar(0, 1);
const fontSize = scalar(1, 512);
const fontField = oneOf('title', 'name', 'university', 'city');
const field = oneOf('name', 'university', 'city');
const align = oneOf('left', 'center', 'right');
const fit = oneOf('cover', 'contain', 'stretch');
const edge = oneOf(...EDGE_STYLES);
const typography = object({ fontSize, color: text });
const appearance = alternative(
  object({ kind: oneOf('manual-color'), color: text }, ['kind', 'color']),
  object({ kind: oneOf('feature', 'texture'), assetId: text, src: text, fit: oneOf('cover', 'contain'),
    scale: scalar(0.05, 20), opacity, overflow: flag, sizingMode: oneOf('province', 'natural', 'custom'),
    naturalWidth: pixel, naturalHeight: pixel, customWidth: pixel, customHeight: pixel, offsetX: position, offsetY: position }, ['kind', 'assetId', 'src', 'fit']),
);
const province = { fill: text, textureSrc: text, visible: flag, labelFontId: text, appearance };
const itemStyle = object({ fontId: text, fontSize, color: text, fontWeight: oneOf('normal', 'medium', 'bold'), align, fill: text, strokeWidth: spacing, opacity });
const commonItem = { id: text, field: fontField, content: text, style: itemStyle, fontId: text, fontSize, color: text };
const displayFrame = object({ mode: oneOf('fixed', 'flow'),
  style: object({ fontId: text, fontSize, color: text, background: text, opacity, padding: spacing, margin: spacing, align, borderColor: text, borderWidth: spacing, borderRadius: spacing }),
  fieldOrder: array(fontField),
  fixed: object({ items: array(object({ ...commonItem, kind: oneOf('field', 'text', 'decoration'), decoration: oneOf('line', 'rectangle'),
    x: position, y: position, width: pixel, height: pixel, zIndex: scalar(-1000, 1000) })) }),
  flow: object({ blocks: array(object({ ...commonItem, kind: oneOf('field', 'text'), order: scalar(0, 1000, true), spacing, lineHeight: scalar(0.1, 10) })) }),
});
const renderSource = alternative(
  object({ kind: oneOf('vector') }, ['kind']),
  object({ kind: oneOf('image'), assetId: text, src: text, fit, opacity, composition: oneOf('replace', 'overlay'), clipToMap: flag, zIndex: scalar(-1000, 1000),
    alignment: object({ sourceWidth: pixel, sourceHeight: pixel, sourceBounds: object({ x: opacity, y: opacity, width: opacity, height: opacity }),
      x: position, y: position, width: pixel, height: pixel, rotation: scalar(-360, 360) }) }, ['kind', 'assetId', 'src', 'fit', 'opacity']),
);

/** The property names AND value rules are the same for server plans and browser execution. */
export const SCENE_SCHEMAS: Record<'canvas' | 'map' | 'province' | 'cards' | 'guests' | 'text' | 'asset', Record<string, ValueSchema>> = {
  canvas: { width: pixel, height: pixel, safeMargin: spacing, backgroundColor: text, backgroundImageSrc: text, backgroundFit: fit, backgroundOpacity: opacity, lineHeight: scalar(0.1, 10) },
  map: { x: position, y: position, width: pixel, height: pixel, scale: { ...scalar(0.1, 3), description: 'Scale multiplier, matching the map inspector.' },
    zIndex: scalar(-100, 100, true), opacity, landColor: text, activeColor: text, edgeColor: text, edgeStyle: edge, edgeWidth: spacing,
    showProvinceLabels: flag, provinceLabelFontId: text, provinceLabelTypography: typography, collapseSouthChinaSea: flag,
    fillMode: oneOf('heat', 'manual'), heatScale: object({ minDepth: scalar(0, 999, true), maxDepth: scalar(0, 999, true), lowColor: text, highColor: text }),
    emptyProvinceFill: oneOf('land-color', 'transparent'), renderSource, provinceStyles: dictionary(object(province)),
    provinceTextureUniformSize: object({ enabled: flag, width: pixel, height: pixel }), mapBoundaryMargin: spacing },
  province,
  cards: { preset: oneOf('standard', 'compact', 'ticket', 'photo', 'borderless'), displayFrame, compactLayout: flag, x: position, y: position,
    maxWidth: pixel, padding: spacing, horizontalPadding: spacing, bottomPadding: spacing, gap: spacing, columns: alternative(oneOf('auto'), scalar(1, 100, true)),
    background: text, opacity, textColor: text, fontSize,
    fieldFonts: object({ title: text, name: text, university: text, city: text }),
    fieldTypography: object({ title: typography, name: typography, university: typography, city: typography }),
    connectorStyle: oneOf('straight', 'elbow', 'curve'), connectorColor: text, connectorWidth: spacing, connectorDash: edge,
    visibleFields: array(field), noWrapFields: array(field), citySubgroups: flag,
    expressionTemplates: object({ title: text, city: text, row: text }), nameFormat: text, layoutMode: oneOf('quadrant', 'radial', 'right-stack', 'grid'),
    autoBalance: flag, allowMapOverlap: flag, showProvinceTexture: flag, showCount: flag, zIndex: scalar(-100, 100, true) },
  guests: { title: text, x: position, y: position, width: pixel, padding: spacing, background: text, opacity, textColor: text, fontSize,
    titleFontId: text, peopleFontId: text, titleTypography: typography, peopleTypography: typography,
    displayMode: oneOf('list', 'cards'), customText: text, visibility: flag,
    people: array(object({ id: text, name: text, title: text, note: text, avatarSrc: text, fontId: text, visibility: flag }, ['id', 'name', 'visibility'])) },
  text: { role: oneOf('eyebrow', 'title', 'subtitle', 'stats', 'watermark', 'note', 'custom'), content: text, x: position, y: position,
    fontSize, color: text, fontWeight: scalar(1, 1000, true), fontId: text, textAlign: align, maxWidth: pixel, visibility: flag },
  asset: { assetId: text, label: text, kind: oneOf('province-texture', 'landmark', 'decoration'), province: text, x: position, y: position,
    width: pixel, height: pixel, rotation: scalar(-360, 360), opacity, zIndex: scalar(-1000, 1000, true), visibility: flag },
};
