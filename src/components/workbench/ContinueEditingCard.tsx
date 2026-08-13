import { History } from "lucide-react";
import type { LocalWorkspaceEntry } from "../../lib/local-workspace-entry";

function formatSavedAt(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "最近保存";
  const date = new Date(time);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `今天 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`
    : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

/**
 * Featured card offering to continue the most recent local workspace content
 * that has not been turned into a stored project yet.
 */
export function ContinueEditingCard({ entry, onResume }: {
  entry: LocalWorkspaceEntry;
  onResume: () => void;
}) {
  const students = entry.pack.project.students.length;
  return (
    <button
      type="button"
      className="workbench-resume"
      aria-label="继续编辑本地内容"
      onClick={onResume}
    >
      <span className="workbench-resume-icon" aria-hidden="true"><History size={22} /></span>
      <span className="workbench-resume-body">
        <strong>继续编辑本地内容</strong>
        <small>{students} 名学生 · 保存于 {formatSavedAt(entry.pack.exportedAt)}</small>
      </span>
      <span className="workbench-resume-cta">进入编辑器 <span aria-hidden="true">→</span></span>
    </button>
  );
}
