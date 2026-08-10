import { useState } from "react";
import {
  clampDisplayFrameItem,
  createDisplayFrameDecorationItem,
  createDisplayFrameTextItem,
  type DisplayFrameDefinition,
  type DisplayFrameFixedItem,
} from "../../lib/display-frame";
import { DisplayFrameItemInspector } from "./DisplayFrameItemInspector";
import { DisplayFrameLayerList } from "./DisplayFrameLayerList";
import { DisplayFrameSubcanvas } from "./DisplayFrameSubcanvas";

export function FixedFrameEditor({ frame, onChange }: { frame: DisplayFrameDefinition; onChange: (next: DisplayFrameDefinition) => void }) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(frame.fixed.items[0]?.id ?? null);
  const selectedItemIdStillValid = selectedItemId !== null && frame.fixed.items.some((item) => item.id === selectedItemId);
  const effectiveSelectedItemId = selectedItemIdStillValid ? selectedItemId : (frame.fixed.items[0]?.id ?? null);
  const selectedItem = effectiveSelectedItemId ? frame.fixed.items.find((item) => item.id === effectiveSelectedItemId) ?? null : null;

  const updateItem = (id: string, patch: Partial<DisplayFrameFixedItem>) => onChange({
    ...frame,
    fixed: { items: frame.fixed.items.map((item) => item.id === id ? clampDisplayFrameItem({ ...item, ...patch }) : item) },
  });
  const addItem = (item: DisplayFrameFixedItem) => {
    onChange({ ...frame, fixed: { items: [...frame.fixed.items, item] } });
    setSelectedItemId(item.id);
  };
  const removeSelected = () => {
    if (!selectedItem || selectedItem.kind === "field") return;
    const items = frame.fixed.items.filter((item) => item.id !== selectedItem.id);
    onChange({ ...frame, fixed: { items } });
    setSelectedItemId(items[0]?.id ?? null);
  };

  return (
    <section className="display-frame-editor" aria-label="固定自由排布编辑器">
      <div className="display-frame-editor__heading"><strong>局部排布</strong><small>展示框内部坐标，不改变海报上的数据框位置</small></div>
      <div className="display-frame-editor__workbench">
        <DisplayFrameLayerList
          items={frame.fixed.items}
          selectedItemId={effectiveSelectedItemId}
          onSelect={setSelectedItemId}
          onAddText={() => addItem(createDisplayFrameTextItem(frame))}
          onAddLine={() => addItem(createDisplayFrameDecorationItem(frame, "line"))}
          onAddRectangle={() => addItem(createDisplayFrameDecorationItem(frame, "rectangle"))}
          onRemove={removeSelected}
        />
        <DisplayFrameSubcanvas frame={frame} selectedItemId={selectedItemId} onSelectItem={(id) => setSelectedItemId(id || null)} onChangeItem={updateItem} />
        <DisplayFrameItemInspector item={selectedItem} frameStyle={frame.style} onChange={(patch) => selectedItem && updateItem(selectedItem.id, patch)} />
      </div>
    </section>
  );
}
