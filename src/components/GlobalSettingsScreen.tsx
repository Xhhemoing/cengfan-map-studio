import { ArrowLeft, LayoutPanelTop, Map, Redo2, RectangleHorizontal, Settings2, Type, Undo2, Wallpaper } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import type { ProjectDocument } from "../lib/project-document";
import type { UserFont } from "../lib/fonts";
import type { SceneSelection } from "../lib/scene-document";
import { CanvasInspector } from "./inspector/CanvasInspector";
import { CardsInspector } from "./inspector/CardsInspector";
import { GuestsInspector } from "./inspector/GuestsInspector";
import { MapInspector } from "./inspector/MapInspector";
import { DataWorkspace } from "./DataWorkspace";
import type { DataViewId, MapTemplateId, Student } from "../lib/project-data";
import { TypographyPanel } from "./TypographyPanel";
import type { TypographyTarget } from "../lib/typography";
import { WorkflowGuide } from "./WorkflowGuide";
import type { WorkflowProgress, WorkflowStepId, WorkflowStepStatus } from "../lib/workflow-progress";
import { TemplatePicker } from "./TemplatePicker";
import { CardPresentationSettings } from "./CardPresentationSettings";

export type GlobalSettingsSection = "canvas" | "map" | "cards" | "guests" | "typography" | "advanced";

interface SettingsSection {
  id: GlobalSettingsSection;
  label: string;
  description: string;
  icon: typeof Wallpaper;
}

interface SettingsSectionGroup {
  id: string;
  label: string;
  sections: readonly SettingsSection[];
}

function sectionBadge(workflowProgress: WorkflowProgress, section: GlobalSettingsSection): { status: WorkflowStepStatus; text: string } | null {
  // 数据板块与名单准备步骤挂钩，导航条目显示其完成状态
  if (section !== "cards") return null;
  const roster = workflowProgress.roster;
  const text = roster.status === "ready" ? "✓" : roster.status === "warning" ? "!" : "1";
  return { status: roster.status, text };
}

const sectionGroups: readonly SettingsSectionGroup[] = [
  {
    id: "global-design",
    label: "全局设计",
    sections: [
      { id: "canvas", label: "画布设置", description: "尺寸、安全边距与背景", icon: Wallpaper },
      { id: "map", label: "地图展示框", description: "位置、范围与地图外观", icon: Map },
      { id: "cards", label: "数据板块", description: "人员数据与数据展示", icon: RectangleHorizontal },
    ],
  },
  {
    id: "other",
    label: "其他设置",
    sections: [
      { id: "guests", label: "辅助板块", description: "嘉宾板块的位置与外观", icon: LayoutPanelTop },
      { id: "typography", label: "字体排版", description: "统一设置文字字体与样式", icon: Type },
      { id: "advanced", label: "高级设置", description: "内容字段与姓名展示规则", icon: Settings2 },
    ],
  },
];

const allSections: readonly SettingsSection[] = sectionGroups.flatMap((group) => group.sections);

const workflowStepDescriptions: Record<WorkflowStepId, string> = {
  roster: "整理名单并修正未匹配城市",
  presentation: "选择省份卡片、热力或图钉等地图呈现方式",
  layout: "集中设置画布、地图展示框、数据板块与字体",
  local: "返回编辑器调整省份、卡片、文字与素材",
  export: "检查未匹配或隐藏名单后导出海报与工程",
};

export function GlobalSettingsScreen({
  project,
  userFonts = [],
  initialSection = "canvas",
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onClose,
  onUndo,
  onRedo,
  onPatch,
  onReset,
  onArrangeCards,
  selectedStudentId,
  onSelectStudent,
  onChangeDataView,
  onAppendStudents,
  onReplaceStudents,
  onUpdateStudent,
  onToggleStudentVisibility,
  onDeleteStudent,
  onSetStudentsVisibility,
  provinces,
  onApplyFont,
  onUploadFont,
  onDeleteUserFont,
  workflowProgress,
  workflowActiveStep,
  workflowDataViewLabel,
  onWorkflowStep,
  templates,
  currentTemplateId,
  customTemplates,
  onApplyTemplate,
  onApplyCustomTemplate,
  onSaveTemplate,
}: {
  project: ProjectDocument;
  userFonts?: UserFont[];
  initialSection?: GlobalSettingsSection;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPatch: (target: SceneSelection, patch: Record<string, unknown>) => void;
  onReset: (target: Extract<SceneSelection, { type: "canvas" | "map" | "cards" }>) => void;
  onArrangeCards: () => void;
  selectedStudentId: string | null;
  onSelectStudent: (id: string) => void;
  onChangeDataView: (view: DataViewId) => void;
  onAppendStudents: (students: Student[]) => void;
  onReplaceStudents: (students: Student[]) => void;
  onUpdateStudent: (id: string, patch: Partial<Pick<Student, "name" | "university" | "city" | "province" | "locationScope">>) => void;
  onToggleStudentVisibility: (id: string) => void;
  onDeleteStudent: (id: string) => void;
  onSetStudentsVisibility: (visibility: boolean) => void;
  provinces: readonly string[];
  onApplyFont: (target: TypographyTarget, fontId: string, applyToAll: boolean) => void;
  onUploadFont?: (font: UserFont) => void;
  onDeleteUserFont?: (fontId: string) => void;
  workflowProgress: WorkflowProgress;
  workflowActiveStep: WorkflowStepId;
  workflowDataViewLabel: string;
  onWorkflowStep: (step: WorkflowStepId) => void;
  templates: Array<{ id: MapTemplateId; name: string }>;
  currentTemplateId: string;
  customTemplates: Array<{ id: string; name: string; scope: "visual" | "layout" }>;
  onApplyTemplate: (id: MapTemplateId) => void;
  onApplyCustomTemplate: (record: { id: string; name: string; scope: "visual" | "layout" }) => void;
  onSaveTemplate: () => void;
}) {
  const [activeSection, setActiveSection] = useState<GlobalSettingsSection>(initialSection);
  const [dataView, setDataView] = useState<"people" | "cards">("people");

  const handleWorkflowStep = (step: WorkflowStepId) => {
    if (step === "roster" || step === "presentation") {
      setActiveSection("cards");
      if (step === "roster") setDataView("people");
      if (step === "presentation") setDataView("cards");
    }
    if (step === "layout") {
      // 回到「全局设计」组：已在组内保持当前分区，否则默认画布设置
      const inGlobalDesign = sectionGroups[0]!.sections.some((section) => section.id === activeSection);
      if (!inGlobalDesign) setActiveSection("canvas");
    }
    if (step === "local" || step === "export") onClose();
    onWorkflowStep(step);
  };

  const handleSectionClick = (section: GlobalSettingsSection) => {
    setActiveSection(section);
    // 全局设置是「全局布局」步骤的工作台：手动切换分区时把引导步骤同步为 layout
    onWorkflowStep("layout");
  };
  const active = allSections.find((section) => section.id === activeSection) ?? allSections[0]!;

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + allSections.length) % allSections.length;
    const next = allSections[nextIndex];
    if (!next) return;
    setActiveSection(next.id);
    document.getElementById(`global-settings-tab-${next.id}`)?.focus();
  };

  return (
    <main className="global-settings-screen" aria-label="全局设置">
      <header className="global-settings-header">
        <button type="button" className="global-settings-back" aria-label="返回编辑器" onClick={onClose}>
          <ArrowLeft size={18} aria-hidden />
          <span>返回编辑器</span>
        </button>
        <div className="global-settings-title">
          <h1>全局设置</h1>
          <p>配置当前作品的画布与整体布局</p>
        </div>
        <div className="global-settings-history" role="group" aria-label="全局设置历史">
          <button type="button" aria-label={undoLabel} title={undoLabel} disabled={!canUndo} onClick={onUndo}>
            <Undo2 size={17} aria-hidden />
            <span>撤销</span>
          </button>
          <button type="button" aria-label={redoLabel} title={redoLabel} disabled={!canRedo} onClick={onRedo}>
            <Redo2 size={17} aria-hidden />
            <span>重做</span>
          </button>
          <button type="button" className="global-settings-done" onClick={onClose}>完成</button>
        </div>
      </header>

      <div className="global-settings-guide">
        <WorkflowGuide
          progress={workflowProgress}
          activeStep={workflowActiveStep}
          dataViewLabel={workflowDataViewLabel}
          variant="fullscreen"
          showStepPanel={false}
          globalSections={allSections.map(({ id, label }) => ({ id, label }))}
          activeSection={activeSection}
          onOpenGlobalSettings={(section) => handleSectionClick(section)}
          onSelectStep={handleWorkflowStep}
        />
        <p className="global-settings-guide__note">
          {workflowStepDescriptions[workflowActiveStep]}。
        </p>
      </div>

      <div className="global-settings-layout">
        <nav className="global-settings-nav" role="tablist" aria-label="全局设置分区">
          {sectionGroups.map((group) => (
            <div key={group.id} className="global-settings-group" role="presentation">
              <h2 className="global-settings-group-label" role="presentation">{group.label}</h2>
              {group.sections.map(({ id, label, description, icon: Icon }) => {
                const tabIndex = allSections.findIndex((section) => section.id === id);
                const badge = sectionBadge(workflowProgress, id);
                return (
                  <button
                    key={id}
                    id={`global-settings-tab-${id}`}
                    type="button"
                    role="tab"
                    aria-selected={activeSection === id}
                    aria-controls={`global-settings-${id}`}
                    tabIndex={activeSection === id ? 0 : -1}
                    className={activeSection === id ? "is-active" : undefined}
                    onClick={() => handleSectionClick(id)}
                    onKeyDown={(event) => onTabKeyDown(event, tabIndex)}
                  >
                    <Icon size={18} aria-hidden />
                    <span><strong>{label}</strong><small>{description}</small></span>
                    {badge && (
                      <span
                        className="global-settings-nav__badge"
                        data-status={badge.status}
                        aria-label={`${label}：名单${badge.status === "ready" ? "已就绪" : badge.status === "warning" ? "有警告" : "未开始"}`}
                      >
                        {badge.text}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <section
          id={`global-settings-${activeSection}`}
          className="global-settings-content"
          role="tabpanel"
          aria-labelledby={`global-settings-tab-${activeSection}`}
          tabIndex={0}
        >
          <div className="global-settings-section-heading">
            <span>{active.label}</span>
            <small>{active.description}</small>
          </div>
          <div className="global-settings-form">
            {activeSection === "canvas" && (
              <CanvasInspector
                canvas={project.canvas}
                onPatch={(patch) => onPatch({ type: "canvas" }, patch)}
                onReset={() => onReset({ type: "canvas" })}
              />
            )}
            {activeSection === "map" && (
              <MapInspector
                map={project.map}
                mode="global"
                collapsible
                onPatch={(patch) => onPatch({ type: "map" }, patch)}
                onReset={() => onReset({ type: "map" })}
              />
            )}
            {activeSection === "cards" && (
              <>
                <div className="global-settings-data-nav" role="group" aria-label="数据板块内容">
                  <button type="button" aria-pressed={dataView === "people"} className={dataView === "people" ? "is-active" : undefined} onClick={() => setDataView("people")}>人员数据</button>
                  <button type="button" aria-label="数据展示设置" aria-pressed={dataView === "cards"} className={dataView === "cards" ? "is-active" : undefined} onClick={() => setDataView("cards")}>数据展示</button>
                </div>
                {dataView === "people" ? (
                  <DataWorkspace
                    students={project.students}
                    dataView={project.dataView}
                    onChangeDataView={onChangeDataView}
                    onAppendStudents={onAppendStudents}
                    onReplaceStudents={onReplaceStudents}
                    onUpdateStudent={onUpdateStudent}
                    onToggleVisibility={onToggleStudentVisibility}
                    onDeleteStudent={onDeleteStudent}
                    onSetStudentsVisibility={onSetStudentsVisibility}
                    selectedStudentId={selectedStudentId}
                    onSelectStudent={onSelectStudent}
                  />
                ) : <>
                  <TemplatePicker
                    templates={templates}
                    currentTemplateId={currentTemplateId}
                    customTemplates={customTemplates}
                    onApplyTemplate={onApplyTemplate}
                    onApplyCustomTemplate={onApplyCustomTemplate}
                    onSaveTemplate={onSaveTemplate}
                  />
                  <button type="button" className="global-settings-arrange" aria-label="一键智能排版" onClick={onArrangeCards}>
                    一键智能排版
                  </button>
                  <CardsInspector
                    cards={project.cards}
                    userFonts={userFonts}
                    mode="global"
                    collapsible
                    onPatch={(patch) => onPatch({ type: "cards" }, patch)}
                    onReset={() => onReset({ type: "cards" })}
                  />
                </>}
              </>
            )}
            {activeSection === "guests" && (
              <GuestsInspector
                guests={project.guests}
                layoutOnly
                onPatch={(patch) => onPatch({ type: "guests" }, patch)}
              />
            )}
            {activeSection === "typography" && (
              <TypographyPanel
                project={project}
                provinces={provinces}
                userFonts={userFonts}
                onApplyFont={onApplyFont}
                onPatch={onPatch}
                onUploadFont={onUploadFont}
                onDeleteUserFont={onDeleteUserFont}
              />
            )}
            {activeSection === "advanced" && (
              <CardPresentationSettings
                cards={project.cards}
                onPatch={(patch) => onPatch({ type: "cards" }, patch)}
              />
            )}
          </div>
        </section>
      </div>

      <footer className="global-settings-status">
        <span>修改实时应用到当前工程</span>
        <span>{project.canvas.width} × {project.canvas.height}px</span>
      </footer>
    </main>
  );
}
