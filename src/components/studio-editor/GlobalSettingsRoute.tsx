/**
 * 全局设置整页路由（原 App.tsx 内联 JSX 抽出，行为不变）：
 * 顶栏（品牌 + 六步导航 + 返回项目列表）+ GlobalSettingsScreen 全量接线。
 * 文档状态与命令回调复用阶段上下文（StageSlotsContext），App 只构造一次。
 */
import { GlobalSettingsScreen, type GlobalSettingsSection } from "../GlobalSettingsScreen";
import { WorkflowStageStepper } from "../WorkflowStageStepper";
import { provinceNames } from "../../lib/app-constants";
import { WorkbenchBackButton } from "./WorkbenchBackButton";
import type { MapTemplateId } from "../../lib/project-data";
import { createSystemTemplate } from "../../lib/template-document";
import type { CustomTemplateRecord } from "../../lib/template-store";
import type { WorkflowProgress, WorkflowStepId } from "../../lib/workflow-progress";
import type { WorkflowStageId } from "../../lib/workflow-stages";
import type { StudioChrome } from "../../hooks/use-studio-chrome";
import type { StageSlotsContext } from "./stage-slots";
import { StudioBrand } from "./StudioBrand";

const SYSTEM_TEMPLATE_OPTIONS = (["original", "cartoon", "grain", "q", "scenery"] as const).map((templateId) => ({
  id: templateId,
  name: createSystemTemplate(templateId).name,
}));

export interface GlobalSettingsRouteProps {
  ctx: StageSlotsContext;
  section: GlobalSettingsSection;
  chrome: StudioChrome;
  activeStage: WorkflowStageId;
  workflowProgress: WorkflowProgress;
  workflowActiveStep: WorkflowStepId;
  projectId?: string;
  currentTemplateId: MapTemplateId;
  customTemplates: CustomTemplateRecord[];
  onStageChange: (stage: WorkflowStageId) => void;
  onBackToWorkbench: () => void;
  onClose: () => void;
  onApplyTemplate: (templateId: MapTemplateId) => void;
  onApplyCustomTemplate: (record: CustomTemplateRecord) => void;
  onSaveTemplate: () => void;
  onOpenGlobalData: () => void;
}

export function GlobalSettingsRoute({
  ctx,
  section,
  chrome,
  activeStage,
  workflowProgress,
  workflowActiveStep,
  projectId,
  currentTemplateId,
  customTemplates,
  onStageChange,
  onBackToWorkbench,
  onClose,
  onApplyTemplate,
  onApplyCustomTemplate,
  onSaveTemplate,
  onOpenGlobalData,
}: GlobalSettingsRouteProps) {
  const { dataWorkspaceProps } = ctx;
  return (
    <div className="app-shell" data-editor-theme={chrome.resolvedTheme} data-editor-skin={chrome.skin}>
      <header className="topbar">
        <StudioBrand />
        <div className="topbar-workflow">
          <WorkflowStageStepper activeId={activeStage} project={ctx.project} progress={workflowProgress} onChange={onStageChange} />
        </div>
        <div className="topbar-actions">
          {projectId && <WorkbenchBackButton onClick={onBackToWorkbench} />}
        </div>
      </header>
      <GlobalSettingsScreen
        project={ctx.project}
        userFonts={ctx.userFonts}
        initialSection={section}
        canUndo={ctx.canUndo}
        canRedo={ctx.canRedo}
        undoLabel={ctx.undoLabel}
        redoLabel={ctx.redoLabel}
        onClose={onClose}
        onUndo={ctx.onUndo}
        onRedo={ctx.onRedo}
        onPatch={ctx.onPatchScene}
        onReset={ctx.onResetScene}
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
        onApplyFont={ctx.onApplyFont}
        onUploadFont={ctx.onUploadFont}
        onDeleteUserFont={ctx.onDeleteUserFont}
        workflowProgress={workflowProgress}
        workflowActiveStep={workflowActiveStep}
        templates={SYSTEM_TEMPLATE_OPTIONS}
        currentTemplateId={currentTemplateId}
        customTemplates={customTemplates.map(({ id, name, scope }) => ({ id, name, scope }))}
        onApplyTemplate={onApplyTemplate}
        onApplyCustomTemplate={(record) => {
          const full = customTemplates.find((item) => item.id === record.id);
          if (full) onApplyCustomTemplate(full);
        }}
        onSaveTemplate={onSaveTemplate}
        onOpenGlobalData={onOpenGlobalData}
        themeMode={chrome.themeMode}
        resolvedTheme={chrome.resolvedTheme}
        onThemeChange={chrome.setThemeMode}
      />
    </div>
  );
}
