/**
 * 把编辑器整体换掉的两条路:新建空项目、恢复本机最近一份草稿。
 *
 * 两者都要把选区、面板、流程步骤一起复位——只换工程不复位,用户会停在一个指向
 * 旧工程里某个元素的属性面板上。差别只有一处:新建会连学生选中一起清掉。
 */
import type { ActivePanel } from "./app-constants";
import { loadInitialProject } from "./app-initialization";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import type { SceneSelection } from "./scene-document";
import type { WorkflowStageId } from "./workflow-stages";
import type { WorkflowStepId } from "./workflow-progress";

export interface ProjectResetActionsOptions {
  setProject(project: ProjectDocument): void;
  clearPreviewCommands(): void;
  setSelection(selection: SceneSelection): void;
  setSelectedStudentId(id: string | null): void;
  setActivePanel(panel: ActivePanel): void;
  setActiveWorkflowStep(step: WorkflowStepId): void;
  setActiveStage(stage: WorkflowStageId): void;
  reportStatus(message: string): void;
}

export interface ProjectResetActions {
  createNewProject(): void;
  restoreLocalProject(): void;
}

export function createProjectResetActions(options: ProjectResetActionsOptions): ProjectResetActions {
  return {
    createNewProject: () => {
      if (!window.confirm("新建项目会清空当前未保存修改，是否继续？")) return;
      const next = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
      options.setProject(next);
      options.clearPreviewCommands();
      options.setSelection({ type: "canvas" });
      options.setSelectedStudentId(null);
      options.setActivePanel("roster");
      options.setActiveWorkflowStep("roster");
      options.setActiveStage("data");
      options.reportStatus("已新建空项目");
    },
    restoreLocalProject: () => {
      const next = loadInitialProject();
      options.setProject(next);
      options.clearPreviewCommands();
      options.setSelection({ type: "canvas" });
      options.setActivePanel("roster");
      options.setActiveWorkflowStep("roster");
      options.setActiveStage("data");
      options.reportStatus("已恢复本机最近项目");
    },
  };
}
