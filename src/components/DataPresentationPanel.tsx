import { Settings2 } from "lucide-react";
import type { DataViewId, MapTemplateId } from "../lib/project-data";
import { TemplatePicker, type CustomTemplateOption, type TemplateOption } from "./TemplatePicker";
import { CompactButton, PanelHeader, SegmentedControl } from "./StudioUi";

export const PRESENTATION_VIEWS: Array<{ id: DataViewId; label: string; description: string }> = [
  { id: "province", label: "省份", description: "按省份汇总数据卡片" },
  { id: "city", label: "城市", description: "按城市汇总数据卡片" },
  { id: "university", label: "学校", description: "按院校汇总数据卡片" },
  { id: "pins", label: "图钉", description: "在地图上定位记录" },
  { id: "heat", label: "热力", description: "用颜色表达数量" },
];

export function DataPresentationPanel({
  dataView,
  onChangeDataView,
  templates,
  currentTemplateId,
  customTemplates,
  onApplyTemplate,
  onApplyCustomTemplate,
  onSaveTemplate,
  onOpenGlobalSettings,
}: {
  dataView: DataViewId;
  onChangeDataView: (view: DataViewId) => void;
  templates: TemplateOption[];
  currentTemplateId: string;
  customTemplates: CustomTemplateOption[];
  onApplyTemplate: (id: MapTemplateId) => void;
  onApplyCustomTemplate: (record: CustomTemplateOption) => void;
  onSaveTemplate: () => void;
  onOpenGlobalSettings: () => void;
}) {
  return (
    <section className="data-presentation-panel" aria-label="数据呈现">
      <PanelHeader title="数据呈现" meta="同一份名单，切换不同表达方式" />
      <SegmentedControl
        label="地图呈现方式"
        activeId={dataView}
        items={PRESENTATION_VIEWS.map((view) => ({
          id: view.id,
          label: view.label,
          ariaLabel: `切换为地图${view.label}`,
        }))}
        onChange={onChangeDataView}
        className="data-presentation-panel__views"
      />
      <div className="data-presentation-panel__descriptions" aria-live="polite">
        {PRESENTATION_VIEWS.map((view) => view.id === dataView && <p key={view.id}>{view.description}</p>)}
      </div>
      <TemplatePicker
        templates={templates}
        currentTemplateId={currentTemplateId}
        customTemplates={customTemplates}
        onApplyTemplate={onApplyTemplate}
        onApplyCustomTemplate={onApplyCustomTemplate}
        onSaveTemplate={onSaveTemplate}
      />
      <CompactButton icon={<Settings2 size={14} aria-hidden />} variant="secondary" aria-label="打开全局视觉设置" onClick={onOpenGlobalSettings}>
        打开全局视觉设置
      </CompactButton>
    </section>
  );
}
