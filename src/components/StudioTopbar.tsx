import type { ReactNode } from "react";
import { MapPinned } from "lucide-react";

export type StudioTopbarProps = {
  /** 当前项目名（项目模式；可点击重命名）。 */
  projectTitle?: ReactNode;
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
  projectTitle,
  assistantEntry,
  historyActions,
  stageActions,
  projectActions,
  workflowNav,
}: StudioTopbarProps) {
  return (
    <header className="topbar studio-topbar" aria-label="编辑器顶栏" data-has-project={projectTitle ? "true" : undefined}>
      <div className="brand">
        <MapPinned size={24} />
        <span className="brand-label brand-label__full">蹭饭地图工作室</span>
        <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
        <em>Beta</em>
      </div>
      {/* 项目名占独立列（不塞进品牌列），保证可读且改名入口可发现。 */}
      {projectTitle && <div className="topbar-project" aria-label="当前项目">{projectTitle}</div>}
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
