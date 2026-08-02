import { DEFAULT_FONT_ID, listFonts, resolveFontFamily, type UserFont } from "../lib/fonts";
import { DeferredInput } from "./DeferredInput";

export function FontEditor({
  id,
  sizeId = `${id}-size`,
  label,
  fontId,
  fontSize,
  color,
  userFonts = [],
  min = 8,
  max = 240,
  onFontChange,
  onSizeChange,
}: {
  id: string;
  sizeId?: string;
  label: string;
  fontId: string;
  fontSize: number;
  color: string;
  userFonts?: UserFont[];
  min?: number;
  max?: number;
  onFontChange: (fontId: string) => void;
  onSizeChange: (fontSize: number) => void;
}) {
  const resolvedFamily = resolveFontFamily(fontId, userFonts);
  return (
    <div className="font-editor" aria-label={`${label}字体编辑`}>
      <label className="font-editor__family" htmlFor={id}>
        <span>{label}</span>
        <select id={id} value={fontId} onChange={(event) => onFontChange(event.target.value)}>
          <option value={DEFAULT_FONT_ID}>默认字体</option>
          {listFonts(userFonts).map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
        </select>
      </label>
      <label className="font-editor__size" htmlFor={sizeId}>
        <span>字号</span>
        <DeferredInput
          id={sizeId}
          type="number"
          min={min}
          max={max}
          value={fontSize}
          onCommit={(draft) => {
            const next = Number(draft);
            if (Number.isFinite(next) && next >= min && next <= max) onSizeChange(next);
          }}
        />
      </label>
      <output
        className="font-editor__preview"
        data-font-preview
        aria-label={`${label}字体预览`}
        style={{ color, fontFamily: resolvedFamily, fontSize: `${Math.min(32, Math.max(14, fontSize))}px` }}
      >
        Aa 中文预览
      </output>
    </div>
  );
}
