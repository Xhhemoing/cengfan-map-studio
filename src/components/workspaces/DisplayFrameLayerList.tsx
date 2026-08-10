import { Minus, Square, Type } from "lucide-react";
import type { DisplayFrameFixedItem } from "../../lib/display-frame";
import { IconButton } from "../StudioUi";

function itemLabel(item: DisplayFrameFixedItem): string {
  if (item.kind === "field") return ({ title: "标题", name: "姓名", university: "院校", city: "城市" } as const)[item.field ?? "title"];
  if (item.kind === "text") return item.content || "自定义文字";
  return item.decoration === "line" ? "分隔线" : "矩形装饰";
}

function itemKindLabel(item: DisplayFrameFixedItem): string {
  if (item.kind === "field") return "字段";
  return item.kind === "text" ? "文字" : "装饰";
}

export function DisplayFrameLayerList({
  items,
  selectedItemId,
  onSelect,
  onAddText,
  onAddLine,
  onAddRectangle,
  onRemove,
}: {
  items: DisplayFrameFixedItem[];
  selectedItemId: string | null;
  onSelect: (id: string) => void;
  onAddText: () => void;
  onAddLine: () => void;
  onAddRectangle: () => void;
  onRemove: () => void;
}) {
  const selected = selectedItemId ? items.find((item) => item.id === selectedItemId) : null;
  return (
    <section className="display-frame-layer-list" aria-label="展示框图层">
      <div className="display-frame-layer-list__heading">
        <strong>图层</strong>
        <div className="display-frame-layer-list__actions" role="group" aria-label="添加图层">
          <IconButton label="添加自定义文字" icon={<Type size={15} aria-hidden />} onClick={onAddText} />
          <IconButton label="添加分隔线" icon={<Minus size={15} aria-hidden />} onClick={onAddLine} />
          <IconButton label="添加矩形装饰" icon={<Square size={14} aria-hidden />} onClick={onAddRectangle} />
        </div>
      </div>
      <div className="display-frame-layer-list__items" role="list">
        {items.slice().sort((left, right) => right.zIndex - left.zIndex || right.id.localeCompare(left.id)).map((item) => (
          <button
            key={item.id}
            type="button"
            role="listitem"
            aria-label={`选择${itemLabel(item)}`}
            aria-pressed={item.id === selectedItemId}
            className={item.id === selectedItemId ? "is-selected" : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span><strong>{itemLabel(item)}</strong><small>{itemKindLabel(item)} · 层级 {item.zIndex}</small></span>
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="删除当前图层"
        className="display-frame-layer-list__remove"
        disabled={!selected || selected.kind === "field"}
        onClick={onRemove}
      >
        删除当前图层
      </button>
    </section>
  );
}
