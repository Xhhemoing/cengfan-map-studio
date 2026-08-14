import { Redo2, Undo2 } from "lucide-react";
import { ToolbarButton, ToolbarGroup } from "./StudioUi";

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
  return (
    <ToolbarGroup label="历史操作">
      <ToolbarButton
        label={undoLabel}
        icon={<Undo2 size={18} aria-hidden />}
        disabled={!canUndo}
        onClick={onUndo}
      />
      <ToolbarButton
        label={redoLabel}
        icon={<Redo2 size={18} aria-hidden />}
        disabled={!canRedo}
        onClick={onRedo}
      />
    </ToolbarGroup>
  );
}
