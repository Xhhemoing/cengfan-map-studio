import type { ReactNode } from "react";
import { MapPinned } from "lucide-react";

export type StudioTopbarProps = {
  /** Assistant / advanced-function entry (opens the assistant drawer). */
  assistantEntry?: ReactNode;
  stageActions?: ReactNode;
  projectActions: ReactNode;
};

/**
 * Shared topbar for the formal editing stages. Renders the brand and the
 * action slots only; the six-stage workflow navigation lives in the stable
 * left rail (StudioLeftRail). Exactly one instance per stage.
 */
export function StudioTopbar({
  assistantEntry,
  stageActions,
  projectActions,
}: StudioTopbarProps) {
  return (
    <header className="topbar studio-topbar" aria-label="编辑器顶栏">
      <div className="brand">
        <MapPinned size={24} />
        <span className="brand-label brand-label__full">蹭饭地图工作室</span>
        <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
        <em>Beta</em>
      </div>
      <div className="topbar-actions">
        {assistantEntry}
        {stageActions}
        {projectActions}
      </div>
    </header>
  );
}
