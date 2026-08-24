import { Redo2, Undo2 } from "lucide-react";
import { ToolbarButton, ToolbarGroup } from "./StudioUi";
import { useHistoryAnnouncement } from "./use-history-announcement";

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
