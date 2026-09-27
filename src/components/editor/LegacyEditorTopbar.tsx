import { ImageDown, PanelRight, PanelRightClose, Redo2, Undo2 } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { ActivePanel } from "../../lib/app-constants";
import type { ResolvedTheme, StudioSkin, ThemeMode } from "../../lib/theme";
import type { UsePosterExportResult } from "../../lib/usePosterExport";
import type { WorkflowProgress } from "../../lib/workflow-progress";
import { SkinSelector } from "../SkinSelector";
import { StudioTopbar } from "../StudioTopbar";
import { ToolbarButton, ToolbarGroup } from "../StudioUi";
import { ThemeToggle } from "../ThemeToggle";
import { WorkflowStepper } from "../WorkflowStepper";
import { ZoomControls } from "../ZoomControls";

export interface LegacyEditorTopbarProps {
  workflowNav: ReactNode;
  legacyActivePanel: ActivePanel;
  workflowProgress: WorkflowProgress;
  backButton: ReactNode;
  projectExportActions: ReactNode;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  zoomPercent: number;
  inspectorOpen: boolean;
  skin: StudioSkin;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  posterExport: UsePosterExportResult;
  onChangeLegacyPanel: (panel: ActivePanel) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomPercentChange: Dispatch<SetStateAction<number>>;
  onToggleInspector: () => void;
  onSkinChange: (skin: StudioSkin) => void;
  onThemeChange: (mode: ThemeMode) => void;
}

/** Legacy controls share the same header and navigation geometry as every stage. */
export function LegacyEditorTopbar({
  workflowNav,
  legacyActivePanel,
  workflowProgress,
  backButton,
  projectExportActions,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  zoomPercent,
  inspectorOpen,
  skin,
  themeMode,
  resolvedTheme,
  posterExport,
  onChangeLegacyPanel,
  onUndo,
  onRedo,
  onZoomPercentChange,
  onToggleInspector,
  onSkinChange,
  onThemeChange,
}: LegacyEditorTopbarProps) {
  return (
    <StudioTopbar
      workflowNav={<>
        {workflowNav}
        <div className="topbar-workflow__legacy" aria-hidden="true">
          <WorkflowStepper activeId={legacyActivePanel} progress={workflowProgress} onChange={onChangeLegacyPanel} />
        </div>
      </>}
      historyActions={
        <ToolbarGroup label="历史与缩放">
          <ToolbarButton
            label={undoLabel}
            icon={<Undo2 size={18} />}
            disabled={!canUndo}
            onClick={onUndo}
          />
          <ToolbarButton
            label={redoLabel}
            icon={<Redo2 size={18} />}
            disabled={!canRedo}
            onClick={onRedo}
          />
        </ToolbarGroup>
      }
      stageActions={<>
        <ToolbarGroup label="画布缩放">
          <ZoomControls
            zoomPercent={zoomPercent}
            onZoomOut={() => onZoomPercentChange((v) => Math.max(25, v - 10))}
            onZoomIn={() => onZoomPercentChange((v) => Math.min(300, v + 10))}
          />
        </ToolbarGroup>

        <ToolbarGroup label="属性面板" className="inspector-toggle-group">
          <ToolbarButton
            className="inspector-toggle"
            label={inspectorOpen ? "关闭属性面板" : "打开属性面板"}
            icon={inspectorOpen ? <PanelRightClose size={17} /> : <PanelRight size={17} />}
            aria-expanded={inspectorOpen}
            aria-controls="editor-inspector"
            onClick={onToggleInspector}
          />
        </ToolbarGroup>

      </>}
      projectActions={<>
        {backButton}
        {projectExportActions}
        <ToolbarGroup label="界面主题">
          <SkinSelector skin={skin} onChange={onSkinChange} />
          <ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={onThemeChange} />
        </ToolbarGroup>

        <ToolbarGroup label="导出">
          <button className="primary-button" onClick={() => void posterExport.exportPng()} disabled={posterExport.exportState === "exporting"}>
            <ImageDown size={16} /> {posterExport.exportingPng || posterExport.exportState === "exporting" ? "导出中..." : "导出 PNG"}
          </button>
        </ToolbarGroup>
      </>}
    />
  );
}
