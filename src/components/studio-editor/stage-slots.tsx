import { MapPinned, RefreshCw } from "lucide-react";
import type { ComponentProps, RefObject } from "react";
import type { StageSlots } from "../StudioLayoutTemplate";
import { ToolbarButton } from "../StudioUi";
import { CardsInspector } from "../inspector/CardsInspector";
import { DataWorkspace } from "../DataWorkspace";
import { DataUploadRail, DataUploadWorkspace } from "../workspaces/DataUploadWorkspace";
import { MapStyleRail, MapStyleWorkspace } from "../workspaces/MapStyleWorkspace";
import { ReferenceCardStyleWorkspace } from "../workspaces/ReferenceCardStyleWorkspace";
import {
  ContentLayoutRail,
  ContentLayoutWorkspace,
  type ContentAssetPanelProps,
} from "../workspaces/ContentLayoutWorkspace";
import { DeliveryRail, DeliveryWorkspace, type DeliveryIssue } from "../workspaces/DeliveryWorkspace";
import type { PrintPreflightResult } from "../../lib/print-preflight";
import type { StudioAsset, UserAsset } from "../../lib/assets";
import type { DataHealthSummary, DataIssue } from "../../lib/data-health";
import type { UserFont } from "../../lib/fonts";
import type { LayoutHealthIssue } from "../../lib/layout-health";
import type { DataViewId } from "../../lib/project-data";
import type { ProjectDocument } from "../../lib/project-document";
import type { ResourceHealthIssue } from "../../lib/resource-health";
import type { SceneSelection } from "../../lib/scene-document";
import type { TypographyTarget } from "../../lib/typography";
import type { UsePosterExportResult } from "../../lib/usePosterExport";
import type { WorkflowStageId } from "../../lib/workflow-stages";

/**
 * 名单工作台 props 的精确形状：App 必定提供选中学生与数据呈现回调
 * （比 DataWorkspace 的可选 props 更严格，全局设置页依赖这些字段必填）。
 */
export type StudioDataWorkspaceProps = Omit<
  ComponentProps<typeof DataWorkspace>,
  "selectedStudentId" | "onSelectStudent" | "onChangeDataView"
> & {
  selectedStudentId: string | null;
  onSelectStudent: (id: string | null) => void;
  onChangeDataView: (view: DataViewId) => void;
};

/**
 * 阶段槽位的依赖契约：App 组合出的文档状态、派生检查结果与命令回调。
 * `buildStageSlots` 与 LegacyEditorChrome 共用同一份上下文，
 * App 只负责构造一次并保持各回调语义不变。
 */
export interface StageSlotsContext {
  /** 权威工程文档（含历史）。 */
  project: ProjectDocument;
  /** 画布渲染文档（AI 预览优先）。 */
  renderProject: ProjectDocument;
  selection: SceneSelection;
  selectedStudentId: string | null;
  userAssets: UserAsset[];
  userFonts: UserFont[];
  /** 派生检查结果（App 内 memo，一次计算多处共用）。 */
  dataHealth: DataHealthSummary;
  dataIssues: DataIssue[];
  layoutIssues: LayoutHealthIssue[];
  /** 出血区内对象等印刷几何问题；从 layoutIssues 拆出，避免与排版问题重复。 */
  printIssues: LayoutHealthIssue[];
  resourceIssues: ResourceHealthIssue[];
  fontIssues: ResourceHealthIssue[];
  printPreflight: PrintPreflightResult;
  /** 名单工作台完整 props（数据阶段与旧版名单面板共用）。 */
  dataWorkspaceProps: StudioDataWorkspaceProps;
  /** 素材面板共享 props（内容/地图/数据阶段与旧版素材面板共用）。 */
  assetPanelProps: ContentAssetPanelProps;
  posterExport: UsePosterExportResult;
  posterRef: RefObject<SVGSVGElement | null>;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  onUndo: () => void;
  onRedo: () => void;
  onSelect: (next: SceneSelection) => void;
  onSelectStudent: (id: string | null) => void;
  onPatchScene: (target: SceneSelection, patch: Record<string, unknown>) => void;
  onResetScene: (target: Extract<SceneSelection, { type: "canvas" | "map" | "cards" }>) => void;
  onChangeDataView: (view: DataViewId) => void;
  onAddUserAsset: (asset: UserAsset) => void;
  onCreateDecoration: (asset: StudioAsset) => void;
  onCardPositionsResolved: (positions: Record<string, { x: number; y: number }>) => void;
  onMoveProvinceTexture: (province: string, offsetX: number, offsetY: number) => void;
  onResizeMapImage: (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => void;
  onRefreshDisplayFramePositions: () => void;
  onLocateDeliveryIssue: (item: DeliveryIssue) => void;
  onBackToMapStage: () => void;
  onApplyFont: (target: TypographyTarget, fontId: string, applyToAll: boolean) => void;
  onUploadFont: (font: UserFont) => void;
  onDeleteUserFont: (fontId: string) => void;
  onMoveText: (id: string, x: number, y: number) => void;
  onMoveAsset: (id: string, x: number, y: number) => void;
  onResizeAsset: (id: string, x: number, y: number, width: number, height: number) => void;
  onMoveCard: (id: string, x: number, y: number) => void;
  onMoveGuests: (x: number, y: number) => void;
}

/**
 * 阶段渲染分派（原 App.tsx 内联 JSX 抽出，行为不变）：
 * 每个工作流阶段返回自己的右栏 / 中心工作区 / 阶段顶栏动作槽位，
 * App 把它们塞进 StudioLayoutTemplate。
 */
export function buildStageSlots(stage: WorkflowStageId, ctx: StageSlotsContext): StageSlots {
  switch (stage) {
    case "data":
      return {
        rightRail: (
          <DataUploadRail
            project={ctx.project}
            summary={ctx.dataHealth}
            issues={ctx.dataIssues}
            dataWorkspaceProps={ctx.dataWorkspaceProps}
            assetPanelProps={ctx.assetPanelProps}
            onCreateDecoration={ctx.onCreateDecoration}
            onSelectStudent={ctx.onSelectStudent}
          />
        ),
        workspace: (
          <DataUploadWorkspace
            project={ctx.project}
            summary={ctx.dataHealth}
            issues={ctx.dataIssues}
            dataWorkspaceProps={{ ...ctx.dataWorkspaceProps, hideDataExpression: true, hideTemplateDownload: true }}
            assetPanelProps={ctx.assetPanelProps}
            onCreateDecoration={ctx.onCreateDecoration}
            onSelectStudent={ctx.onSelectStudent}
          />
        ),
      };
    case "map":
      return {
        rightRail: (
          <MapStyleRail
            project={ctx.project}
            selectedProvince={ctx.selection.type === "province" ? ctx.selection.province : null}
            userFonts={ctx.userFonts}
            canUndo={ctx.canUndo}
            canRedo={ctx.canRedo}
            undoLabel={ctx.undoLabel}
            redoLabel={ctx.redoLabel}
            onChangeDataView={ctx.onChangeDataView}
            onPatchMap={(patch) => ctx.onPatchScene({ type: "map" }, patch)}
            onResetMap={() => ctx.onResetScene({ type: "map" })}
            onPatchProvince={(province, patch) => ctx.onPatchScene({ type: "province", province }, patch as Record<string, unknown>)}
            onAddUserAsset={ctx.onAddUserAsset}
            onUndo={ctx.onUndo}
            onRedo={ctx.onRedo}
          />
        ),
        workspace: (
          <MapStyleWorkspace
            project={ctx.project}
            selectedProvince={ctx.selection.type === "province" ? ctx.selection.province : null}
            userFonts={ctx.userFonts}
            canUndo={ctx.canUndo}
            canRedo={ctx.canRedo}
            undoLabel={ctx.undoLabel}
            redoLabel={ctx.redoLabel}
            onChangeDataView={ctx.onChangeDataView}
            onPatchMap={(patch) => ctx.onPatchScene({ type: "map" }, patch)}
            onResetMap={() => ctx.onResetScene({ type: "map" })}
            onPatchProvince={(province, patch) => ctx.onPatchScene({ type: "province", province }, patch as Record<string, unknown>)}
            onCardPositionsResolved={ctx.onCardPositionsResolved}
            onSelect={ctx.onSelect}
            onMoveProvinceTexture={ctx.onMoveProvinceTexture}
            onResizeMapImage={ctx.onResizeMapImage}
            onAddUserAsset={ctx.onAddUserAsset}
            onUndo={ctx.onUndo}
            onRedo={ctx.onRedo}
          />
        ),
      };
    case "frame":
      return {
        stageActions: (
          <ToolbarButton label="刷新展示框位置" icon={<RefreshCw size={18} aria-hidden />} onClick={ctx.onRefreshDisplayFramePositions} />
        ),
        rightRail: (
          <CardsInspector
            cards={ctx.project.cards}
            userFonts={ctx.userFonts}
            onPatch={(patch) => ctx.onPatchScene({ type: "cards" }, patch)}
            onReset={() => ctx.onResetScene({ type: "cards" })}
            mode="global"
            collapsible
          />
        ),
        workspace: (
          <ReferenceCardStyleWorkspace
            cards={ctx.project.cards}
            onPatch={(patch) => ctx.onPatchScene({ type: "cards" }, patch)}
          />
        ),
      };
    case "export":
      return {
        rightRail: (
          <DeliveryRail
            project={ctx.renderProject}
            dataIssues={ctx.dataIssues}
            layoutIssues={ctx.layoutIssues}
            printIssues={ctx.printIssues}
            resourceIssues={ctx.resourceIssues}
            fontIssues={ctx.fontIssues}
            printPreflight={ctx.printPreflight}
            pngScale={ctx.posterExport.pngScale}
            transparentExport={ctx.posterExport.transparentExport}
            includeResources={ctx.posterExport.includeResourcesInProjectExport}
            exportState={ctx.posterExport.exportState}
            exportError={ctx.posterExport.exportError}
            onPngScaleChange={ctx.posterExport.setPngScale}
            onTransparentExportChange={ctx.posterExport.setTransparentExport}
            onIncludeResourcesChange={ctx.posterExport.setIncludeResourcesInProjectExport}
            onLocate={ctx.onLocateDeliveryIssue}
            onExportPng={() => void ctx.posterExport.exportPng()}
            onExportSvg={ctx.posterExport.exportSvg}
            onExportProjectPackage={ctx.posterExport.exportProjectPackage}
            onRetry={ctx.posterExport.retryLastExport}
          />
        ),
        workspace: (
          <DeliveryWorkspace
            project={ctx.renderProject}
            posterRef={ctx.posterRef}
            userFonts={ctx.userFonts}
            dataIssues={ctx.dataIssues}
            layoutIssues={ctx.layoutIssues}
            printIssues={ctx.printIssues}
            resourceIssues={ctx.resourceIssues}
            fontIssues={ctx.fontIssues}
            printPreflight={ctx.printPreflight}
            pngScale={ctx.posterExport.pngScale}
            transparentExport={ctx.posterExport.transparentExport}
            includeResources={ctx.posterExport.includeResourcesInProjectExport}
            exportState={ctx.posterExport.exportState}
            exportError={ctx.posterExport.exportError}
            onPngScaleChange={ctx.posterExport.setPngScale}
            onTransparentExportChange={ctx.posterExport.setTransparentExport}
            onIncludeResourcesChange={ctx.posterExport.setIncludeResourcesInProjectExport}
            onLocate={ctx.onLocateDeliveryIssue}
            onExportPng={() => void ctx.posterExport.exportPng()}
            onExportSvg={ctx.posterExport.exportSvg}
            onExportProjectPackage={ctx.posterExport.exportProjectPackage}
            onRetry={ctx.posterExport.retryLastExport}
          />
        ),
      };
    case "content":
      return {
        stageActions: (
          <>
            <ToolbarButton label="刷新展示框位置" icon={<RefreshCw size={18} aria-hidden />} onClick={ctx.onRefreshDisplayFramePositions} />
            <ToolbarButton label="返回地图样式" icon={<MapPinned size={18} aria-hidden />} onClick={ctx.onBackToMapStage} />
          </>
        ),
        rightRail: (
          <ContentLayoutRail
            project={ctx.renderProject}
            selection={ctx.selection}
            userAssets={ctx.userAssets}
            userFonts={ctx.userFonts}
            assetPanelProps={ctx.assetPanelProps}
            onPatch={ctx.onPatchScene}
            onReset={ctx.onResetScene}
            onApplyFont={ctx.onApplyFont}
            onUploadFont={ctx.onUploadFont}
            onDeleteUserFont={ctx.onDeleteUserFont}
          />
        ),
        workspace: (
          <ContentLayoutWorkspace
            project={ctx.renderProject}
            selection={ctx.selection}
            userAssets={ctx.userAssets}
            userFonts={ctx.userFonts}
            canUndo={ctx.canUndo}
            canRedo={ctx.canRedo}
            undoLabel={ctx.undoLabel}
            redoLabel={ctx.redoLabel}
            assetPanelProps={ctx.assetPanelProps}
            onSelect={ctx.onSelect}
            onPatch={ctx.onPatchScene}
            onReset={ctx.onResetScene}
            onRefreshPositions={ctx.onRefreshDisplayFramePositions}
            onBackToMap={ctx.onBackToMapStage}
            onUndo={ctx.onUndo}
            onRedo={ctx.onRedo}
            selectedStudentId={ctx.selectedStudentId}
            onSelectStudent={ctx.onSelectStudent}
            onApplyFont={ctx.onApplyFont}
            onUploadFont={ctx.onUploadFont}
            onDeleteUserFont={ctx.onDeleteUserFont}
            onMoveText={ctx.onMoveText}
            onMoveAsset={ctx.onMoveAsset}
            onResizeAsset={ctx.onResizeAsset}
            onMoveProvinceTexture={ctx.onMoveProvinceTexture}
            onResizeMapImage={ctx.onResizeMapImage}
            onCardPositionsResolved={ctx.onCardPositionsResolved}
            onMoveCard={ctx.onMoveCard}
            onMoveGuests={ctx.onMoveGuests}
          />
        ),
      };
  }
}
