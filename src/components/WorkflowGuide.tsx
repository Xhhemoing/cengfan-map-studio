import { Download, LayoutTemplate, Map, MousePointerClick, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { DataViewId, MapTemplateId } from "../lib/project-data";
import type { WorkflowProgress, WorkflowStepId, WorkflowStepProgress, WorkflowStepStatus } from "../lib/workflow-progress";
import type { GlobalSettingsSection } from "./GlobalSettingsScreen";
import { SegmentedNav } from "./StudioUi";
import { TemplatePicker } from "./TemplatePicker";

const WORKFLOW_STEPS = [
  { id: "roster", index: 1, title: "准备名单", icon: Users },
  { id: "presentation", index: 2, title: "地图呈现", icon: Map },
  { id: "layout", index: 3, title: "全局布局", icon: LayoutTemplate },
  { id: "local", index: 4, title: "局部调整", icon: MousePointerClick },
  { id: "export", index: 5, title: "检查导出", icon: Download },
] as const;

const PRESENTATION_VIEWS: Array<{ id: DataViewId; label: string }> = [
  { id: "province", label: "省份卡片" },
  { id: "city", label: "城市卡片" },
  { id: "university", label: "院校卡片" },
  { id: "pins", label: "地图图钉" },
  { id: "heat", label: "人数热力" },
];

function stepProgress(progress: WorkflowProgress, id: WorkflowStepId): WorkflowStepProgress {
  if (id === "export") return progress.exportStep;
  return progress[id];
}

function stepSubtitle(step: WorkflowStepProgress, dataViewLabel: string): string {
  switch (step.id) {
    case "roster":
      if (step.status === "empty") return "导入或录入毕业去向名单";
      if (step.status === "warning") {
        const parts = [`${step.counts.unresolved} 个城市未匹配`];
        if (step.counts.hidden > 0) parts.push(`${step.counts.hidden} 条隐藏`);
        return parts.join(" · ");
      }
      return `${step.counts.total} 条记录已就绪`;
    case "presentation":
      if (step.status === "empty") return "先完成名单导入";
      if (step.status === "warning") return `${step.counts.unresolved} 个城市未匹配`;
      return dataViewLabel;
    case "layout":
      return "模板 · 画布 · 地图 · 板块";
    case "local":
      return "省份 · 卡片 · 文字 · 素材";
    case "export": {
      if (step.status === "empty") return "名单为空";
      if (step.status === "warning") {
        const parts = [`${step.counts.unresolved} 个未匹配`];
        if (step.counts.hidden > 0) parts.push(`${step.counts.hidden} 条隐藏`);
        return parts.join(" · ");
      }
      return "可以导出海报";
    }
  }
}

function badgeText(status: WorkflowStepStatus, index: number): string {
  if (status === "ready") return "✓";
  if (status === "warning") return "!";
  return String(index);
}

export function WorkflowGuide({
  progress,
  activeStep,
  dataView = "province",
  dataViewLabel = "",
  selectionDescription = "",
  templates = [],
  currentTemplateId = "",
  customTemplates = [],
  exportWarnings = { unresolvedStudents: [], hiddenStudents: [] },
  variant = "topbar",
  showStepPanel = true,
  onSelectStep,
  onChangeDataView = () => {},
  onOpenGlobalSettings = () => {},
  onArrangeCards = () => {},
  onApplyTemplate = () => {},
  onApplyCustomTemplate = () => {},
  onSaveTemplate = () => {},
  onExportPng = () => {},
  onExportSvg = () => {},
  onExportProject = () => {},
  onSaveLocal = () => {},
  onOpenAssets = () => {},
  onFocusStudent = () => {},
  globalSections = [],
  activeSection,
}: {
  progress: WorkflowProgress;
  activeStep: WorkflowStepId;
  dataView?: DataViewId;
  dataViewLabel?: string;
  selectionDescription?: string;
  templates?: Array<{ id: MapTemplateId; name: string }>;
  currentTemplateId?: string;
  customTemplates?: Array<{ id: string; name: string; scope: "visual" | "layout" }>;
  exportWarnings?: {
    unresolvedStudents: Array<{ id: string; name: string; city: string }>;
    hiddenStudents: Array<{ id: string; name: string }>;
  };
  /** topbar：紧凑状态条，悬停展开；fullscreen：默认展开引导面板。 */
  variant?: "topbar" | "fullscreen";
  /** 是否展示当前步骤的操作面板（全屏引导可只保留步骤状态）。 */
  showStepPanel?: boolean;
  /** 全局设置分区快捷入口（仅 fullscreen 且 layout 步骤展示）。 */
  globalSections?: Array<{ id: GlobalSettingsSection; label: string }>;
  /** 当前激活的全局设置分区，用于高亮快捷入口。 */
  activeSection?: GlobalSettingsSection;
  onSelectStep: (step: WorkflowStepId) => void;
  onChangeDataView?: (view: DataViewId) => void;
  onOpenGlobalSettings?: (section: GlobalSettingsSection) => void;
  onArrangeCards?: () => void;
  onApplyTemplate?: (id: MapTemplateId) => void;
  onApplyCustomTemplate?: (record: { id: string; name: string; scope: "visual" | "layout" }) => void;
  onSaveTemplate?: () => void;
  onExportPng?: () => void;
  onExportSvg?: () => void;
  onExportProject?: () => void;
  onSaveLocal?: () => void;
  onOpenAssets?: () => void;
  onFocusStudent?: (id: string) => void;
}) {
  const [open, setOpen] = useState(variant === "fullscreen");
  const activeIndex = WORKFLOW_STEPS.findIndex((step) => step.id === activeStep);
  const activeStepMeta = WORKFLOW_STEPS[activeIndex] ?? WORKFLOW_STEPS[0]!;
  const activeProgress = stepProgress(progress, activeStep);

  const panel: ReactNode = (
    <>
      <nav className="workflow-nav" aria-label="制作流程">
        {WORKFLOW_STEPS.map((step) => {
          const progressForStep = stepProgress(progress, step.id);
          const active = activeStep === step.id;
          const Icon = step.icon;
          return (
            <button
              key={step.id}
              type="button"
              className={active ? "is-active" : undefined}
              aria-current={active ? "step" : undefined}
              onClick={() => onSelectStep(step.id)}
            >
              <span className="workflow-nav__icon">{Icon && <Icon size={16} />}</span>
              <span className="workflow-nav__text">
                <strong>{step.index} {step.title}</strong>
                <small>{stepSubtitle(progressForStep, dataViewLabel)}</small>
              </span>
              <span
                className="workflow-nav__badge"
                data-status={progressForStep.status}
                aria-label={`${step.title}：${progressForStep.status === "ready" ? "已完成" : progressForStep.status === "warning" ? "有警告" : "未开始"}`}
              >
                {badgeText(progressForStep.status, step.index)}
              </span>
            </button>
          );
        })}
      </nav>

      {activeStep === "roster" && showStepPanel && (
        <section className="workflow-step-panel" aria-label="准备名单">
          <p className="panel-note">
            {progress.roster.counts.total > 0
              ? `共 ${progress.roster.counts.total} 条记录 · ${progress.roster.counts.international} 个海外 · ${progress.roster.counts.unresolved} 个未匹配`
              : "名单为空，先导入或录入毕业去向名单。"}
          </p>
          <button
            type="button"
            className="wide-button"
            onClick={() => onOpenGlobalSettings("cards")}
          >
            管理名单
          </button>
        </section>
      )}

      {activeStep === "presentation" && showStepPanel && (
        <section className="workflow-step-panel" aria-label="地图呈现">
          <SegmentedNav
            label="地图呈现方式"
            activeId={dataView}
            items={PRESENTATION_VIEWS}
            onChange={onChangeDataView}
          />
          <p className="panel-note">选择后地图与卡片立即更新，无需保存。</p>
        </section>
      )}

      {activeStep === "layout" && showStepPanel && (
        <section className="workflow-step-panel" aria-label="全局布局">
          <TemplatePicker
            templates={templates}
            currentTemplateId={currentTemplateId}
            customTemplates={customTemplates}
            onApplyTemplate={onApplyTemplate}
            onApplyCustomTemplate={onApplyCustomTemplate}
            onSaveTemplate={onSaveTemplate}
          />
          <div className="workflow-layout-shortcuts" role="group" aria-label="全局布局分区">
            <button type="button" onClick={() => onOpenGlobalSettings("canvas")}>画布</button>
            <button type="button" onClick={() => onOpenGlobalSettings("map")}>地图</button>
            <button type="button" onClick={() => onOpenGlobalSettings("cards")}>数据板块</button>
            <button type="button" onClick={() => onOpenGlobalSettings("guests")}>辅助板块</button>
            <button type="button" onClick={() => onOpenGlobalSettings("typography")}>字体排版</button>
          </div>
          <button type="button" className="wide-button" onClick={onArrangeCards}>
            一键智能排版
          </button>
          <p className="panel-note">模板决定整套地图元素；分区按钮打开对应全屏设置；智能排版会清除手动位置覆盖并重新执行地理布局。</p>
        </section>
      )}

      {activeStep === "local" && showStepPanel && (
        <section className="workflow-step-panel" aria-label="局部调整">
          <p className="panel-note">{selectionDescription}点击画布中的省份、卡片、文字或素材，可在右侧调整；省份贴图请在素材库上传应用。</p>
          <button
            type="button"
            className="wide-button"
            onClick={onOpenAssets}
          >
            打开素材库
          </button>
        </section>
      )}

      {activeStep === "export" && showStepPanel && (
        <section className="workflow-step-panel" aria-label="检查导出">
          {exportWarnings.unresolvedStudents.length > 0 && (
            <div className="workflow-warning-list" aria-label="未匹配城市">
              <strong>未匹配城市（{exportWarnings.unresolvedStudents.length}）</strong>
              {exportWarnings.unresolvedStudents.map((student) => (
                <button key={student.id} type="button" onClick={() => onFocusStudent(student.id)}>
                  {student.name} · {student.city}
                </button>
              ))}
            </div>
          )}
          {exportWarnings.hiddenStudents.length > 0 && (
            <div className="workflow-warning-list" aria-label="隐藏名单">
              <strong>隐藏名单（{exportWarnings.hiddenStudents.length}）</strong>
              {exportWarnings.hiddenStudents.map((student) => (
                <button key={student.id} type="button" onClick={() => onFocusStudent(student.id)}>
                  {student.name}
                </button>
              ))}
            </div>
          )}
          <div className="workflow-export-actions">
            <button type="button" className="secondary-button" onClick={onExportPng}>导出 PNG</button>
            <button type="button" className="secondary-button" onClick={onExportSvg}>导出 SVG</button>
            <button type="button" className="secondary-button" onClick={onExportProject}>导出工程</button>
            <button type="button" className="secondary-button" onClick={onSaveLocal}>保存到本机</button>
          </div>
          <p className="panel-note">点击名单项可跳转修正；导出前请确认未匹配城市与隐藏名单。</p>
        </section>
      )}

      {variant === "fullscreen" && activeStep === "layout" && globalSections.length > 0 && (
        <section className="workflow-guide__sections" aria-label="全局设置分区快捷入口">
          <h3 className="workflow-guide__sections-title">全局设置分区</h3>
          <div className="workflow-guide__section-links" role="group">
            {globalSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={activeSection === section.id ? "workflow-guide__section-link is-active" : "workflow-guide__section-link"}
                aria-pressed={activeSection === section.id}
                onClick={() => onOpenGlobalSettings(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );

  return (
    <div
      className={`workflow-guide workflow-guide--${variant} ${open ? "is-open" : ""}`}
      onMouseEnter={variant === "topbar" ? () => setOpen(true) : undefined}
      onMouseLeave={variant === "topbar" ? () => setOpen(false) : undefined}
      onFocus={variant === "topbar" ? () => setOpen(true) : undefined}
      onBlur={variant === "topbar" ? (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      } : undefined}
    >
      <button
        type="button"
        className="workflow-guide__bar"
        aria-expanded={open}
        aria-label={`制作流程：${activeStepMeta.index}/5 ${activeStepMeta.title}，${activeProgress.status === "ready" ? "已完成" : activeProgress.status === "warning" ? "有警告" : "未开始"}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="workflow-guide__step">
          {activeStepMeta.index}/{WORKFLOW_STEPS.length} · {activeStepMeta.title}
        </span>
        <span className="workflow-guide__dots" aria-hidden="true">
          {WORKFLOW_STEPS.map((step) => (
            <span
              key={step.id}
              className="workflow-guide__dot"
              data-status={stepProgress(progress, step.id).status}
              data-active={activeStep === step.id || undefined}
            />
          ))}
        </span>
      </button>
      {open && <div className="workflow-guide__panel">{panel}</div>}
    </div>
  );
}
