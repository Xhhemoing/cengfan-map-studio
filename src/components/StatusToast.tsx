import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { LocalOverwriteStatus } from "../lib/incremental-workspace-sync";

/** 状态条展示时长：够读完一句反馈，又不会长期遮挡底部内容。 */
const AUTO_HIDE_MS = 6000;

/**
 * 全局状态条（Studio 分阶段 UI 的 statusMessage 反馈通道）。
 *
 * 保存成败、字体/素材、导入导出等反馈都写入 statusMessage；旧版 UI 在
 * 「项目摘要」里展示，这里以固定位置的轻量状态条呈现同一信息。
 * 展示数秒后自动隐藏（也可手动关闭），避免遮挡其下方的可点击内容；
 * nonce 每次上报递增，相同文案连续两次操作也会重新显示。
 */
export function StatusToast({ message, nonce = 0, syncStatus }: {
  message: string;
  nonce?: number;
  syncStatus?: LocalOverwriteStatus;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [message, nonce]);
  if (!message || !visible) return null;
  return (
    <div className="status-toast" role="status" aria-live="polite">
      {syncStatus && <span className="status-toast__dot" data-sync-status={syncStatus} aria-hidden="true" />}
      <span className="status-toast__text">{message}</span>
      <button
        type="button"
        className="status-toast__close"
        aria-label="关闭状态提示"
        onClick={() => setVisible(false)}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
