import type { DisplayFrameFixedItem, DisplayFrameStyle } from "../../lib/display-frame";
import { DeferredInput } from "../DeferredInput";

function labelForItem(item: DisplayFrameFixedItem): string {
  if (item.kind === "field") return ({ title: "标题", name: "姓名", university: "院校", city: "城市" } as const)[item.field ?? "title"];
  if (item.kind === "text") return item.content || "自定义文字";
  return item.decoration === "line" ? "分隔线" : "矩形装饰";
}

export function DisplayFrameItemInspector({
  item,
  frameStyle,
  onChange,
}: {
  item: DisplayFrameFixedItem | null;
  frameStyle: DisplayFrameStyle;
  onChange: (patch: Partial<DisplayFrameFixedItem>) => void;
}) {
  if (!item) {
    return <section className="display-frame-item-inspector" aria-label="当前图层属性"><p>从图层或子画布选择元素。</p></section>;
  }
  const style = item.style ?? {};
  const updateStyle = (patch: NonNullable<DisplayFrameFixedItem["style"]>) => onChange({ style: { ...style, ...patch } });
  return (
    <section className="display-frame-item-inspector" aria-label="当前图层属性">
      <div className="display-frame-item-inspector__heading"><strong>{labelForItem(item)}</strong><small>{item.kind === "field" ? "字段图层" : item.kind === "text" ? "文字图层" : "装饰图层"}</small></div>
      {item.kind === "text" && (
        <label htmlFor="display-frame-item-content">文字内容
          <DeferredInput id="display-frame-item-content" value={item.content ?? ""} onCommit={(content) => onChange({ content })} />
        </label>
      )}
      <div className="display-frame-item-inspector__grid">
        <div className="display-frame-item__pair property-panel__pair" data-property-pair={`${item.id}-position`}>
          <label htmlFor={`display-frame-fixed-${item.id}-x`}>局部 X<DeferredInput id={`display-frame-fixed-${item.id}-x`} type="number" min={0} value={item.x} onCommit={(value) => onChange({ x: Number(value) })} /></label>
          <label htmlFor={`display-frame-fixed-${item.id}-y`}>局部 Y<DeferredInput id={`display-frame-fixed-${item.id}-y`} type="number" min={0} value={item.y} onCommit={(value) => onChange({ y: Number(value) })} /></label>
        </div>
        <div className="display-frame-item__pair property-panel__pair" data-property-pair={`${item.id}-size`}>
          <label htmlFor={`display-frame-fixed-${item.id}-width`}>宽度<DeferredInput id={`display-frame-fixed-${item.id}-width`} type="number" min={1} value={item.width} onCommit={(value) => onChange({ width: Number(value) })} /></label>
          <label htmlFor={`display-frame-fixed-${item.id}-height`}>高度<DeferredInput id={`display-frame-fixed-${item.id}-height`} type="number" min={1} value={item.height} onCommit={(value) => onChange({ height: Number(value) })} /></label>
        </div>
        <label htmlFor={`display-frame-fixed-${item.id}-z`}>层级<DeferredInput id={`display-frame-fixed-${item.id}-z`} type="number" value={item.zIndex} onCommit={(value) => onChange({ zIndex: Number(value) })} /></label>
      </div>
      {item.kind !== "decoration" && (
        <div className="display-frame-item-inspector__grid">
          <label htmlFor="display-frame-item-font-size">字号<DeferredInput id="display-frame-item-font-size" type="number" min={8} max={240} value={style.fontSize ?? frameStyle.fontSize} onCommit={(value) => updateStyle({ fontSize: Number(value) })} /></label>
          <label htmlFor="display-frame-item-color">文字色<DeferredInput id="display-frame-item-color" type="color" value={style.color ?? frameStyle.color} onCommit={(value) => updateStyle({ color: value })} /></label>
          <label htmlFor="display-frame-item-weight">字重<select id="display-frame-item-weight" value={style.fontWeight ?? "normal"} onChange={(event) => updateStyle({ fontWeight: event.target.value as "normal" | "medium" | "bold" })}><option value="normal">常规</option><option value="medium">中等</option><option value="bold">粗体</option></select></label>
          <label htmlFor="display-frame-item-align">对齐<select id="display-frame-item-align" value={style.align ?? frameStyle.align} onChange={(event) => updateStyle({ align: event.target.value as "left" | "center" | "right" })}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
        </div>
      )}
      {item.kind === "decoration" && (
        <div className="display-frame-item-inspector__grid">
          <label htmlFor="display-frame-item-color">描边色<DeferredInput id="display-frame-item-color" type="color" value={style.color ?? frameStyle.color} onCommit={(value) => updateStyle({ color: value })} /></label>
          <label htmlFor="display-frame-item-stroke">描边宽<DeferredInput id="display-frame-item-stroke" type="number" min={0} max={24} value={style.strokeWidth ?? 1} onCommit={(value) => updateStyle({ strokeWidth: Number(value) })} /></label>
          {item.decoration === "rectangle" && <label htmlFor="display-frame-item-fill">填充色<DeferredInput id="display-frame-item-fill" type="color" value={style.fill ?? "#ffffff"} onCommit={(value) => updateStyle({ fill: value })} /></label>}
        </div>
      )}
    </section>
  );
}
