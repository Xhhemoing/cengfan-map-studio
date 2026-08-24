import type { ReactNode } from "react";
import { StudioBrand } from "./studio-editor/StudioStatusScreens";

export type StudioTopbarProps = {
  /** Assistant / advanced-function entry (opens the assistant drawer). */
  assistantEntry?: ReactNode;
  /** 全局高频动作：撤销/重做（所有阶段可见）。 */
  historyActions?: ReactNode;
  stageActions?: ReactNode;
  projectActions: ReactNode;
  /** Six-stage workflow navigation, rendered horizontally under the brand (old-style top guidance). */
  workflowNav?: ReactNode;
};

/**
 * Shared topbar for the formal editing stages. Renders the brand, the
 * horizontal six-stage workflow navigation (old-style top guidance) and the
 * action slots. Exactly one instance per stage.
 */
export function StudioTopbar({
  assistantEntry,
  historyActions,
  stageActions,
  projectActions,
  workflowNav,
}: StudioTopbarProps) {
  return (
    <header className="topbar studio-topbar" aria-label="编辑器顶栏">
      <StudioBrand />
      {workflowNav && <div className="topbar-workflow">{workflowNav}</div>}
      <div className="topbar-actions">
        {assistantEntry}
        {historyActions}
        {stageActions}
        {projectActions}
      </div>
    </header>
  );
}
