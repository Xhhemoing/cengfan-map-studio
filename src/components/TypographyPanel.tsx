import { Trash2, Type } from "lucide-react";
import { useState } from "react";
import type { ProjectDocument } from "../lib/project-document";
import type { CardFontField } from "../lib/scene-document";
import { createUserFont, DEFAULT_FONT_ID, detectFontFormat, listFonts, type UserFont } from "../lib/fonts";
import type { TypographyTarget } from "../lib/typography";
import type { SceneSelection } from "../lib/scene-document";
import { DeferredInput } from "./DeferredInput";
import { FileDropzone } from "./FileDropzone";
import { FontEditor } from "./FontEditor";
import { RangeNumberControl } from "./RangeNumberControl";

const cardFontTargets: Array<{ field: CardFontField; label: string }> = [
  { field: "name", label: "人员姓名" },
  { field: "university", label: "院校" },
  { field: "city", label: "城市" },
  { field: "title", label: "名单板块标题" },
];

export function TypographyPanel({
  project,
  provinces,
  userFonts = [],
  onApplyFont,
  onPatch,
  onUploadFont,
  onDeleteUserFont,
}: {
  project: ProjectDocument;
  provinces: readonly string[];
  userFonts?: UserFont[];
  onApplyFont: (target: TypographyTarget, fontId: string, applyToAll: boolean) => void;
  onPatch: (target: SceneSelection, patch: Record<string, unknown>) => void;
  onUploadFont?: (font: UserFont) => void;
  onDeleteUserFont?: (fontId: string) => void;
}) {
  const fonts = listFonts(userFonts);
  const [province, setProvince] = useState(provinces[0] ?? "");
  const [provinceAll, setProvinceAll] = useState(false);
  const [guestId, setGuestId] = useState(project.guests.people[0]?.id ?? "");
  const [guestAll, setGuestAll] = useState(false);
  const [textId, setTextId] = useState(project.textElements[0]?.id ?? "");
  const [textAll, setTextAll] = useState(false);
  const [cardField, setCardField] = useState<CardFontField>("name");


  const provinceFontId = project.map.provinceStyles?.[province]?.labelFontId
    ?? project.map.provinceLabelFontId
    ?? DEFAULT_FONT_ID;
  const guest = project.guests.people.find((person) => person.id === guestId);
  const guestFontId = guest?.fontId ?? project.guests.peopleFontId ?? DEFAULT_FONT_ID;
  const selectedText = project.textElements.find((text) => text.id === textId);
  const provinceTypography = project.map.provinceLabelTypography ?? {};
  const fieldTypography = project.cards.fieldTypography?.[cardField] ?? {};
  const [message, setMessage] = useState("");
  const handleFontUpload = (file: File | null) => {
    if (!file) return;
    const format = detectFontFormat(file.name);
    if (!format) {
      setMessage("仅支持 TTF / OTF / WOFF 字体文件");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setMessage("读取字体失败，请重试");
    reader.onload = () => {
      const src = String(reader.result ?? "");
      if (!src) {
        setMessage("字体内容为空，未保存");
        return;
      }
      const font = createUserFont({ label: file.name.replace(/\.[^.]+$/, ""), src, format });
      onUploadFont?.(font);
      setMessage(`已上传字体：${font.label}`);
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="property-panel typography-panel">
      <header><div><h2>字体工具</h2><p className="property-panel__hint">集中设置画布中的各类文字。</p></div></header>

      <fieldset>
        <legend>全局行距</legend>
        <RangeNumberControl
          id="typography-line-height"
          label="行距倍率"
          value={project.canvas.lineHeight ?? 1}
          min={0.8}
          max={2.5}
          step={0.05}
          suffix="×"
          onCommit={(lineHeight) => onPatch({ type: "canvas" }, { lineHeight })}
        />
        <p className="property-panel__hint">作用于名单、标题、嘉宾等全部多行文字，行距越大行与行之间越宽松。</p>
      </fieldset>

      <fieldset>
        <legend>字体库</legend>
        <FileDropzone id="typography-font-upload" label="上传字体文件" hint="TTF / OTF / WOFF · 点击或拖拽" accept=".ttf,.otf,.woff,.woff2" icon={<Type size={16} aria-hidden />} onFile={handleFontUpload} />
        {fonts.filter((font) => font.source === "user").map((font) => (
          <div key={font.id} className="asset-panel__font-row">
            <span className="asset-panel__font-preview" style={{ fontFamily: `\"${font.family}\"` }}>{font.label}</span>
            <button type="button" aria-label={`删除字体 ${font.label}`} title="删除字体" onClick={() => onDeleteUserFont?.(font.id)}><Trash2 size={14} /></button>
          </div>
        ))}
        {message && <p className="property-panel__hint" role="status">{message}</p>}
      </fieldset>

      <fieldset>
        <legend>省份名称</legend>
        <label htmlFor="typography-province">省份
          <select id="typography-province" value={province} onChange={(event) => setProvince(event.target.value)}>
            {provinces.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <FontEditor
          id="typography-province-font"
          sizeId="typography-province-size"
          label="省份名称"
          fontId={provinceFontId}
          fontSize={provinceTypography.fontSize ?? 10}
          color={provinceTypography.color ?? project.map.edgeColor}
          userFonts={userFonts}
          onFontChange={(fontId) => onApplyFont({ type: "province-label", province }, fontId, provinceAll)}
          onSizeChange={(fontSize) => onPatch({ type: "map" }, { provinceLabelTypography: { ...provinceTypography, fontSize } })}
        />
        <label htmlFor="typography-province-all" className="checkbox-row">
          <input id="typography-province-all" type="checkbox" checked={provinceAll} onChange={(event) => setProvinceAll(event.target.checked)} />
          应用到全部省份名称
        </label>
        <label htmlFor="typography-province-color">颜色
          <DeferredInput id="typography-province-color" type="color" value={provinceTypography.color ?? project.map.edgeColor} onCommit={(color) => onPatch({ type: "map" }, { provinceLabelTypography: { ...provinceTypography, color } })} />
        </label>
      </fieldset>

      <fieldset>
        <legend>特邀嘉宾</legend>
        <FontEditor
          id="typography-guest-title-font"
          sizeId="typography-guest-title-size"
          label="板块标题"
          fontId={project.guests.titleFontId ?? DEFAULT_FONT_ID}
          fontSize={project.guests.titleTypography?.fontSize ?? project.guests.fontSize + 1}
          color={project.guests.titleTypography?.color ?? project.guests.textColor}
          userFonts={userFonts}
          onFontChange={(fontId) => onApplyFont({ type: "guest-title" }, fontId, true)}
          onSizeChange={(fontSize) => onPatch({ type: "guests" }, { titleTypography: { ...project.guests.titleTypography, fontSize } })}
        />
        <label htmlFor="typography-guest-title-color">标题颜色
          <DeferredInput id="typography-guest-title-color" type="color" value={project.guests.titleTypography?.color ?? project.guests.textColor} onCommit={(color) => onPatch({ type: "guests" }, { titleTypography: { ...project.guests.titleTypography, color } })} />
        </label>
        {project.guests.people.length > 0 ? <>
          <label htmlFor="typography-guest">嘉宾
            <select id="typography-guest" value={guestId} onChange={(event) => setGuestId(event.target.value)}>
              {project.guests.people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.title ? ` · ${person.title}` : ""}</option>)}
            </select>
          </label>
          <FontEditor
            id="typography-guest-font"
            sizeId="typography-guest-person-size"
            label="嘉宾人员"
            fontId={guestFontId}
            fontSize={project.guests.peopleTypography?.fontSize ?? project.guests.fontSize}
            color={project.guests.peopleTypography?.color ?? project.guests.textColor}
            userFonts={userFonts}
            onFontChange={(fontId) => onApplyFont({ type: "guest-person", id: guestId }, fontId, guestAll)}
            onSizeChange={(fontSize) => onPatch({ type: "guests" }, { peopleTypography: { ...project.guests.peopleTypography, fontSize } })}
          />
          <label htmlFor="typography-guest-all" className="checkbox-row">
            <input id="typography-guest-all" type="checkbox" checked={guestAll} onChange={(event) => setGuestAll(event.target.checked)} />
            应用到全部特邀嘉宾
          </label>

          <label htmlFor="typography-guest-person-color">人员颜色
            <DeferredInput id="typography-guest-person-color" type="color" value={project.guests.peopleTypography?.color ?? project.guests.textColor} onCommit={(color) => onPatch({ type: "guests" }, { peopleTypography: { ...project.guests.peopleTypography, color } })} />
          </label>
        </> : <p className="property-panel__hint">先在元素工具中添加老师或嘉宾。</p>}
      </fieldset>

      <fieldset>
        <legend>人员名单</legend>
        <label htmlFor="typography-roster-target">文本类型
          <select id="typography-roster-target" value={cardField} onChange={(event) => setCardField(event.target.value as CardFontField)}>
            {cardFontTargets.map((item) => <option key={item.field} value={item.field}>{item.label}</option>)}
          </select>
        </label>
        <FontEditor
          id="typography-roster-font"
          sizeId="typography-roster-size"
          label="名单字体"
          fontId={project.cards.fieldFonts?.[cardField] ?? DEFAULT_FONT_ID}
          fontSize={fieldTypography.fontSize ?? (cardField === "city" ? Math.max(9, project.cards.fontSize - 1) : project.cards.fontSize)}
          color={fieldTypography.color ?? project.cards.textColor}
          userFonts={userFonts}
          onFontChange={(fontId) => onApplyFont({ type: "card-field", field: cardField }, fontId, true)}
          onSizeChange={(fontSize) => onPatch({ type: "cards" }, { fieldTypography: { ...project.cards.fieldTypography, [cardField]: { ...fieldTypography, fontSize } } })}
        />
        <label htmlFor="typography-roster-color">颜色
          <DeferredInput id="typography-roster-color" type="color" value={fieldTypography.color ?? project.cards.textColor} onCommit={(color) => onPatch({ type: "cards" }, { fieldTypography: { ...project.cards.fieldTypography, [cardField]: { ...fieldTypography, color } } })} />
        </label>
        <p className="property-panel__hint">人员姓名字体会应用到所有名单卡片中的姓名。</p>
      </fieldset>

      <fieldset>
        <legend>画布文本</legend>
        <label htmlFor="typography-canvas-text">文本
          <select id="typography-canvas-text" value={textId} onChange={(event) => setTextId(event.target.value)}>
            {project.textElements.map((text) => <option key={text.id} value={text.id}>{text.content || "空白文本"}</option>)}
          </select>
        </label>
        {selectedText && <>
          <FontEditor
            id="typography-canvas-font"
            sizeId="typography-canvas-size"
            label="画布文本"
            fontId={selectedText.fontId ?? DEFAULT_FONT_ID}
            fontSize={selectedText.fontSize}
            color={selectedText.color}
            userFonts={userFonts}
            onFontChange={(fontId) => onApplyFont({ type: "canvas-text", id: textId }, fontId, textAll)}
            onSizeChange={(fontSize) => onPatch({ type: "text", id: textId }, { fontSize })}
          />
          <label htmlFor="typography-canvas-color">颜色
            <DeferredInput id="typography-canvas-color" type="color" value={selectedText.color} onCommit={(color) => onPatch({ type: "text", id: textId }, { color })} />
          </label>
        </>}
        <label htmlFor="typography-text-all" className="checkbox-row">
          <input id="typography-text-all" type="checkbox" checked={textAll} onChange={(event) => setTextAll(event.target.checked)} />
          应用到全部同类画布文本
        </label>
      </fieldset>
    </section>
  );
}
