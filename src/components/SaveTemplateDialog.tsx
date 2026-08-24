import { useEffect, useId, useRef, useState } from "react";
import type { TemplateSaveScope } from "../lib/template-store";
import { WorkbenchDialog } from "./workbench/WorkbenchDialog";
import "./SaveTemplateDialog.css";

export type SaveTemplateDialogProps = {
  defaultName?: string;
  onCancel: () => void;
  onSave: (payload: { name: string; scope: TemplateSaveScope }) => void;
};

const SCOPE_OPTIONS: Array<{ value: TemplateSaveScope; label: string; hint: string }> = [
  { value: "visual", label: "视觉样式", hint: "背景、地图配色、卡片外观" },
  { value: "layout", label: "布局倾向", hint: "含卡片分组与元素排布" },
];

/**
 * 保存自定义模板对话框，由调用方按开关条件挂载（挂载即为打开）。
 *
 * 取代 `window.prompt` + `window.confirm`：confirm 只有两个出口，
 * 「取消」会被当成第二种保存范围，用户无法放弃保存。
 *
 * 遮罩、Esc、焦点圈闭与焦点归还都交给 `WorkbenchDialog`，这里只画内容。
 */
export function SaveTemplateDialog({ defaultName = "我的地图版式", onCancel, onSave }: SaveTemplateDialogProps) {
  const [name, setName] = useState(defaultName);
  const [scope, setScope] = useState<TemplateSaveScope>("visual");
  const nameRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const scopeName = `${titleId}-scope`;

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const trimmed = name.trim();

  return (
    <WorkbenchDialog
      titleId={titleId}
      className="save-template-dialog"
      onCancel={onCancel}
      onSubmit={() => {
        if (!trimmed) return;
        onSave({ name: trimmed, scope });
      }}
    >
      <strong id={titleId}>保存当前整体模板</strong>
      <label className="workbench-dialog__field">
        <span>模板名称</span>
        <input
          ref={nameRef}
          type="text"
          value={name}
          aria-label="模板名称"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <fieldset className="save-template-dialog__scope">
        <legend>保存范围</legend>
        {SCOPE_OPTIONS.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={scopeName}
              value={option.value}
              checked={scope === option.value}
              aria-label={option.label}
              onChange={() => setScope(option.value)}
            />
            <span>
              {option.label}
              <small>{option.hint}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="workbench-dialog__actions">
        <button type="button" onClick={onCancel}>取消</button>
        <button type="submit" className="primary-button" disabled={!trimmed}>保存</button>
      </div>
    </WorkbenchDialog>
  );
}
