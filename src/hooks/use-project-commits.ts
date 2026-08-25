/**
 * 工程提交管线：协作只读门槛统一拦截、AI 预览文档（agentPreview）在事务
 * 提交时清除、撤销/重做动作与键盘快捷键。所有落盘修改都经 commitProject /
 * commitProjectTransaction 走这里。自 App.tsx 提取（Round 4），行为保持一致。
 */
import { useState, type Dispatch, type SetStateAction } from "react";
import {
  applyTransaction,
  redoTransaction,
  undoTransaction,
  type ProjectDocument,
  type ProjectTransaction,
} from "../lib/project-document";
import { describeProjectHistory, type ProjectHistorySummary } from "../lib/studio-editor-helpers";
import { useUndoRedoShortcuts } from "./use-undo-redo-shortcuts";

export interface UseProjectCommitsOptions {
  project: ProjectDocument;
  setProject: Dispatch<SetStateAction<ProjectDocument>>;
  /** 协作只读门槛与提示出口（useCollaborationSync 结果的子集）。 */
  collaboration: {
    canEdit: boolean;
    setCollaborationMessage: (message: string) => void;
  };
  /** 提交成功后把本地保存状态标记为待保存（useWorkspacePersistence 的 workspaceSync）。 */
  markWorkspacePending: () => void;
}

export interface ProjectCommits {
  /** AI 助手的预览文档；非空时画布渲染预览而非权威文档。 */
  agentPreview: ProjectDocument | null;
  setAgentPreview: (preview: ProjectDocument | null) => void;
  /** 撤销/重做按钮的可用状态与提示文案。 */
  history: ProjectHistorySummary;
  commitProject: (next: ProjectDocument) => void;
  commitProjectTransaction: (transaction: ProjectTransaction) => void;
  handleUndo: () => void;
  handleRedo: () => void;
}

export function useProjectCommits({
  project,
  setProject,
  collaboration,
  markWorkspacePending,
}: UseProjectCommitsOptions): ProjectCommits {
  const [agentPreview, setAgentPreview] = useState<ProjectDocument | null>(null);

  const commitProject = (next: ProjectDocument) => {
    if (!collaboration.canEdit) {
      collaboration.setCollaborationMessage("当前仅查看，无法修改此工程");
      return;
    }
    setProject(next);
    markWorkspacePending();
  };

  const commitProjectTransaction = (transaction: ProjectTransaction) => {
    if (!collaboration.canEdit) {
      collaboration.setCollaborationMessage("当前仅查看，无法修改此工程");
      return;
    }
    setProject((current) => applyTransaction(current, transaction));
    setAgentPreview(null);
    markWorkspacePending();
  };

  const history = describeProjectHistory(project.history);

  const handleUndo = () => {
    if (!history.canUndo) return;
    commitProject(undoTransaction(project));
  };

  const handleRedo = () => {
    if (!history.canRedo) return;
    commitProject(redoTransaction(project));
  };

  useUndoRedoShortcuts(handleUndo, handleRedo);

  return {
    agentPreview,
    setAgentPreview,
    history,
    commitProject,
    commitProjectTransaction,
    handleUndo,
    handleRedo,
  };
}
