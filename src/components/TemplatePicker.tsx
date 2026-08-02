import type { MapTemplateId } from "../lib/project-data";

export interface TemplateOption {
  id: MapTemplateId;
  name: string;
}

export interface CustomTemplateOption {
  id: string;
  name: string;
  scope: "visual" | "layout";
}

export function TemplatePicker({
  templates,
  currentTemplateId,
  customTemplates,
  onApplyTemplate,
  onApplyCustomTemplate,
  onSaveTemplate,
}: {
  templates: TemplateOption[];
  currentTemplateId: string;
  customTemplates: CustomTemplateOption[];
  onApplyTemplate: (id: MapTemplateId) => void;
  onApplyCustomTemplate: (record: CustomTemplateOption) => void;
  onSaveTemplate: () => void;
}) {
  return (
    <div className="template-picker">
      <h3 className="template-picker__title">整体模板</h3>
      <div className="workflow-template-grid" role="group" aria-label="整体模板">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className={currentTemplateId === template.id ? "selected" : undefined}
            onClick={() => onApplyTemplate(template.id)}
          >
            {template.name}
          </button>
        ))}
      </div>
      {customTemplates.length > 0 && (
        <div className="workflow-custom-templates" role="group" aria-label="我的模板">
          {customTemplates.map((item) => (
            <button key={item.id} type="button" onClick={() => onApplyCustomTemplate(item)}>
              <span>{item.name}</span>
              <small>{item.scope === "visual" ? "视觉样式" : "布局倾向"}</small>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="workflow-save-template" onClick={onSaveTemplate}>
        保存当前整体模板
      </button>
    </div>
  );
}
