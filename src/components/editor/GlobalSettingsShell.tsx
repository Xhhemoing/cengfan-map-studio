import { MapPinned } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { provinceNames } from "../../lib/app-constants";
import type { UserFont } from "../../lib/fonts";
import type { ProjectDocument } from "../../lib/project-document";
import { createSystemTemplate } from "../../lib/template-document";
import type { CustomTemplateRecord } from "../../lib/template-store";
import type { ResolvedTheme, ThemeMode } from "../../lib/theme";
import type { WorkflowProgress, WorkflowStepId } from "../../lib/workflow-progress";
import { GlobalSettingsScreen, type GlobalSettingsSection } from "../GlobalSettingsScreen";
import type { DataWorkspace } from "../DataWorkspace";

type GlobalSettingsScreenProps = ComponentProps<typeof GlobalSettingsScreen>;
type DataWorkspaceProps = ComponentProps<typeof DataWorkspace> & {
  selectedStudentId: string | null;
  onSelectStudent: (id: string) => void;
  onChangeDataView: GlobalSettingsScreenProps["onChangeDataView"];
};

const SYSTEM_TEMPLATE_IDS = ["original", "cartoon", "grain", "q", "scenery"] as const;

export interface GlobalSettingsShellProps {
  section: GlobalSettingsSection;
  theme: ResolvedTheme;
  skin: string;
  project: ProjectDocument;
  userFonts: UserFont[];
  currentTemplateId: string;
  customTemplates: CustomTemplateRecord[];
  dataWorkspaceProps: DataWorkspaceProps;
  workflowNav: ReactNode;
  backButton: ReactNode;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  workflowProgress: WorkflowProgress;
  workflowActiveStep: WorkflowStepId;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPatch: GlobalSettingsScreenProps["onPatch"];
  onReset: GlobalSettingsScreenProps["onReset"];
  onApplyFont: GlobalSettingsScreenProps["onApplyFont"];
  onUploadFont: NonNullable<GlobalSettingsScreenProps["onUploadFont"]>;
  onDeleteUserFont: NonNullable<GlobalSettingsScreenProps["onDeleteUserFont"]>;
  onApplyTemplate: GlobalSettingsScreenProps["onApplyTemplate"];
  onApplyCustomTemplate: (record: CustomTemplateRecord) => void;
  onSaveTemplate: () => void;
  onOpenGlobalData: () => void;
}

/**
 * 全局设置整屏分支:精简顶栏(品牌 + 阶段导航 + 返回列表)加 `GlobalSettingsScreen`。
 * 系统模板清单与自定义模板的 id→记录回查留在这里,App 只交出原始数据。
 */
export function GlobalSettingsShell({
  section,
  theme,
  skin,
  project,
  userFonts,
  currentTemplateId,
  customTemplates,
  dataWorkspaceProps,
  workflowNav,
  backButton,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  workflowProgress,
  workflowActiveStep,
  themeMode,
  onThemeChange,
  onClose,
  onUndo,
  onRedo,
  onPatch,
  onReset,
  onApplyFont,
  onUploadFont,
  onDeleteUserFont,
  onApplyTemplate,
  onApplyCustomTemplate,
  onSaveTemplate,
  onOpenGlobalData,
}: GlobalSettingsShellProps) {
  return (
    <div className="app-shell" data-editor-theme={theme} data-editor-skin={skin}>
      <header className="topbar">
        <div className="brand">
          <MapPinned size={24} />
          <span className="brand-label brand-label__full">蹭饭地图工作室</span>
          <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
          <em>Beta</em>
        </div>
        <div className="topbar-workflow">
          {workflowNav}
        </div>
        <div className="topbar-actions">
          {backButton}
        </div>
      </header>
      <GlobalSettingsScreen
        project={project}
        userFonts={userFonts}
        initialSection={section}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        onClose={onClose}
        onUndo={onUndo}
        onRedo={onRedo}
        onPatch={onPatch}
        onReset={onReset}
        selectedStudentId={dataWorkspaceProps.selectedStudentId}
        onSelectStudent={dataWorkspaceProps.onSelectStudent}
        onChangeDataView={dataWorkspaceProps.onChangeDataView}
        onAppendStudents={dataWorkspaceProps.onAppendStudents}
        onReplaceStudents={dataWorkspaceProps.onReplaceStudents}
        onUpdateStudent={dataWorkspaceProps.onUpdateStudent}
        onToggleStudentVisibility={dataWorkspaceProps.onToggleVisibility}
        onDeleteStudent={dataWorkspaceProps.onDeleteStudent}
        onSetStudentsVisibility={dataWorkspaceProps.onSetStudentsVisibility}
        provinces={provinceNames}
        onApplyFont={onApplyFont}
        onUploadFont={onUploadFont}
        onDeleteUserFont={onDeleteUserFont}
        workflowProgress={workflowProgress}
        workflowActiveStep={workflowActiveStep}
        templates={SYSTEM_TEMPLATE_IDS.map((templateId) => ({
          id: templateId,
          name: createSystemTemplate(templateId).name,
        }))}
        currentTemplateId={currentTemplateId}
        customTemplates={customTemplates.map(({ id, name, scope }) => ({ id, name, scope }))}
        onApplyTemplate={onApplyTemplate}
        onApplyCustomTemplate={(record) => {
          const full = customTemplates.find((item) => item.id === record.id);
          if (full) onApplyCustomTemplate(full);
        }}
        onSaveTemplate={onSaveTemplate}
        onOpenGlobalData={onOpenGlobalData}
        themeMode={themeMode}
        resolvedTheme={theme}
        onThemeChange={onThemeChange}
      />
    </div>
  );
}
