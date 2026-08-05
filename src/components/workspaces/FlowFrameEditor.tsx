import type { DisplayFrameDefinition, DisplayFrameFlowBlock, DisplayFrameField } from "../../lib/display-frame";

const FIELD_LABELS: Record<DisplayFrameField, string> = { title: "标题", name: "姓名", university: "院校", city: "城市" };

export function FlowFrameEditor({ frame, onChange }: { frame: DisplayFrameDefinition; onChange: (next: DisplayFrameDefinition) => void }) {
  const updateBlock = (id: string, patch: Partial<DisplayFrameFlowBlock>) => onChange({
    ...frame,
    flow: { blocks: frame.flow.blocks.map((block) => block.id === id ? { ...block, ...patch } : block) },
  });

  return (
    <section className="display-frame-editor" aria-label="固定排版连续文字编辑器">
      <div className="display-frame-editor__heading"><strong>连续文字布局</strong><small>字段按顺序连续排版，使用间距和行高控制节奏</small></div>
      <div className="display-frame-flow-preview" aria-label="连续文字布局预览">
        {frame.flow.blocks.slice().sort((a, b) => a.order - b.order).map((block) => (
          <span key={block.id}>{FIELD_LABELS[block.field ?? "title"] ?? block.content ?? block.id}</span>
        ))}
      </div>
      <div className="display-frame-item-list">
        {frame.flow.blocks.slice().sort((a, b) => a.order - b.order).map((block) => (
          <fieldset key={block.id} className="display-frame-item">
            <legend>{FIELD_LABELS[block.field ?? "title"] ?? block.id}</legend>
            <div className="display-frame-item__grid">
              <label htmlFor={`display-frame-flow-${block.id}-order`}>顺序<input id={`display-frame-flow-${block.id}-order`} type="number" value={block.order} onChange={(event) => updateBlock(block.id, { order: Number(event.currentTarget.value) })} /></label>
              <label htmlFor={`display-frame-flow-${block.id}-spacing`}>间距<input id={`display-frame-flow-${block.id}-spacing`} type="number" min={0} value={block.spacing} onChange={(event) => updateBlock(block.id, { spacing: Number(event.currentTarget.value) })} /></label>
              <label htmlFor={`display-frame-flow-${block.id}-line-height`}>行高<input id={`display-frame-flow-${block.id}-line-height`} type="number" min={0.8} max={2.5} step={0.1} value={block.lineHeight} onChange={(event) => updateBlock(block.id, { lineHeight: Number(event.currentTarget.value) })} /></label>
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}
