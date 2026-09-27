import { Redo2, Undo2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { provinceNames } from "../../lib/app-constants";
import type { UserFont } from "../../lib/fonts";
import type { ProjectDocument } from "../../lib/project-document";
import { templatePickerProps, type EditorTemplateActions } from "../../lib/editor-template-actions";
import type { ResolvedTheme, ThemeMode } from "../../lib/theme";
import type { WorkflowProgress, WorkflowStepId } from "../../lib/workflow-progress";
import { GlobalSettingsScreen, type GlobalSettingsSection } from "../GlobalSettingsScreen";
import type { DataWorkspace } from "../DataWorkspace";
import { StudioTopbar } from "../StudioTopbar";
import { ThemeToggle } from "../ThemeToggle";
import { ToolbarButton, ToolbarGroup } from "../StudioUi";

type GlobalSettingsScreenProps = ComponentProps<typeof GlobalSettingsScreen>;
type DataWorkspaceProps = ComponentProps<typeof DataWorkspace> & {
  selectedStudentId: string | null;
  onSelectStudent: (id: string) => void;
  onChangeDataView: GlobalSettingsScreenProps["onChangeDataView"];
};

export interface GlobalSettingsShellProps {
  section: GlobalSettingsSection;
  theme: ResolvedTheme;
  skin: string;
  project: ProjectDocument;
  userFonts: UserFont[];
  templateActions: EditorTemplateActions;
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
  onOpenGlobalData: () => void;
}

/**
 * 全局设置整屏分支:共用顶栏(历史 + 阶段导航 + 页面操作)加 `GlobalSettingsScreen`。
 * 系统模板清单与自定义模板的 id→记录回查留在这里,App 只交出原始数据。
 */
export function GlobalSettingsShell({
  section,
  theme,
  skin,
  project,
  userFonts,
  templateActions,
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
  onOpenGlobalData,
}: GlobalSettingsShellProps) {
  return (
    <div className="app-shell" data-editor-theme={theme} data-editor-skin={skin}>
      <StudioTopbar
        workflowNav={workflowNav}
        historyActions={
          <ToolbarGroup label="全局设置历史" className="global-settings-history">
            <ToolbarButton label={undoLabel} icon={<Undo2 size={18} />} disabled={!canUndo} onClick={onUndo} />
            <ToolbarButton label={redoLabel} icon={<Redo2 size={18} />} disabled={!canRedo} onClick={onRedo} />
          </ToolbarGroup>
        }
        stageActions={<button type="button" className="primary-button global-settings-done" onClick={onClose}>完成</button>}
        projectActions={<>
          {backButton}
          <ToolbarGroup label="界面主题">
            <ThemeToggle mode={themeMode} resolvedTheme={theme} onChange={onThemeChange} />
          </ToolbarGroup>
        </>}
      />
      <GlobalSettingsScreen
        embeddedHeader
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
        {...templatePickerProps(templateActions)}
        onOpenGlobalData={onOpenGlobalData}
        themeMode={themeMode}
        resolvedTheme={theme}
        onThemeChange={onThemeChange}
      />
    </div>
  );
}
