import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, RotateCcw } from "lucide-react";
import type { CardFontField, CardSettings } from "../../lib/scene-document";
import { CANVAS_LAYER_Z, CANVAS_LAYER_Z_RANGE } from "../../lib/scene-document";
import { EDGE_STYLE_OPTIONS, type EdgeStyle } from "../../lib/edge-styles";
import { DEFAULT_FONT_ID, type UserFont } from "../../lib/fonts";
import { DeferredInput } from "../DeferredInput";
import { FontEditor } from "../FontEditor";
import { ActionGroup, IconButton, InspectorHeader } from "../StudioUi";

const fields: Array<{ id: "name" | "university" | "city"; label: string }> = [
  { id: "name", label: "姓名" },
  { id: "university", label: "院校" },
  { id: "city", label: "城市" },
];
const fontFields: Array<{ id: CardFontField; label: string }> = [
  { id: "title", label: "标题" },
  { id: "name", label: "姓名" },
  { id: "university", label: "院校" },
  { id: "city", label: "城市" },
];

export function CardsInspector({ cards, userFonts = [], onPatch, onReset, mode = "all", collapsible = false }: {
  cards: CardSettings;
  userFonts?: UserFont[];
  onPatch: (patch: Partial<CardSettings>) => void;
  onReset: () => void;
  mode?: "all" | "global" | "placement";
  /** 折叠低频设置（内容表达、留白细节、字段字体、线条纹理、显示字段）。 */
  collapsible?: boolean;
}) {

  const number = (key: "x" | "y" | "maxWidth" | "padding" | "horizontalPadding" | "bottomPadding" | "gap" | "fontSize", value: number, min: number, max: number, label: string) => {
    const id = key === "fontSize" ? "font-size" : key === "horizontalPadding" ? "horizontal-padding" : key === "bottomPadding" ? "bottom-padding" : key;
    return (
    <label htmlFor={`cards-${id}`}>{label}
      <DeferredInput id={`cards-${id}`} type="number" min={min} max={max} value={value} onCommit={(draft) => {
        const next = Number(draft);
        if (Number.isFinite(next) && next >= min && next <= max) onPatch({ [key]: next });
      }} />
    </label>
    );
  };
  const setFieldFont = (field: CardFontField, fontId: string) => {
    const next = { ...(cards.fieldFonts ?? {}) };
    if (!fontId) delete next[field];
    else next[field] = fontId;
    onPatch({ fieldFonts: next });
  };
  const setUnifiedFont = (fontId: string) => {
    if (!fontId) {
      onPatch({ fieldFonts: {} });
      return;
    }
    onPatch({
      fieldFonts: {
        title: fontId,
        name: fontId,
        university: fontId,
        city: fontId,
      },
    });
  };
  const unifiedFont = (() => {
    const values = fontFields.map(({ id }) => cards.fieldFonts?.[id] ?? "");
    const first = values[0] ?? "";
    return values.every((value) => value === first) ? first : "";
  })();
  const fieldFontControls = (
    <fieldset className="cards-field-fonts">
      <legend>字段字体</legend>
      {fontFields.map(({ id, label }) => (
        <FontEditor
          key={id}
          id={`cards-font-${id}`}
          label={label}
          fontId={cards.fieldFonts?.[id] ?? DEFAULT_FONT_ID}
          fontSize={cards.fieldTypography?.[id]?.fontSize ?? cards.fontSize}
          color={cards.fieldTypography?.[id]?.color ?? cards.textColor}
          userFonts={userFonts}
          min={8}
          max={48}
          onFontChange={(fontId) => setFieldFont(id, fontId)}
          onSizeChange={(fontSize) => onPatch({ fieldTypography: { ...cards.fieldTypography, [id]: { ...cards.fieldTypography?.[id], fontSize } } })}
        />
      ))}
    </fieldset>
  );
  const layerControl = () => (
    <>
      <label htmlFor="cards-zindex">层级
        <DeferredInput id="cards-zindex" type="number" min={CANVAS_LAYER_Z_RANGE.min} max={CANVAS_LAYER_Z_RANGE.max} step={1} value={cards.zIndex ?? CANVAS_LAYER_Z.cards} onCommit={(draft) => {
          const next = Number(draft);
          if (Number.isFinite(next)) onPatch({ zIndex: Math.floor(next) });
        }} />
      </label>
      <ActionGroup label="数据框层级" className="inspector-actions">
        <IconButton label="数据框上移" text="上移" icon={<ArrowUp size={14} />} onClick={() => onPatch({ zIndex: Math.min(CANVAS_LAYER_Z_RANGE.max, (cards.zIndex ?? CANVAS_LAYER_Z.cards) + 1) })} />
        <IconButton label="数据框下移" text="下移" icon={<ArrowDown size={14} />} onClick={() => onPatch({ zIndex: Math.max(CANVAS_LAYER_Z_RANGE.min, (cards.zIndex ?? CANVAS_LAYER_Z.cards) - 1) })} />
        <IconButton label="数据框置顶" text="置顶" icon={<ChevronsUp size={14} />} onClick={() => onPatch({ zIndex: CANVAS_LAYER_Z_RANGE.max })} />
        <IconButton label="数据框置底" text="置底" icon={<ChevronsDown size={14} />} onClick={() => onPatch({ zIndex: CANVAS_LAYER_Z_RANGE.min })} />
      </ActionGroup>
      <p className="property-panel__hint">数值越大越靠上。参照：地图 0 · 嘉宾面板 20 · 装饰素材 30 · 文本 40。置顶/置底即相对全部画布层。</p>
    </>
  );

  if (mode === "placement") return <section className="property-panel"><InspectorHeader title="数据框位置与尺寸" />{number("x", cards.x, 0, 6000, "X")}{number("y", cards.y, 0, 6000, "Y")}{number("maxWidth", cards.maxWidth, 80, 6000, "卡片宽度（画布像素）")}{layerControl()}</section>;

  const advancedControls = (
    <>
      {number("padding", cards.padding, 0, 120, "顶部留白")}{number("horizontalPadding", cards.horizontalPadding ?? cards.padding, 0, 240, "左右留白")}{number("bottomPadding", cards.bottomPadding ?? cards.padding, 0, 240, "底部留白")}{number("gap", cards.gap, 0, 120, "间距")}
      <label htmlFor="cards-connector-dash">线条纹理
        <select id="cards-connector-dash" value={cards.connectorDash} onChange={(event) => onPatch({ connectorDash: event.target.value as EdgeStyle })}>
          {EDGE_STYLE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <fieldset><legend>显示字段</legend>{fields.map((field) => <label key={field.id} htmlFor={`cards-visible-${field.id}`}>{field.label}<input id={`cards-visible-${field.id}`} type="checkbox" checked={cards.visibleFields.includes(field.id)} onChange={() => onPatch({ visibleFields: cards.visibleFields.includes(field.id) ? cards.visibleFields.filter((item) => item !== field.id) : [...cards.visibleFields, field.id] })} /></label>)}</fieldset>
      <fieldset><legend>不分行字段</legend>{fields.map((field) => <label key={field.id} htmlFor={`cards-nowrap-${field.id}`}>{field.label}<input id={`cards-nowrap-${field.id}`} type="checkbox" checked={(cards.noWrapFields ?? []).includes(field.id)} disabled={!cards.visibleFields.includes(field.id)} onChange={() => onPatch({ noWrapFields: (cards.noWrapFields ?? []).includes(field.id) ? (cards.noWrapFields ?? []).filter((item) => item !== field.id) : [...(cards.noWrapFields ?? []), field.id] })} /></label>)}
        <p className="property-panel__hint">勾选后该字段内容在卡片内保持完整，不会被拆到两行。</p></fieldset>
    </>
  );

  return <section className="property-panel"><InspectorHeader title="卡片属性" actions={<IconButton label="重置卡片" icon={<RotateCcw size={15} />} variant="ghost" onClick={onReset} />} />
    <label htmlFor="cards-preset">视觉样式<select id="cards-preset" value={cards.preset === "compact" ? "standard" : cards.preset} onChange={(event) => onPatch({ preset: event.target.value as CardSettings["preset"] })}><option value="standard">标准</option><option value="ticket">票券</option><option value="photo">照片</option><option value="borderless">无边框</option></select></label>
    <label htmlFor="cards-compact-layout" className="checkbox-row"><input id="cards-compact-layout" type="checkbox" checked={cards.compactLayout === true || cards.preset === "compact"} onChange={(event) => onPatch({ compactLayout: event.target.checked })} />紧凑排版</label>
    <label htmlFor="cards-show-count" className="checkbox-row"><input id="cards-show-count" type="checkbox" checked={cards.showCount !== false} onChange={(event) => onPatch({ showCount: event.target.checked })} />显示人数</label>
    <label htmlFor="cards-grouping">分组<select id="cards-grouping" value={cards.grouping} onChange={(event) => onPatch({ grouping: event.target.value as CardSettings["grouping"] })}><option value="province">省份</option><option value="city">城市</option><option value="university">院校</option></select></label>
    <label htmlFor="cards-city-subgroups" className="checkbox-row"><input id="cards-city-subgroups" type="checkbox" checked={cards.citySubgroups !== false} disabled={cards.grouping !== "province"} onChange={(event) => onPatch({ citySubgroups: event.target.checked })} />省份卡片内按城市分类</label>
    <label htmlFor="cards-layout-mode">排布方式<select id="cards-layout-mode" value={cards.layoutMode ?? "quadrant"} onChange={(event) => onPatch({ layoutMode: event.target.value as CardSettings["layoutMode"] })}><option value="quadrant">四象限（默认）</option><option value="radial">极角环绕</option><option value="right-stack">右侧单列</option><option value="grid">边缘网格</option></select></label>
    <label htmlFor="cards-auto-balance" className="checkbox-row"><input id="cards-auto-balance" type="checkbox" checked={cards.autoBalance !== false} disabled={(cards.layoutMode ?? "quadrant") !== "quadrant"} onChange={() => onPatch({ autoBalance: cards.autoBalance === false })} />自动平衡左右</label>
    <label htmlFor="cards-allow-map-overlap" className="checkbox-row"><input id="cards-allow-map-overlap" type="checkbox" checked={cards.allowMapOverlap === true} onChange={(event) => onPatch({ allowMapOverlap: event.target.checked })} />允许卡片覆盖地图</label>
    <label htmlFor="cards-show-province-texture" className="checkbox-row"><input id="cards-show-province-texture" type="checkbox" checked={cards.showProvinceTexture === true} onChange={(event) => onPatch({ showProvinceTexture: event.target.checked })} />数据框显示省份贴图</label>
    {mode !== "global" && <>{number("x", cards.x, 0, 6000, "X")}{number("y", cards.y, 0, 6000, "Y")}{number("maxWidth", cards.maxWidth, 80, 6000, "卡片宽度（画布像素）")}</>}
    {mode !== "global" && layerControl()}
    <label htmlFor="cards-columns">列数<select id="cards-columns" value={cards.columns} onChange={(event) => onPatch({ columns: event.target.value === "auto" ? "auto" : Number(event.target.value) })}><option value="auto">自动</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
    <label htmlFor="cards-background">背景色<DeferredInput id="cards-background" type="color" value={cards.background} onCommit={(background) => onPatch({ background })} /></label>
    <label htmlFor="cards-opacity">背景透明度<DeferredInput id="cards-opacity" type="range" min="0" max="1" step="0.05" value={cards.opacity} onCommit={(opacity) => onPatch({ opacity: Number(opacity) })} /></label>
    <label htmlFor="cards-text-color">文字色<DeferredInput id="cards-text-color" type="color" value={cards.textColor} onCommit={(textColor) => onPatch({ textColor })} /></label>
    <FontEditor
      id="cards-font"
      sizeId="cards-font-size"
      label="统一字体"
      fontId={unifiedFont}
      fontSize={cards.fontSize}
      color={cards.textColor}
      userFonts={userFonts}
      min={8}
      max={48}
      onFontChange={setUnifiedFont}
      onSizeChange={(fontSize) => onPatch({ fontSize })}
    />
    {fieldFontControls}
    <label htmlFor="cards-connector-style">连接线<select id="cards-connector-style" value={cards.connectorStyle} onChange={(event) => onPatch({ connectorStyle: event.target.value as CardSettings["connectorStyle"] })}><option value="straight">直线</option><option value="elbow">折线</option><option value="curve">曲线</option></select></label>
    <label htmlFor="cards-connector-color">线条颜色<DeferredInput id="cards-connector-color" type="color" value={cards.connectorColor} onCommit={(connectorColor) => onPatch({ connectorColor })} /></label>
    <label htmlFor="cards-connector-width">线条粗细<DeferredInput id="cards-connector-width" type="number" min="0.5" max="8" step="0.5" value={cards.connectorWidth} onCommit={(connectorWidth) => onPatch({ connectorWidth: Number(connectorWidth) })} /></label>
    {collapsible
      ? <details className="property-panel__advanced"><summary>高级设置</summary>{advancedControls}</details>
      : advancedControls}
  </section>;
}
