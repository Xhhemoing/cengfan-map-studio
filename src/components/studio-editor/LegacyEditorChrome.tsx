import { ImageDown, PanelRight, PanelRightClose, Redo2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { PosterCanvas } from "../canvas/PosterCanvas";
import { InspectorPanel } from "../inspector/InspectorPanel";
import { ResizablePanelDivider } from "../ResizablePanelDivider";
import { SkinSelector } from "../SkinSelector";
import { ThemeToggle } from "../ThemeToggle";
import { ToolbarButton, ToolbarGroup } from "../StudioUi";
import { WorkflowStageStepper } from "../WorkflowStageStepper";
import { WorkflowStepper, type WorkflowPanelId } from "../WorkflowStepper";
import { ZoomControls } from "../ZoomControls";
import { WorkbenchBackButton } from "../../lib/app-initialization";
import { dataViews, provinceNames, type ActivePanel } from "../../lib/app-constants";
import { duplicateAssetElement } from "../../lib/asset-elements";
import { fitZoomPercent } from "../../lib/grid";
import type { LocalWorkspaceOverwriteState } from "../../lib/incremental-workspace-sync";
import { deleteAsset, deleteText } from "../../lib/inspector-operations";
import type { MapTemplateId, ProvinceSummary } from "../../lib/project-data";
import { applyTransaction, type ProjectDocument } from "../../lib/project-document";
import type { SceneSelection } from "../../lib/scene-document";
import type { CustomTemplateRecord } from "../../lib/template-store";
import { LEGACY_PANEL_TO_WORKFLOW_STAGE, type WorkflowStageId } from "../../lib/workflow-stages";
import type { WorkflowProgress, WorkflowStepId } from "../../lib/workflow-progress";
import type { StudioChrome } from "../../hooks/use-studio-chrome";
import { LegacyProjectExportDialog } from "./LegacyProjectExportDialog";
import { LegacySidebarPanels } from "./LegacySidebarPanels";
import { SkipToStageLink } from "./SkipToStageLink";
import { StudioBrand } from "./StudioStatusScreens";
import { STUDIO_STAGE_TARGET_ID } from "./stage-target";
import type { StageSlotsContext } from "./stage-slots";

export type LegacyEditorChromeProps = {
  ctx: StageSlotsContext;
  /** 编辑器外壳偏好（主题/皮肤/面板宽度），由 App 的 useStudioChrome 提供。 */
  chrome: StudioChrome;
  activeStage: WorkflowStageId;
  activePanel: ActivePanel;
  workflowProgress: WorkflowProgress;
  projectId?: string;
  summary: ProvinceSummary[];
  syncState: LocalWorkspaceOverwriteState;
  statusMessage: string;
  customTemplates: CustomTemplateRecord[];
  showGrid: boolean;
  gridSize: number;
  renderIntervalMs: number;
  /** 左栏 AI 助手 + 高级功能总览（与聚焦阶段共用同一实例配置）。 */
  assistantRail: ReactNode;
  /** 顶栏「导出与工程」项目菜单（与聚焦阶段共用同一节点）。 */
  projectActions: ReactNode;
  commitProject: (next: ProjectDocument) => void;
  onStatusMessage: (message: string) => void;
  onActivePanelChange: (panel: ActivePanel) => void;
  onStageChange: (stage: WorkflowStageId) => void;
  onSetActiveStage: (stage: WorkflowStageId) => void;
  onSetActiveWorkflowStep: (step: WorkflowStepId) => void;
  onOpenGlobalData: () => void;
  onOpenGlobalSettings: ComponentProps<typeof InspectorPanel>["onOpenGlobalSettings"];
  onApplySystemTemplate: (templateId: MapTemplateId) => void;
  onApplyCustomTemplate: (record: CustomTemplateRecord) => void;
  onSaveTemplate: () => void;
  onSaveLocal: () => void;
  onBackToWorkbench: () => void;
};

/**
 * 经典（legacy）编辑器整页外壳：顶栏（双步骤条 + 缩放/属性面板开关）、
 * 导出工程确认对话框、三栏工作区（侧栏面板 / 画布 / 检查器）与面板分隔条。
 * 原 App.tsx 内联 JSX 抽出，行为不变；仅在 legacy 兼容开关开启且处于
 * 内容阶段时渲染，legacy 专属状态（缩放、移动端检查器开关）留在本组件内。
 */
export function LegacyEditorChrome({
  ctx,
  chrome,
  activeStage,
  activePanel,
  workflowProgress,
  projectId,
  summary,
  syncState,
  statusMessage,
  customTemplates,
  showGrid,
  gridSize,
  renderIntervalMs,
  assistantRail,
  projectActions,
  commitProject,
  onStatusMessage,
  onActivePanelChange,
  onStageChange,
  onSetActiveStage,
  onSetActiveWorkflowStep,
  onOpenGlobalData,
  onOpenGlobalSettings,
  onApplySystemTemplate,
  onApplyCustomTemplate,
  onSaveTemplate,
  onSaveLocal,
  onBackToWorkbench,
}: LegacyEditorChromeProps) {
  const { project, renderProject, selection, posterExport } = ctx;
  const students = renderProject.students;
  const dataView = renderProject.dataView;
  const selectedTextId = selection.type === "text" ? selection.id : null;

  const stageRef = useRef<HTMLDivElement>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia?.("(max-width: 1120px)").matches) return;
    const timer = window.setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;
      setZoomPercent(fitZoomPercent({
        stageWidth: stage.clientWidth,
        stageHeight: stage.clientHeight,
        canvasWidth: project.canvas.width,
        canvasHeight: project.canvas.height,
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [project.canvas.height, project.canvas.width]);

  const handleLegacySceneSelect = (next: SceneSelection) => {
    ctx.onSelect(next);
    // Keep the legacy content editor's material context available without letting
    // the dedicated map stage leave its own workflow context.
    if (activeStage === "content" && next.type === "province") onActivePanelChange("assets");
  };

  const handleWorkflowStepChange = (id: WorkflowPanelId) => {
    const nextStage = LEGACY_PANEL_TO_WORKFLOW_STAGE[id];
    onSetActiveStage(nextStage);
    if (id === "roster") {
      onOpenGlobalData();
      return;
    }
    onActivePanelChange(id);
    const workflowId: WorkflowStepId = id === "map"
      ? "presentation"
      : id === "layout"
        ? "layout"
        : id === "deliver"
          ? "export"
          : "local";
    onSetActiveWorkflowStep(workflowId);
  };

  const removeText = (id: string) => {
    commitProject(applyTransaction(project, {
      id: `tx-text-delete-${id}`,
      label: "删除文本",
      source: "manual",
      apply: (current) => deleteText(current, id),
    }));
    ctx.onSelect({ type: "canvas" });
  };

  const removeAsset = (id: string) => {
    commitProject(applyTransaction(project, {
      id: `tx-asset-delete-${id}`,
      label: "删除素材实例",
      source: "manual",
      apply: (current) => deleteAsset(current, id),
    }));
    ctx.onSelect({ type: "canvas" });
  };

  const duplicateAsset = (id: string) => {
    const source = project.assetElements.find((asset) => asset.id === id);
    if (!source) return;
    const copy = duplicateAssetElement(source);
    commitProject(applyTransaction(project, {
      id: `tx-asset-duplicate-${id}`,
      label: "复制素材实例",
      source: "manual",
      apply: (current) => ({ ...current, assetElements: [...current.assetElements, copy] }),
    }));
    ctx.onSelect({ type: "asset", id: copy.id });
  };

  const changeAssetLayer = (id: string, delta: -1 | 1) => {
    const asset = project.assetElements.find((item) => item.id === id);
    if (!asset) return;
    ctx.onPatchScene({ type: "asset", id }, { zIndex: asset.zIndex + delta });
  };

  return (
    <main className="app-shell" data-editor-theme={chrome.resolvedTheme} data-editor-skin={chrome.skin}>
      <SkipToStageLink />
      <header className="topbar">
        <StudioBrand />
        <div className="topbar-workflow">
          <WorkflowStageStepper activeId={activeStage} project={project} progress={workflowProgress} onChange={onStageChange} />
          <div className="topbar-workflow__legacy" aria-hidden="true">
            <WorkflowStepper activeId={activePanel} progress={workflowProgress} onChange={handleWorkflowStepChange} />
          </div>
        </div>
        <div className="topbar-actions">
          {projectId && <WorkbenchBackButton onClick={onBackToWorkbench} />}
          <ToolbarGroup label="历史与缩放">
            <ToolbarButton
              label={ctx.undoLabel}
              icon={<Undo2 size={18} />}
              disabled={!ctx.canUndo}
              onClick={ctx.onUndo}
            />
            <ToolbarButton
              label={ctx.redoLabel}
              icon={<Redo2 size={18} />}
              disabled={!ctx.canRedo}
              onClick={ctx.onRedo}
            />
            <ZoomControls
              zoomPercent={zoomPercent}
              onZoomOut={() => setZoomPercent((v) => Math.max(25, v - 10))}
              onZoomIn={() => setZoomPercent((v) => Math.min(300, v + 10))}
            />
          </ToolbarGroup>

          <ToolbarGroup label="属性面板" className="inspector-toggle-group">
            <ToolbarButton
              className="inspector-toggle"
              label={mobileInspectorOpen ? "关闭属性面板" : "打开属性面板"}
              icon={mobileInspectorOpen ? <PanelRightClose size={17} /> : <PanelRight size={17} />}
              aria-expanded={mobileInspectorOpen}
              aria-controls="editor-inspector"
              onClick={() => setMobileInspectorOpen((open) => !open)}
            />
          </ToolbarGroup>

          <ToolbarGroup label="界面主题">
            <SkinSelector skin={chrome.skin} onChange={chrome.setSkin} />
            <ThemeToggle mode={chrome.themeMode} resolvedTheme={chrome.resolvedTheme} onChange={chrome.setThemeMode} />
          </ToolbarGroup>

          {projectActions}

          <ToolbarGroup label="导出">
            <button className="primary-button" onClick={() => void posterExport.exportPng()} disabled={posterExport.exportingPng}>
              <ImageDown size={16} /> {posterExport.exportingPng ? "导出中..." : "导出 PNG"}
            </button>
          </ToolbarGroup>
        </div>
      </header>


      <LegacyProjectExportDialog posterExport={posterExport} />

      <section
        className="workspace"
        style={chrome.workspaceStyle}
        data-editor-resizing={chrome.resizingPanel ? "true" : undefined}
        data-resizing-panel={chrome.resizingPanel ?? undefined}
      >
        <aside className="sidebar studio-sidebar">
          <div className="studio-sidebar__rail">{assistantRail}</div>

          <div className="studio-sidebar__panel">
            <LegacySidebarPanels
              ctx={ctx}
              activePanel={activePanel}
              summary={summary}
              syncState={syncState}
              customTemplates={customTemplates}
              commitProject={commitProject}
              onStatusMessage={onStatusMessage}
              onActivePanelChange={onActivePanelChange}
              onApplySystemTemplate={onApplySystemTemplate}
              onApplyCustomTemplate={onApplyCustomTemplate}
              onSaveTemplate={onSaveTemplate}
              onSaveLocal={onSaveLocal}
            />
          </div>
        </aside>

        <section className="editor-area" id={STUDIO_STAGE_TARGET_ID} tabIndex={-1}>
          <div className="canvas-stage" ref={stageRef}>
            <div
              className="canvas-zoom-shell"
              style={{
                width: Math.round(project.canvas.width * zoomPercent / 100),
                height: Math.round(project.canvas.height * zoomPercent / 100),
              }}
            >
              <div
                className="canvas-zoom-inner"
                style={{
                  width: project.canvas.width,
                  height: project.canvas.height,
                  transform: `scale(${zoomPercent / 100})`,
                  transformOrigin: "top left",
                }}
              >
                <PosterCanvas
                  project={renderProject}
                  posterRef={ctx.posterRef}
                  selectedTextId={selectedTextId}
                  selectedAssetId={selection.type === "asset" ? selection.id : null}
                  selectedProvince={selection.type === "province" ? selection.province : null}
                  userFonts={ctx.userFonts}
                  showGrid={showGrid}
                  gridSize={gridSize}
                  renderIntervalMs={renderIntervalMs}
                  onSelect={handleLegacySceneSelect}
                  onMoveText={ctx.onMoveText}
                  onMoveAsset={ctx.onMoveAsset}
                  onResizeAsset={ctx.onResizeAsset}
                  mapSelected={selection.type === "map"}
                  onMoveProvinceTexture={ctx.onMoveProvinceTexture}
                  onResizeMapImage={ctx.onResizeMapImage}
                  onCardPositionsResolved={ctx.onCardPositionsResolved}
                  selectedStudentId={ctx.selectedStudentId}
                  onSelectStudent={ctx.onSelectStudent}
                  onMoveCard={ctx.onMoveCard}
                  onMoveGuests={ctx.onMoveGuests}
                />
              </div>
            </div>
          </div>
        </section>

        <aside id="editor-inspector" className={`inspector${mobileInspectorOpen ? " is-open" : ""}`}>
          <InspectorPanel
            project={renderProject}
            selection={selection}
            userFonts={ctx.userFonts}
            onPatch={ctx.onPatchScene}
            onReset={ctx.onResetScene}
            onDeleteText={removeText}
            onDeleteAsset={removeAsset}
            onDuplicateAsset={duplicateAsset}
            onLayerChange={changeAssetLayer}
            onAddUserAsset={ctx.onAddUserAsset}
            provinces={provinceNames}
            onOpenGlobalSettings={onOpenGlobalSettings}
            onApplyFont={ctx.onApplyFont}
            onUploadFont={ctx.onUploadFont}
            onDeleteUserFont={ctx.onDeleteUserFont}
          />
          <details className="project-summary">
            <summary>项目摘要</summary>
            <div className="summary-number"><strong>{students.length}</strong><span>学生</span></div>
            <div className="summary-number"><strong>{summary.length}</strong><span>目的省市</span></div>
            <p>{dataViews.find((view) => view.id === dataView)?.description}</p>
            <p>已记录 {project.history.past.length} 步，可重做 {project.history.future.length} 步。</p>
            <div className="status" data-sync-status={syncState.status}>
              <span />
              {syncState.status === "saving" ? "正在覆盖本地数据" : syncState.status === "saved" ? "全部数据已保存" : syncState.status === "failed" ? "本地保存失败" : "有未保存修改"}
            </div>
            <p className="panel-note">
              本地：仅点击强制保存时覆盖本地数据
              {syncState.savedAt && ` · ${new Date(syncState.savedAt).toLocaleTimeString("zh-CN", { hour12: false })}`}
            </p>
            {statusMessage && <p className="panel-note">{statusMessage}</p>}
          </details>
        </aside>

        <ResizablePanelDivider
          side="sidebar"
          value={chrome.panelLayout.sidebarWidth}
          min={chrome.sidebarBounds.min}
          max={chrome.sidebarBounds.max}
          ariaLabel="调整左侧栏宽度"
          onChange={(value) => chrome.updatePanelWidth("sidebar", value)}
          onResizeStart={() => chrome.setResizingPanel("sidebar")}
          onResizeEnd={() => chrome.setResizingPanel(null)}
        />
        <ResizablePanelDivider
          side="inspector"
          value={chrome.panelLayout.inspectorWidth}
          min={chrome.inspectorBounds.min}
          max={chrome.inspectorBounds.max}
          ariaLabel="调整右侧栏宽度"
          onChange={(value) => chrome.updatePanelWidth("inspector", value)}
          onResizeStart={() => chrome.setResizingPanel("inspector")}
          onResizeEnd={() => chrome.setResizingPanel(null)}
        />
      </section>
    </main>
  );
}
