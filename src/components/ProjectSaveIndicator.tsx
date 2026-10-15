import { Save } from "lucide-react";
import type { LocalWorkspaceOverwriteState } from "../lib/incremental-workspace-sync";
import "../styles/project-save-indicator.css";

export interface ProjectSaveIndicatorProps {
  projectName: string;
  syncState: LocalWorkspaceOverwriteState;
  onSave: () => void;
}

const SAVE_LABELS = {
  idle: "尚未保存",
  pending: "有未保存修改",
  saving: "正在保存…",
  saved: "已保存",
  failed: "保存失败",
} as const;

/** Project identity and local persistence stay visible outside the tools menu. */
export function ProjectSaveIndicator({ projectName, syncState, onSave }: ProjectSaveIndicatorProps) {
  const savedAt = syncState.savedAt ? new Date(syncState.savedAt) : null;
  const validSavedAt = savedAt && Number.isFinite(savedAt.getTime()) ? savedAt : null;
  const savedTime = validSavedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const status = syncState.status === "saved" && savedTime
    ? `已保存 ${savedTime}` : SAVE_LABELS[syncState.status];
  const title = validSavedAt ? `上次保存：${validSavedAt.toLocaleString()}` : "数据保存在当前浏览器，请定期导出工程包备份";

  return (
    <div className="project-save-indicator" data-save-status={syncState.status}>
      <div className="project-save-indicator__copy">
        <strong title={projectName} aria-label={`当前项目：${projectName}`}>{projectName}</strong>
        <span role="status" aria-live="polite" aria-atomic="true" title={title}>{status}</span>
      </div>
      <button
        type="button"
        className="icon-button project-save-indicator__save"
        aria-label={syncState.status === "failed" ? "重试保存当前项目" : "保存当前项目"}
        title={syncState.status === "failed" ? "重试保存当前项目" : "保存当前项目到本机浏览器"}
        disabled={syncState.status === "saving"}
        onClick={onSave}
      >
        <Save size={17} aria-hidden="true" />
      </button>
    </div>
  );
}
