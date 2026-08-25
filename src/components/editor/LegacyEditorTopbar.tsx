import { ImageDown, MapPinned, PanelRight, PanelRightClose, Redo2, Undo2 } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { ActivePanel } from "../../lib/app-constants";
import type { ResolvedTheme, StudioSkin, ThemeMode } from "../../lib/theme";
import type { UsePosterExportResult } from "../../lib/usePosterExport";
import type { WorkflowProgress } from "../../lib/workflow-progress";
import { SkinSelector } from "../SkinSelector";
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

/**
 * 旧版编辑器顶栏:品牌 + 阶段导航插槽(含隐藏的 legacy 步骤条)+ 历史/属性面板/主题/
 * 工程与导出四组工具栏。DOM 结构、class 名、role、aria 标签与文案与旧的 App 内联分支逐字一致。
 */
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
    <header className="topbar">
      <div className="brand">
        <MapPinned size={24} />
        <span className="brand-label brand-label__full">蹭饭地图工作室</span>
        <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
        <em>Beta</em>
      </div>
      <div className="topbar-workflow">
        {workflowNav}
        <div className="topbar-workflow__legacy" aria-hidden="true">
          <WorkflowStepper activeId={legacyActivePanel} progress={workflowProgress} onChange={onChangeLegacyPanel} />
        </div>
      </div>
      <div className="topbar-actions">
        {backButton}
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

        <ToolbarGroup label="界面主题">
          <SkinSelector skin={skin} onChange={onSkinChange} />
          <ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={onThemeChange} />
        </ToolbarGroup>

        {projectExportActions}

        <ToolbarGroup label="导出">
          <button className="primary-button" onClick={() => void posterExport.exportPng()} disabled={posterExport.exportingPng}>
            <ImageDown size={16} /> {posterExport.exportingPng ? "导出中..." : "导出 PNG"}
          </button>
        </ToolbarGroup>
      </div>
    </header>
  );
}
