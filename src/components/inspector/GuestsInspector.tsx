import { Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { createId } from "../../lib/ids";
import type { GuestPanelSettings, GuestPerson } from "../../lib/scene-document";
import { DeferredInput, DeferredTextarea } from "../DeferredInput";
import { ActionGroup, CompactButton, IconButton, InspectorHeader } from "../StudioUi";

const readAvatarFile = (file: File | null | undefined, done: (src: string) => void) => {
  if (!file) return;
  if (!file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onerror = () => undefined;
  reader.onload = () => done(String(reader.result ?? ""));
  reader.readAsDataURL(file);
};

export function GuestsInspector({ guests, onPatch, layoutOnly = false, peopleOnly = false, placementOnly = false }: {
  guests: GuestPanelSettings;
  onPatch: (patch: Partial<GuestPanelSettings>) => void;
  layoutOnly?: boolean;
  peopleOnly?: boolean;
  placementOnly?: boolean;
}) {
  const people = guests.people ?? [];

  const updatePerson = (id: string, patch: Partial<GuestPerson>) => {
    onPatch({
      people: people.map((person) => (person.id === id ? { ...person, ...patch } : person)),
    });
  };

  const addPerson = () => {
    onPatch({
      people: [
        ...people,
        {
          id: createId("guest"),
          name: "新老师",
          title: "特邀嘉宾",
          visibility: true,
        },
      ],
    });
  };

  const removePerson = (id: string) => {
    onPatch({ people: people.filter((person) => person.id !== id) });
  };

  const placementControls = <>
    <div className="property-panel__pair" data-property-pair="guests-position">
      <label htmlFor="guests-x">X
        <DeferredInput id="guests-x" type="number" value={guests.x} onCommit={(draft) => {
          const next = Number(draft);
          if (Number.isFinite(next)) onPatch({ x: next });
        }} />
      </label>
      <label htmlFor="guests-y">Y
        <DeferredInput id="guests-y" type="number" value={guests.y} onCommit={(draft) => {
          const next = Number(draft);
          if (Number.isFinite(next)) onPatch({ y: next });
        }} />
      </label>
    </div>
    <label htmlFor="guests-width">宽度
      <DeferredInput id="guests-width" type="number" min={120} max={800} value={guests.width} onCommit={(draft) => {
        const next = Number(draft);
        if (Number.isFinite(next)) onPatch({ width: next });
      }} />
    </label>
  </>;

  if (placementOnly) return <section className="property-panel"><InspectorHeader title="辅助板块位置与尺寸" />{placementControls}</section>;

  return (
    <section className="property-panel">
      {!peopleOnly && <>
        <InspectorHeader
          title="特邀嘉宾"
          actions={<IconButton label={guests.visibility ? "隐藏嘉宾板块" : "显示嘉宾板块"} icon={guests.visibility ? <EyeOff size={15} /> : <Eye size={15} />} variant="ghost" onClick={() => onPatch({ visibility: !guests.visibility })} />}
        />
        <label htmlFor="guests-title">板块标题
          <DeferredInput id="guests-title" value={guests.title} onCommit={(title) => onPatch({ title })} />
        </label>
        <label htmlFor="guests-custom-text">自定义文本
          <DeferredTextarea
            id="guests-custom-text"
            rows={3}
            value={guests.customText ?? ""}
            placeholder="整个框内显示的自由文本，支持多行（如感谢语、班级寄语）"
            onCommit={(customText) => onPatch({ customText: customText || undefined })}
          />
        </label>
        <label htmlFor="guests-display-mode">显示方式
          <select
            id="guests-display-mode"
            value={guests.displayMode === "cards" ? "cards" : "list"}
            onChange={(event) => onPatch({ displayMode: event.target.value === "cards" ? "cards" : "list" })}
          >
            <option value="list">文本列表（姓名 + 身份）</option>
            <option value="cards">头像卡片（头像 / 身份 / 备注）</option>
          </select>
        </label>
        {!layoutOnly && placementControls}
        <label htmlFor="guests-font-size">字号
          <DeferredInput id="guests-font-size" type="number" min={8} max={36} value={guests.fontSize} onCommit={(draft) => {
            const next = Number(draft);
            if (Number.isFinite(next)) onPatch({ fontSize: next });
          }} />
        </label>
        <div className="property-panel__grid">
          <label htmlFor="guests-background">背景色
            <DeferredInput id="guests-background" type="color" value={guests.background} onCommit={(background) => onPatch({ background })} />
          </label>
          <label htmlFor="guests-text-color">文字色
            <DeferredInput id="guests-text-color" type="color" value={guests.textColor} onCommit={(textColor) => onPatch({ textColor })} />
          </label>
        </div>
        <label htmlFor="guests-opacity">透明度
          <DeferredInput id="guests-opacity" type="range" min={0} max={1} step={0.05} value={guests.opacity} onCommit={(opacity) => onPatch({ opacity: Number(opacity) })} />
        </label>
      </>}

      {!layoutOnly && <div className="guest-people-editor">
        <div className="asset-section__heading">
          <strong>老师名单</strong>
          <small>{people.length} 人</small>
        </div>
        <CompactButton className="wide-button" icon={<Plus size={14} aria-hidden />} onClick={addPerson}>添加老师 / 嘉宾</CompactButton>
        {people.map((person) => (
          <div key={person.id} className="guest-person-row" data-guest-editor={person.id}>
            <label>
              姓名
              <DeferredInput value={person.name} onCommit={(name) => updatePerson(person.id, { name })} />
            </label>
            <label>
              身份
              <DeferredInput value={person.title ?? ""} placeholder="班主任 / 特邀嘉宾" onCommit={(title) => updatePerson(person.id, { title: title || undefined })} />
            </label>
            <label>
              备注 / 自定义文本
              <DeferredInput data-guest-note-input={person.id} value={person.note ?? ""} placeholder="祝福语、寄语等自由文本" onCommit={(note) => updatePerson(person.id, { note: note || undefined })} />
            </label>
            <div className="guest-avatar-editor">
              <span>头像</span>
              <DeferredInput data-guest-avatar-input={person.id} value={person.avatarSrc ?? ""} placeholder="图片链接（或上传）" onCommit={(avatarSrc) => updatePerson(person.id, { avatarSrc: avatarSrc || undefined })} />
              <input
                type="file"
                accept="image/*"
                data-guest-avatar-upload={person.id}
                aria-label={`上传 ${person.name} 的头像`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  readAvatarFile(file, (avatarSrc) => {
                    updatePerson(person.id, { avatarSrc });
                    event.target.value = "";
                  });
                }}
              />
              {person.avatarSrc && (
                <IconButton label={`清除 ${person.name} 的头像`} icon={<X size={14} />} variant="ghost" data-guest-avatar-clear={person.id} onClick={() => updatePerson(person.id, { avatarSrc: undefined })} />
              )}
            </div>
            <ActionGroup label={`${person.name} 操作`} className="guest-person-row__actions">
              <label>
                <input
                  type="checkbox"
                  checked={person.visibility !== false}
                  onChange={(event) => updatePerson(person.id, { visibility: event.target.checked })}
              />
                显示
              </label>
              <IconButton label={`删除 ${person.name}`} icon={<Trash2 size={14} />} variant="danger" onClick={() => removePerson(person.id)} />
            </ActionGroup>
          </div>
        ))}
      </div>}
      <p className="property-panel__hint">
        {placementOnly
          ? "位置与尺寸实时应用；外观与名单请在辅助板块设置中调整。"
          : peopleOnly
            ? "板块外观请在辅助板块设置中调整。"
            : layoutOnly
              ? "默认显示在画布左下角，可拖动位置；具体名单请返回编辑器后修改。"
              : "可拖动位置；外观与老师名单可直接修改。"}
      </p>
    </section>
  );
}
