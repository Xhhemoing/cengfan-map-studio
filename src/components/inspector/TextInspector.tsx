import { Eye, EyeOff, Trash2 } from "lucide-react";
import type { CanvasText } from "../../lib/scene-document";
import { DEFAULT_FONT_ID, type UserFont } from "../../lib/fonts";
import { DeferredInput, DeferredTextarea } from "../DeferredInput";
import { FontEditor } from "../FontEditor";
import { IconButton, InspectorHeader } from "../StudioUi";

export function TextInspector({ text, userFonts = [], onPatch, onDelete }: {
  text: CanvasText;
  userFonts?: UserFont[];
  onPatch: (patch: Partial<CanvasText>) => void;
  onDelete: () => void;
}) {
  const number = (key: "x" | "y" | "fontSize" | "fontWeight" | "maxWidth", value: number, min: number, max: number, label: string, id: string) => (
    <label htmlFor={id}>{label}<DeferredInput id={id} type="number" min={min} max={max} value={value} onCommit={(draft) => {
      const next = Number(draft);
      if (Number.isFinite(next) && next >= min && next <= max) onPatch({ [key]: next });
    }} /></label>
  );
  const deletable = text.role === "custom" || text.role === "note";
  return <section className="property-panel"><InspectorHeader title="文本属性" actions={deletable
    ? <IconButton label="删除文本" text="删除文本" icon={<Trash2 size={15} />} variant="danger" onClick={onDelete} />
    : <IconButton label={text.visibility ? "隐藏文本" : "显示文本"} text={text.visibility ? "隐藏文本" : "显示文本"} icon={text.visibility ? <EyeOff size={15} /> : <Eye size={15} />} variant="ghost" onClick={() => onPatch({ visibility: !text.visibility })} />}
  />
    <label htmlFor="text-content">内容<DeferredTextarea id="text-content" value={text.content} onCommit={(content) => onPatch({ content })} /></label>
    {number("x", text.x, 0, 6000, "X", "text-x")}{number("y", text.y, 0, 6000, "Y", "text-y")}
    <label htmlFor="text-color">颜色<DeferredInput id="text-color" type="color" value={text.color} onCommit={(color) => onPatch({ color })} /></label>
    <FontEditor
      id="text-font"
      sizeId="text-font-size"
      label="字体"
      fontId={text.fontId ?? DEFAULT_FONT_ID}
      fontSize={text.fontSize}
      color={text.color}
      userFonts={userFonts}
      onFontChange={(fontId) => onPatch({ fontId: fontId || undefined })}
      onSizeChange={(fontSize) => onPatch({ fontSize })}
    />
    {number("fontWeight", text.fontWeight, 100, 900, "字重", "text-weight")}
    <label htmlFor="text-align">对齐<select id="text-align" value={text.textAlign} onChange={(event) => onPatch({ textAlign: event.target.value as CanvasText["textAlign"] })}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
    {number("maxWidth", text.maxWidth, 40, 6000, "最大宽度", "text-max-width")}
    <label htmlFor="text-visible">显示<input id="text-visible" type="checkbox" checked={text.visibility} onChange={(event) => onPatch({ visibility: event.target.checked })} /></label>
  </section>;
}
