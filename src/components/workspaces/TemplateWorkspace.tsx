import { Check, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type { MapTemplateId } from "../../lib/project-data";
import type { ProjectDocument } from "../../lib/project-document";
import { createSystemTemplate, type TemplateDocument } from "../../lib/template-document";
import type { CustomTemplateRecord } from "../../lib/template-store";
import { TemplatePreview } from "./TemplatePreview";

export interface TemplateWorkspaceTemplateOption {
  id: MapTemplateId;
  name: string;
}

export interface TemplateWorkspaceProps {
  project: ProjectDocument;
  templates: TemplateWorkspaceTemplateOption[];
  customTemplates: CustomTemplateRecord[];
  onApplyTemplate: (id: MapTemplateId) => void;
  onApplyCustomTemplate: (record: CustomTemplateRecord) => void;
  /** Lifted selection for the unified right rail; falls back to internal state when omitted. */
  selection?: TemplateSelection | null;
  onSelect?: (selection: TemplateSelection | null) => void;
}

export type TemplateSelection =
  | { kind: "system"; id: MapTemplateId }
  | { kind: "custom"; record: CustomTemplateRecord };

function selectionKey(selection: TemplateSelection): string {
  return selection.kind === "system" ? selection.id : selection.record.id;
}

export interface TemplateCatalogRailProps {
  templates: TemplateWorkspaceTemplateOption[];
  customTemplates: CustomTemplateRecord[];
  currentTemplateId: MapTemplateId;
  selection: TemplateSelection | null;
  onSelect: (selection: TemplateSelection | null) => void;
}

/**
 * The template stage's unified right rail: the 模板列表 catalog of system and
 * custom templates. The shell owns the labelled aside + resizer + mobile
 * drawer chrome; this component supplies the list content.
 */
export function TemplateCatalogRail({
  templates,
  customTemplates,
  currentTemplateId,
  selection,
  onSelect,
}: TemplateCatalogRailProps) {
  const resolvedSelection = selection ?? { kind: "system", id: currentTemplateId };
  return (
    <aside className="template-workspace__catalog" aria-label="模板列表">
      <div className="template-workspace__catalog-heading">
        <h2>模板列表</h2>
        <span>{templates.length + customTemplates.length} 个选项</span>
      </div>
      <div className="template-workspace__list" role="listbox" aria-label="模板列表">
        {templates.map((item) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-label={`选择${item.name}`}
            aria-selected={selectionKey(resolvedSelection) === item.id}
            className={selectionKey(resolvedSelection) === item.id ? "is-selected" : undefined}
            onClick={() => onSelect({ kind: "system", id: item.id })}
          >
            <span className={`template-workspace__swatch template-workspace__swatch--${item.id}`} />
            <span><strong>{item.name}</strong><small>系统模板 · 1500 × 1000 px · 横版</small></span>
            {item.id === currentTemplateId && <Check size={15} aria-label="当前模板" />}
          </button>
        ))}
        {customTemplates.length > 0 && (
          <div className="template-workspace__custom" role="group" aria-label="我的模板">
            <h3>我的模板</h3>
            {customTemplates.map((item) => {
              const selected = selectionKey(resolvedSelection) === item.id;
              const orientation = item.document.canvas.width >= item.document.canvas.height ? "横版" : "竖版";
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-label={`选择${item.name}`}
                  aria-selected={selected}
                  className={selected ? "is-selected" : undefined}
                  onClick={() => onSelect({ kind: "custom", record: item })}
                >
                  <span className="template-workspace__swatch template-workspace__swatch--custom" />
                  <span><strong>{item.name}</strong><small>{item.scope === "visual" ? "视觉样式" : "布局倾向"} · {item.document.canvas.width} × {item.document.canvas.height} px · {orientation}</small></span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * Center content of the template stage: the 模板详情 preview plus impact
 * summary. The 模板列表 catalog lives in the unified right rail
 * (`TemplateCatalogRail`); the footer actions stay here under the preview.
 */
export function TemplateWorkspace({
  project,
  onApplyTemplate,
  onApplyCustomTemplate,
  selection: controlledSelection,
  onSelect: onControlledSelect,
}: TemplateWorkspaceProps) {
  const [internalSelection, setInternalSelection] = useState<TemplateSelection | null>(null);
  const selection = controlledSelection !== undefined ? controlledSelection : internalSelection;
  const setSelection = (next: TemplateSelection | null) => {
    setInternalSelection(next);
    onControlledSelect?.(next);
  };
  const selectedTemplate = useMemo<TemplateDocument>(() => {
    if (!selection) return createSystemTemplate(project.templateId);
    return selection.kind === "system" ? createSystemTemplate(selection.id) : selection.record.document;
  }, [project.templateId, selection]);
  const selectedCustomRecord = selection?.kind === "custom" ? selection.record : undefined;
  const isCurrent = selection
    ? selection.kind === "system"
      ? selection.id === project.templateId
      : selection.record.baseTemplateId === project.templateId
    : true;

  const applySelection = () => {
    if (!selection) return;
    if (selection.kind === "system") onApplyTemplate(selection.id);
    else onApplyCustomTemplate(selection.record);
  };

  return (
    <main className="template-workspace" aria-label="模板选择工作台">
      <header className="template-workspace__header">
        <div className="template-workspace__status" aria-live="polite">
          <strong>{project.students.length}</strong>
          <span>条名单 · 当前{isCurrent ? "已选" : "待应用"}</span>
        </div>
      </header>

      <div className="template-workspace__layout">
        <section className="template-workspace__detail" aria-label="模板详情">
          <TemplatePreview project={project} template={selectedTemplate} customRecord={selectedCustomRecord} />
          <div className="template-workspace__impact" aria-label="模板应用影响摘要">
            <div>
              <p>应用影响摘要</p>
              <strong>{selection ? `将应用：${selectedTemplate.name}` : `当前模板：${selectedTemplate.name}`}</strong>
            </div>
            <ul>
              <li>会更新画布、地图、数据框和模板视觉配置</li>
              <li>名单不会删除，当前 {project.students.length} 条学生数据会保留</li>
              <li>应用后可使用现有撤销和重做恢复</li>
            </ul>
          </div>
        </section>
      </div>

      <footer className="template-workspace__footer">
        <span className="template-workspace__history">
          {selection ? "尚未写入工程 · 仍可重新选择" : `已写入 ${project.history.past.length} 步 · 当前工程未修改`}
        </span>
        <div>
          {selection && (
            <button type="button" className="secondary-button" aria-label="重新选择模板" onClick={() => setSelection(null)}>
              <RotateCcw size={15} aria-hidden /> 重新选择
            </button>
          )}
          <button type="button" className="primary-button" aria-label="应用模板" disabled={!selection} onClick={applySelection}>
            <Check size={15} aria-hidden /> 应用模板
          </button>
        </div>
      </footer>
    </main>
  );
}
