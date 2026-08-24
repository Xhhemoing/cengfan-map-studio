/**
 * 工程级动作：应用内置 / 自定义模板、保存当前版式为自定义模板、
 * 新建 / 恢复本机项目，以及添加装饰素材与应用画布背景。
 * 自 App.tsx 提取（Round 4），行为保持一致。
 */
import type { Dispatch, SetStateAction } from "react";
import type { ActivePanel } from "../lib/app-constants";
import { loadInitialProject } from "../lib/app-initialization";
import { createDecorationElement } from "../lib/asset-elements";
import type { StudioAsset } from "../lib/assets";
import { createId } from "../lib/ids";
import type { MapTemplateId } from "../lib/project-data";
import {
  applyTransaction,
  createProjectDocument,
  type ProjectDocument,
} from "../lib/project-document";
import type { SceneSelection } from "../lib/scene-document";
import {
  buildCustomTemplateDraft,
  createApplySystemTemplateTransaction,
} from "../lib/studio-editor-helpers";
import { applyCustomTemplateToProject, type CustomTemplateRecord } from "../lib/template-store";
import type { WorkflowStepId } from "../lib/workflow-progress";
import type { WorkflowStageId } from "../lib/workflow-stages";

export interface UseProjectActionsOptions {
  project: ProjectDocument;
  customTemplates: CustomTemplateRecord[];
  setCustomTemplates: (records: CustomTemplateRecord[]) => void;
  /** 新建 / 恢复项目直接替换文档（绕过协作只读门槛，与提取前一致）。 */
  setProject: Dispatch<SetStateAction<ProjectDocument>>;
  commitProject: (next: ProjectDocument) => void;
  setStatusMessage: (message: string) => void;
  setSelection: (next: SceneSelection) => void;
  setSelectedStudentId: (id: string | null) => void;
  setActivePanel: (panel: ActivePanel) => void;
  setActiveWorkflowStep: (step: WorkflowStepId) => void;
  setActiveStage: (stage: WorkflowStageId) => void;
}

export function useProjectActions({
  project,
  customTemplates,
  setCustomTemplates,
  setProject,
  commitProject,
  setStatusMessage,
  setSelection,
  setSelectedStudentId,
  setActivePanel,
  setActiveWorkflowStep,
  setActiveStage,
}: UseProjectActionsOptions) {
  const applySystemTemplate = (templateId: MapTemplateId) => {
    commitProject(applyTransaction(project, createApplySystemTemplateTransaction(templateId)));
  };

  const applyCustomTemplateRecord = (record: CustomTemplateRecord) => {
    commitProject(
      applyTransaction(project, {
        id: `tx-custom-${record.id}`,
        label: `应用自定义模板：${record.name}`,
        source: "manual",
        apply: (current) => applyCustomTemplateToProject(current, record),
      }),
    );
  };

  const saveCurrentTemplate = () => {
    const name = window.prompt("自定义模板名称", "我的地图版式");
    if (!name?.trim()) return;
    const scope = window.confirm("点击“确定”保存视觉样式；点击“取消”保存布局倾向（含卡片分组）")
      ? "visual"
      : "layout";
    const record = buildCustomTemplateDraft(project, name, scope);
    const next = [record, ...customTemplates].slice(0, 20);
    setCustomTemplates(next);
    setStatusMessage(`已保存模板：${record.name}`);
  };

  const createNewProject = () => {
    if (!window.confirm("新建项目会清空当前未保存修改，是否继续？")) return;
    const next = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    setProject(next);
    setSelection({ type: "canvas" });
    setSelectedStudentId(null);
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setActiveStage("data");
    setStatusMessage("已新建空项目");
  };

  const restoreLocalProject = () => {
    const next = loadInitialProject();
    setProject(next);
    setSelection({ type: "canvas" });
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setActiveStage("data");
    setStatusMessage("已恢复本机最近项目");
  };

  const handleCreateDecoration = (asset: StudioAsset) => {
    const element = createDecorationElement(asset, {
      x: project.canvas.width - 180,
      y: project.canvas.height - 180,
    });
    commitProject(
      applyTransaction(project, {
        id: createId("tx-decoration"),
        label: `添加装饰：${asset.label}`,
        source: "manual",
        apply: (current) => ({
          ...current,
          assetElements: [...current.assetElements, element],
        }),
      }),
    );
    setSelection({ type: "asset", id: element.id });
  };

  const applyBackgroundAsset = (asset: StudioAsset) => {
    commitProject(applyTransaction(project, {
      id: createId("tx-bg"),
      label: `应用背景：${asset.label}`,
      source: "manual",
      apply: (current) => ({
        ...current,
        canvas: { ...current.canvas, backgroundImageSrc: asset.src },
        style: { ...current.style, backgroundImageSrc: asset.src },
      }),
    }));
  };

  return {
    applySystemTemplate,
    applyCustomTemplateRecord,
    saveCurrentTemplate,
    createNewProject,
    restoreLocalProject,
    handleCreateDecoration,
    applyBackgroundAsset,
  };
}
