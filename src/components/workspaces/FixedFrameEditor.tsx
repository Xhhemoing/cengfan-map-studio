import type { DisplayFrameDefinition, DisplayFrameFixedItem, DisplayFrameField } from "../../lib/display-frame";

const FIELD_LABELS: Record<DisplayFrameField, string> = { title: "标题", name: "姓名", university: "院校", city: "城市" };

export function FixedFrameEditor({ frame, onChange }: { frame: DisplayFrameDefinition; onChange: (next: DisplayFrameDefinition) => void }) {
  const updateItem = (id: string, patch: Partial<DisplayFrameFixedItem>) => onChange({
    ...frame,
    fixed: { items: frame.fixed.items.map((item) => item.id === id ? { ...item, ...patch } : item) },
  });

  return (
    <section className="display-frame-editor" aria-label="固定自由排布编辑器">
      <div className="display-frame-editor__heading"><strong>局部排布</strong><small>展示框内部坐标，不改变海报上的数据框位置</small></div>
      <div className="display-frame-item-list">
        {frame.fixed.items.map((item) => (
          <fieldset key={item.id} className="display-frame-item">
            <legend>{FIELD_LABELS[item.field ?? "title"] ?? item.id}</legend>
            <div className="display-frame-item__grid">
              <label htmlFor={`display-frame-fixed-${item.id}-x`}>局部 X<input id={`display-frame-fixed-${item.id}-x`} type="number" value={item.x} onChange={(event) => updateItem(item.id, { x: Number(event.currentTarget.value) })} /></label>
              <label htmlFor={`display-frame-fixed-${item.id}-y`}>局部 Y<input id={`display-frame-fixed-${item.id}-y`} type="number" value={item.y} onChange={(event) => updateItem(item.id, { y: Number(event.currentTarget.value) })} /></label>
              <label htmlFor={`display-frame-fixed-${item.id}-width`}>宽度<input id={`display-frame-fixed-${item.id}-width`} type="number" min={1} value={item.width} onChange={(event) => updateItem(item.id, { width: Number(event.currentTarget.value) })} /></label>
              <label htmlFor={`display-frame-fixed-${item.id}-height`}>高度<input id={`display-frame-fixed-${item.id}-height`} type="number" min={1} value={item.height} onChange={(event) => updateItem(item.id, { height: Number(event.currentTarget.value) })} /></label>
              <label htmlFor={`display-frame-fixed-${item.id}-z`}>层级<input id={`display-frame-fixed-${item.id}-z`} type="number" value={item.zIndex} onChange={(event) => updateItem(item.id, { zIndex: Number(event.currentTarget.value) })} /></label>
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}
