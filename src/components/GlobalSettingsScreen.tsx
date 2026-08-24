import { Database, LayoutPanelTop, Map, Redo2, RectangleHorizontal, Settings2, Type, Undo2, Wallpaper } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
import type { WorkflowProgress, WorkflowStepId, WorkflowStepStatus } from "../lib/workflow-progress";
import { TemplatePicker } from "./TemplatePicker";
import { CardPresentationSettings } from "./CardPresentationSettings";
import { ThemeToggle } from "./ThemeToggle";
import type { ResolvedTheme, ThemeMode } from "../lib/theme";
import { ActionGroup, CompactButton, IconButton, SegmentedControl } from "./StudioUi";

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

// 分区导航宽屏竖排、窄屏横排，上下与左右都映射到同一条扁平顺序（跨分组循环）。
function nextSectionIndex(key: string, index: number): number | null {
  switch (key) {
    case "ArrowDown":
    case "ArrowRight": return (index + 1) % allSections.length;
    case "ArrowUp":
    case "ArrowLeft": return (index - 1 + allSections.length) % allSections.length;
    case "Home": return 0;
    case "End": return allSections.length - 1;
    default: return null;
  }
}

const workflowStepDescriptions: Record<WorkflowStepId, string> = {
  roster: "整理名单并修正未匹配城市",
  presentation: "选择省份卡片、热力或图钉等地图呈现方式",
  layout: "集中设置画布、地图展示框、数据板块与字体",
  local: "返回编辑器调整省份、卡片、文字与素材",
  export: "检查未匹配或隐藏名单后导出海报与工程",
};

const workflowStepLabels: Record<WorkflowStepId, string> = {
  roster: "准备名单",
  presentation: "地图呈现",
  layout: "全局布局",
  local: "局部调整",
  export: "检查导出",
};

/** 进入设置前那个控件的定位信息。只记 id / aria-label：整树替换后原节点已经卸载，持有它没有意义。 */
export interface SettingsFocusAnchor {
  id: string | null;
  label: string | null;
}

// 编辑器里常驻的设置入口，用作找不到原控件时的等价落点。
const settingsEntryLabels = ["打开全局设置", "打开全局视觉设置"] as const;

function focusableOrNull(node: Element | null): HTMLElement | null {
  if (!(node instanceof HTMLElement) || node === document.body || !node.isConnected) return null;
  if (node.hasAttribute("disabled") || node.getAttribute("aria-hidden") === "true" || node.tabIndex < 0) return null;
  return node;
}

function findByLabel(label: string | null): HTMLElement | null {
  if (!label) return null;
  for (const node of document.querySelectorAll<HTMLElement>("[aria-label]")) {
    if (node.getAttribute("aria-label") !== label) continue;
    const focusable = focusableOrNull(node);
    if (focusable) return focusable;
  }
  return null;
}

/** 打开全局设置时调用，记录当前焦点的定位信息。 */
export function describeSettingsFocusAnchor(node: Element | null): SettingsFocusAnchor | null {
  const element = focusableOrNull(node);
  if (!element) return null;
  const id = element.id || null;
  const label = element.getAttribute("aria-label");
  return id || label ? { id, label } : null;
}

/** 离开全局设置、编辑器重挂之后调用，按记录找回落点。 */
export function findSettingsFocusAnchor(anchor: SettingsFocusAnchor | null): HTMLElement | null {
  const byId = anchor?.id ? focusableOrNull(document.getElementById(anchor.id)) : null;
  if (byId) return byId;
  const byLabel = findByLabel(anchor?.label ?? null);
  if (byLabel) return byLabel;
  // 触发按钮所在面板未必跟着回来（助手栏会重置到默认页），退回编辑器里常驻的设置入口。
  for (const label of settingsEntryLabels) {
    const fallback = findByLabel(label);
    if (fallback) return fallback;
  }
  return null;
}

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
  templates,
  currentTemplateId,
  customTemplates,
  onApplyTemplate,
  onApplyCustomTemplate,
  onSaveTemplate,
  onOpenGlobalData,
  themeMode,
  resolvedTheme,
  onThemeChange,
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
  templates: Array<{ id: MapTemplateId; name: string }>;
  currentTemplateId: string;
  customTemplates: Array<{ id: string; name: string; scope: "visual" | "layout" }>;
  onApplyTemplate: (id: MapTemplateId) => void;
  onApplyCustomTemplate: (record: { id: string; name: string; scope: "visual" | "layout" }) => void;
  onSaveTemplate: () => void;
  onOpenGlobalData?: () => void;
  themeMode?: ThemeMode;
  resolvedTheme?: ResolvedTheme;
  onThemeChange?: (mode: ThemeMode) => void;
}) {
  const [activeSection, setActiveSection] = useState<GlobalSettingsSection>(initialSection);
  const [dataView, setDataView] = useState<"people" | "cards">("people");
  const screenRef = useRef<HTMLElement | null>(null);

  // 这块屏是整树替换上来的，触发按钮随编辑器一起卸载、焦点掉到 body：
  // 只有焦点确实无处可去时才接管，放到当前分区标签上，键盘用户可以直接方向键换分区。
  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    screenRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  }, []);

  const handleSectionClick = (section: GlobalSettingsSection) => {
    setActiveSection(section);
  };
  const active = allSections.find((section) => section.id === activeSection) ?? allSections[0]!;

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = nextSectionIndex(event.key, index);
    if (nextIndex === null) return;
    event.preventDefault();
    const next = allSections[nextIndex];
    if (!next) return;
    setActiveSection(next.id);
    document.getElementById(`global-settings-tab-${next.id}`)?.focus();
  };

  return (
    <main className="global-settings-screen" aria-label="全局设置" ref={screenRef}>
      <header className="global-settings-header">
        <ActionGroup label="全局设置历史" className="global-settings-history">
          <IconButton label={undoLabel} icon={<Undo2 size={17} aria-hidden />} disabled={!canUndo} onClick={onUndo} />
          <IconButton label={redoLabel} icon={<Redo2 size={17} aria-hidden />} disabled={!canRedo} onClick={onRedo} />
          {themeMode && resolvedTheme && onThemeChange && (
            <ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={onThemeChange} />
          )}
          <CompactButton className="global-settings-done" onClick={onClose}>完成</CompactButton>
        </ActionGroup>
      </header>

      <div className="global-settings-guide" role="status">
        <strong className="global-settings-guide__step">当前流程：{workflowStepLabels[workflowActiveStep]}</strong>
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
                {onOpenGlobalData && (
                  <CompactButton
                    className="global-settings-open-data"
                    icon={<Database size={14} aria-hidden />}
                    aria-label="打开全局数据"
                    onClick={onOpenGlobalData}
                  >
                    打开全局数据
                  </CompactButton>
                )}
                <SegmentedControl
                  label="数据板块内容"
                  activeId={dataView}
                  items={[{ id: "people", label: "人员数据" }, { id: "cards", label: "数据展示", ariaLabel: "数据展示设置" }]}
                  onChange={setDataView}
                  className="global-settings-data-nav"
                />
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
