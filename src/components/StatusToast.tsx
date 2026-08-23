import { useState } from "react";
import { X } from "lucide-react";
import type { LocalOverwriteStatus } from "../lib/incremental-workspace-sync";

/**
 * 全局状态条（Studio 分阶段 UI 的 statusMessage 反馈通道）。
 *
 * 保存成败、字体/素材、导入导出等反馈都写入 statusMessage；旧版 UI 在
 * 「项目摘要」里展示，这里以固定位置的轻量状态条呈现同一信息。
 * 常驻显示直到用户关闭或出现新消息，避免连续两次相同操作时无反馈。
 */
export function StatusToast({ message, syncStatus }: {
  message: string;
  syncStatus?: LocalOverwriteStatus;
}) {
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);
  if (!message || dismissedMessage === message) return null;
  return (
    <div className="status-toast" role="status" aria-live="polite">
      {syncStatus && <span className="status-toast__dot" data-sync-status={syncStatus} aria-hidden="true" />}
      <span className="status-toast__text">{message}</span>
      <button
        type="button"
        className="status-toast__close"
        aria-label="关闭状态提示"
        onClick={() => setDismissedMessage(message)}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
