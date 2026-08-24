import type { LocalOverwriteStatus } from "../lib/incremental-workspace-sync";
import "./StatusBar.css";

const SYNC_LABELS: Record<LocalOverwriteStatus, string> = {
  idle: "有未保存修改",
  pending: "有未保存修改",
  saving: "正在覆盖本地数据",
  saved: "全部数据已保存",
  failed: "本地保存失败",
};

export type StatusBarProps = {
  /** 最近一次操作反馈（导入、保存、素材、模板等)。 */
  message: string;
  /** 本地覆盖保存状态；省略时只播报操作反馈。 */
  syncStatus?: LocalOverwriteStatus;
  /** 最近一次本地保存时间(ISO)。 */
  savedAt?: string | null;
};

function savedAtLabel(savedAt: string | null | undefined): string | null {
  if (!savedAt) return null;
  const time = new Date(savedAt);
  if (Number.isNaN(time.getTime())) return null;
  return time.toLocaleTimeString("zh-CN", { hour12: false });
}

/**
 * 编辑器状态条：六阶段外壳里唯一的操作反馈落点。
 *
 * 容器始终挂载，保证 `setStatusMessage` 的后续更新会被读屏软件播报；
 * 无内容时靠 `:empty` 隐藏，不占视觉空间。
 */
export function StatusBar({ message, syncStatus, savedAt }: StatusBarProps) {
  const savedTime = savedAtLabel(savedAt);
  const empty = !syncStatus && !message;
  return (
    <div className="studio-status-bar" role="status" aria-live="polite" data-empty={empty ? "true" : undefined}>
      {syncStatus ? (
        <span className="studio-status-bar__sync" data-sync-status={syncStatus}>
          <span aria-hidden="true" />
          {savedTime ? `${SYNC_LABELS[syncStatus]} · ${savedTime}` : SYNC_LABELS[syncStatus]}
        </span>
      ) : null}
      {message ? <span className="studio-status-bar__message">{message}</span> : null}
    </div>
  );
}
