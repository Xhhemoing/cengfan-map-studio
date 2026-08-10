import type { CardSettings } from "../lib/scene-document";
import { EDGE_STYLE_OPTIONS, type EdgeStyle } from "../lib/edge-styles";
import { DeferredInput } from "./DeferredInput";
import { PanelHeader } from "./StudioUi";

export function BlockStylePanel({ cards, onPatch }: {
  cards: CardSettings;
  onPatch: (patch: Partial<CardSettings>) => void;
}) {
  const number = (key: "opacity" | "fontSize" | "gap" | "padding" | "horizontalPadding" | "bottomPadding" | "maxWidth" | "connectorWidth", value: number, min: number, max: number, id: string) => (
    <DeferredInput id={id} type="number" min={min} max={max} step={key === "opacity" ? 0.05 : key === "connectorWidth" ? 0.5 : 1} value={value} onCommit={(draft) => {
      const next = Number(draft);
      if (Number.isFinite(next) && next >= min && next <= max) onPatch({ [key]: next });
    }} />
  );
  const color = (key: "background" | "textColor" | "connectorColor", value: string, id: string) => (
    <DeferredInput id={id} type="color" value={value} onCommit={(next) => onPatch({ [key]: next })} />
  );
  return (
    <div className="block-style-panel">
      <PanelHeader title="板块样式" meta="卡片与连接线" />

      <div className="block-style-section">
        <h3>卡片格式</h3>
        <label htmlFor="block-card-preset">视觉样式
          <select id="block-card-preset" value={cards.preset === "compact" ? "standard" : cards.preset} onChange={(event) => onPatch({ preset: event.target.value as CardSettings["preset"] })}>
            <option value="standard">标准</option>
            <option value="ticket">票券</option>
            <option value="photo">照片</option>
            <option value="borderless">无边框</option>
          </select>
        </label>
        <label htmlFor="block-card-compact" className="boolean-control checkbox-row">
          <input id="block-card-compact" type="checkbox" checked={cards.compactLayout === true || cards.preset === "compact"} onChange={(event) => onPatch({ compactLayout: event.target.checked })} />
          紧凑排版
        </label>
        <label htmlFor="block-card-allow-map-overlap" className="boolean-control checkbox-row">
          <input id="block-card-allow-map-overlap" type="checkbox" checked={cards.allowMapOverlap === true} onChange={(event) => onPatch({ allowMapOverlap: event.target.checked })} />
          允许卡片覆盖地图
        </label>
        <label htmlFor="block-card-show-province-texture" className="boolean-control checkbox-row">
          <input id="block-card-show-province-texture" type="checkbox" checked={cards.showProvinceTexture === true} onChange={(event) => onPatch({ showProvinceTexture: event.target.checked })} />
          数据框显示省份贴图
        </label>
        <label htmlFor="block-card-show-count" className="boolean-control checkbox-row">
          <input id="block-card-show-count" type="checkbox" checked={cards.showCount !== false} onChange={(event) => onPatch({ showCount: event.target.checked })} />
          显示人数
        </label>
        <label htmlFor="block-card-grouping">分组方式
          <select id="block-card-grouping" value={cards.grouping} onChange={(event) => onPatch({ grouping: event.target.value as CardSettings["grouping"] })}>
            <option value="province">省份</option>
            <option value="city">城市</option>
            <option value="university">院校</option>
          </select>
        </label>
        <div className="block-style-colors">
          <label htmlFor="block-card-background">背景色{color("background", cards.background, "block-card-background")}</label>
          <label htmlFor="block-card-text-color">文字色{color("textColor", cards.textColor, "block-card-text-color")}</label>
        </div>
        <label htmlFor="block-card-opacity">背景透明度
          <DeferredInput id="block-card-opacity" type="range" min="0" max="1" step="0.05" value={cards.opacity} onCommit={(draft) => onPatch({ opacity: Number(draft) })} />
        </label>
        <div className="block-style-grid">
          <label htmlFor="block-card-font-size">统一字号{number("fontSize", cards.fontSize, 8, 48, "block-card-font-size")}</label>
          <label htmlFor="block-card-gap">卡片间距{number("gap", cards.gap, 0, 120, "block-card-gap")}</label>
          <label htmlFor="block-card-padding">顶部留白{number("padding", cards.padding, 0, 120, "block-card-padding")}</label>
          <label htmlFor="block-card-horizontal-padding">左右留白{number("horizontalPadding", cards.horizontalPadding ?? cards.padding, 0, 240, "block-card-horizontal-padding")}</label>
          <label htmlFor="block-card-bottom-padding">底部留白{number("bottomPadding", cards.bottomPadding ?? cards.padding, 0, 240, "block-card-bottom-padding")}</label>
          <label htmlFor="block-card-width">卡片宽度（画布像素）{number("maxWidth", cards.maxWidth, 80, 6000, "block-card-width")}</label>
        </div>
      </div>

      <div className="block-style-section">
        <h3>连接线格式</h3>
        <label htmlFor="block-connector-style">线条形状
          <select id="block-connector-style" value={cards.connectorStyle} onChange={(event) => onPatch({ connectorStyle: event.target.value as CardSettings["connectorStyle"] })}>
            <option value="straight">直线</option>
            <option value="elbow">折线</option>
            <option value="curve">曲线</option>
          </select>
        </label>
        <label htmlFor="block-connector-dash">线条纹理
          <select id="block-connector-dash" value={cards.connectorDash} onChange={(event) => onPatch({ connectorDash: event.target.value as EdgeStyle })}>
            {EDGE_STYLE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label} · {option.description}</option>
            ))}
          </select>
        </label>
        <div className="block-style-grid">
          <label htmlFor="block-connector-color">线条颜色{color("connectorColor", cards.connectorColor, "block-connector-color")}</label>
          <label htmlFor="block-connector-width">线条粗细{number("connectorWidth", cards.connectorWidth, 0.5, 8, "block-connector-width")}</label>
        </div>
        <p className="panel-note">连接线纹理与省界纹理共用同一套风格（实线 / 虚线 / 柔光 / 轨道 / 水纹等）。</p>
      </div>
    </div>
  );
}
