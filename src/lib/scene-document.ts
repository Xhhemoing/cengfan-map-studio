/**
 * 场景文档的公共入口（facade）。实现拆分为：
 * - `scene-document-types.ts`：类型与常量
 * - `scene-document-factories.ts`：默认场景/嘉宾面板工厂
 * - `scene-document-normalize.ts`：归一化与兼容旧项目字段
 * - `scene-document-update.ts`：按选中目标应用补丁
 */
export {
  CANVAS_LAYER_Z,
  CANVAS_LAYER_Z_RANGE,
  CARD_LAYOUT_MODES,
  DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE,
} from "./scene-document-types";

export type {
  AssetElement,
  CanvasSettings,
  CanvasText,
  CanvasTextRole,
  CardFontField,
  CardLayoutModeValue,
  CardPresentation,
  CardSettings,
  GuestPanelSettings,
  GuestPerson,
  HeatScale,
  MapImageAlignment,
  MapImageComposition,
  MapRenderSource,
  MapSettings,
  ProvinceAppearance,
  ProvinceStyle,
  ProvinceTextureUniformSize,
  SceneDocument,
  SceneSelection,
  TextAlign,
  TextStyleOverride,
} from "./scene-document-types";

export { createDefaultGuestPanel, createDefaultScene } from "./scene-document-factories";

export {
  normalizeFieldFonts,
  normalizeGuestPanel,
  normalizeLayoutMode,
  normalizeNoWrapFields,
  normalizeScene,
} from "./scene-document-normalize";

export { updateSceneTarget } from "./scene-document-update";
