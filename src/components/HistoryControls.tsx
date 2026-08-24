import { Redo2, Undo2 } from "lucide-react";
import { useState } from "react";
import { ToolbarButton, ToolbarGroup } from "./StudioUi";

/**
 * 撤销/重做的读屏播报状态（WCAG 4.1.3 状态消息），与顶栏 HistoryActionsGroup /
 * 经典编辑器顶栏相同的模式：撤销/重做本身零反馈，按钮 aria-label 的静默更新
 * 不会被读出，点击时用点击前的标签播报「已撤销：某步骤 / 已重做：某步骤」。
 * 返回的 announcement 在两次播报之间切换一个隐形 NBSP 后缀，保证连续撤销
 * 两个同名步骤时 DOM 文本仍有变化（aria-live 不会复读完全相同的文本）。
 * 调用方需把 announcement 渲染进一个持久存在的 sr-only polite live region。
 * （与使用它的 HistoryControls 同文件，便于 GlobalSettingsScreen 复用同一模式。）
 */
// eslint-disable-next-line react-refresh/only-export-components -- 见上方说明
export function useHistoryAnnouncement(): {
  announce: (label: string) => void;
  announcement: string;
} {
  const [state, setState] = useState({ text: "", tick: 0 });
  const announce = (label: string) =>
    setState((prev) => ({ text: `已${label}`, tick: prev.tick + 1 }));
  return {
    announce,
    announcement: state.tick % 2 === 1 ? `${state.text}\u00A0` : state.text,
  };
}

export type HistoryControlsProps = {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  onUndo: () => void;
  onRedo: () => void;
};

export function HistoryControls({
  canUndo,
  canRedo,
  undoLabel = "撤销",
  redoLabel = "重做",
  onUndo,
  onRedo,
}: HistoryControlsProps) {
  const { announce, announcement } = useHistoryAnnouncement();
  return (
    <>
      <ToolbarGroup label="历史操作">
        <ToolbarButton
          label={undoLabel}
          icon={<Undo2 size={18} aria-hidden />}
          disabled={!canUndo}
          onClick={() => { announce(undoLabel); onUndo(); }}
        />
        <ToolbarButton
          label={redoLabel}
          icon={<Redo2 size={18} aria-hidden />}
          disabled={!canRedo}
          onClick={() => { announce(redoLabel); onRedo(); }}
        />
      </ToolbarGroup>
      {/* 持久存在（而非按需挂载）的播报区：区域必须先于变更就在 DOM 里，
          读屏才能可靠播报。放在组外，宿主 CSS 在窄屏隐藏整个组时播报不受影响；
          data 属性与顶栏（data-topbar-…）、全局设置页（data-settings-…）互不冲突。 */}
      <span className="sr-only" role="status" aria-live="polite" data-history-announcement>
        {announcement}
      </span>
    </>
  );
}
