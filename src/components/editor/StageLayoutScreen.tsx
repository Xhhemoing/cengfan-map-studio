import { MapPinned, RefreshCw } from "lucide-react";
import type { ComponentProps, ReactNode, RefObject } from "react";
import type { UserAsset } from "../../lib/assets";
import type { DataHealthSummary, DataIssue } from "../../lib/data-health";
import type { UserFont } from "../../lib/fonts";
import type { LayoutHealthIssue } from "../../lib/layout-health";
import type { ProjectDocument } from "../../lib/project-document";
import type { ResourceHealthIssue } from "../../lib/resource-health";
import type { SceneSelection } from "../../lib/scene-document";
import { STAGE_METADATA } from "../../lib/stage-metadata";
import { templatePickerProps, type EditorTemplateActions } from "../../lib/editor-template-actions";
import type { UsePosterExportResult } from "../../lib/usePosterExport";
import type { WorkflowStageId } from "../../lib/workflow-stages";
import { CardsInspector } from "../inspector/CardsInspector";
import { StatusStrip } from "../StatusStrip";
import { StudioLayoutTemplate, type StageSlots } from "../StudioLayoutTemplate";
import { ToolbarButton } from "../StudioUi";
import { ExportProjectDialog } from "./ExportProjectDialog";
import { ContentLayoutRail, ContentLayoutWorkspace, type ContentAssetPanelProps, type ContentLayoutWorkspaceProps } from "../workspaces/ContentLayoutWorkspace";
import { DataUploadRail, DataUploadWorkspace, type DataUploadWorkspaceProps } from "../workspaces/DataUploadWorkspace";
import { DeliveryRail, DeliveryWorkspace, type DeliveryIssue } from "../workspaces/DeliveryWorkspace";
import { MapStyleRail, MapStyleWorkspace, type MapStyleWorkspaceProps } from "../workspaces/MapStyleWorkspace";
import { ReferenceCardStyleRail, ReferenceCardStyleWorkspace } from "../workspaces/ReferenceCardStyleWorkspace";

type CardsInspectorProps = ComponentProps<typeof CardsInspector>;


export interface StageLayoutScreenProps {
  stage: WorkflowStageId;
  theme: string;
  skin: string;
  assistantEntry: ReactNode;
  historyActions: ReactNode;
  projectActions: ReactNode;
  workflowNav: ReactNode;
  leftRail: ReactNode;
  drawerOpen: boolean;
  onDrawerClose: () => void;
  project: ProjectDocument;
  renderProject: ProjectDocument;
  dataHealth: DataHealthSummary;
  dataIssues: DataIssue[];
  layoutIssues: LayoutHealthIssue[];
  resourceHealthIssues: ResourceHealthIssue[];
  dataWorkspaceProps: DataUploadWorkspaceProps["dataWorkspaceProps"];
  assetPanelProps: ContentAssetPanelProps;
  userAssets: UserAsset[];
  userFonts: UserFont[];
  selection: SceneSelection;
  selectedStudentId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  posterRef: RefObject<SVGSVGElement | null>;
  posterExport: UsePosterExportResult;
  /** App 的一句话反馈（保存/模板/素材/导出）。五阶段外壳靠底部状态条把它说出来。 */
  statusMessage?: string;
  onPatch: ContentLayoutWorkspaceProps["onPatch"];
  onReset: ContentLayoutWorkspaceProps["onReset"];
  onSelect: ContentLayoutWorkspaceProps["onSelect"];
  onSelectStudent: (id: string) => void;
  onChangeDataView: MapStyleWorkspaceProps["onChangeDataView"];
  onAddUserAsset: NonNullable<MapStyleWorkspaceProps["onAddUserAsset"]>;
  onCardPositionsResolved: NonNullable<MapStyleWorkspaceProps["onCardPositionsResolved"]>;
  onMoveProvinceTexture: NonNullable<MapStyleWorkspaceProps["onMoveProvinceTexture"]>;
  onResizeMapImage: NonNullable<MapStyleWorkspaceProps["onResizeMapImage"]>;
  onMoveText: NonNullable<ContentLayoutWorkspaceProps["onMoveText"]>;
  onMoveAsset: NonNullable<ContentLayoutWorkspaceProps["onMoveAsset"]>;
  onResizeAsset: NonNullable<ContentLayoutWorkspaceProps["onResizeAsset"]>;
  onMoveCard: NonNullable<ContentLayoutWorkspaceProps["onMoveCard"]>;
  onMoveGuests: NonNullable<ContentLayoutWorkspaceProps["onMoveGuests"]>;
  templateActions: EditorTemplateActions;
  onApplyFont: NonNullable<ContentLayoutWorkspaceProps["onApplyFont"]>;
  onUploadFont: NonNullable<ContentLayoutWorkspaceProps["onUploadFont"]>;
  onDeleteUserFont: NonNullable<ContentLayoutWorkspaceProps["onDeleteUserFont"]>;
  onUndo: () => void;
  onRedo: () => void;
  onRefreshPositions: () => void;
  onBackToMap: () => void;
  onLocateDeliveryIssue: (issue: DeliveryIssue) => void;
}

/**
 * 聚焦阶段的整屏分支:按阶段装配 `StudioLayoutTemplate` 的右栏 / 工作区 / 阶段动作三个插槽。
 * App 只交出数据与回调,插槽装配(含 map/province/cards 的 patch 目标构造)留在这里。
 */
export function StageLayoutScreen(props: StageLayoutScreenProps) {
  const {
    stage,
    theme,
    skin,
    assistantEntry,
    historyActions,
    projectActions,
    workflowNav,
    leftRail,
    drawerOpen,
    onDrawerClose,
    posterExport,
    statusMessage,
  } = props;

  const slots = buildStageSlots(stage, props);

  return (
    <StudioLayoutTemplate
      theme={theme}
      skin={skin}
      stage={stage}
      assistantEntry={assistantEntry}
      historyActions={historyActions}
      stageActions={slots.stageActions}
      projectActions={projectActions}
      workflowNav={workflowNav}
      leftRail={leftRail}
      rightRail={slots.rightRail}
      rightRailLabel={STAGE_METADATA[stage].rightRailLabel}
      drawerOpen={drawerOpen}
      onDrawerClose={onDrawerClose}
      statusStrip={<StatusStrip message={statusMessage} />}
      dialogs={<ExportProjectDialog posterExport={posterExport} />}
    >
      {slots.workspace}
    </StudioLayoutTemplate>
  );
}

function buildStageSlots(stage: WorkflowStageId, props: StageLayoutScreenProps): StageSlots {
  const {
    project,
    renderProject,
    dataHealth,
    dataIssues,
    layoutIssues,
    resourceHealthIssues,
    dataWorkspaceProps,
    assetPanelProps,
    userAssets,
    userFonts,
    selection,
    selectedStudentId,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    posterRef,
    posterExport,
    onPatch,
    onReset,
    onSelect,
    onSelectStudent,
    onChangeDataView,
    onAddUserAsset,
    onCardPositionsResolved,
    onMoveProvinceTexture,
    onResizeMapImage,
    onMoveText,
    onMoveAsset,
    onResizeAsset,
    onMoveCard,
    onMoveGuests,
    templateActions,
    onApplyFont,
    onUploadFont,
    onDeleteUserFont,
    onUndo,
    onRedo,
    onRefreshPositions,
    onBackToMap,
    onLocateDeliveryIssue,
  } = props;

  const selectedProvince = selection.type === "province" ? selection.province : null;
  const resourceIssues = resourceHealthIssues.filter((issue) => issue.kind === "resource");
  const fontIssues = resourceHealthIssues.filter((issue) => issue.kind === "font");
  const patchCards: CardsInspectorProps["onPatch"] = (patch) => onPatch({ type: "cards" }, patch);
  const resetCards = () => onReset({ type: "cards" });

  switch (stage) {
    case "data":
      return {
        rightRail: (
          <DataUploadRail
            project={project}
            summary={dataHealth}
            issues={dataIssues}
            dataWorkspaceProps={dataWorkspaceProps}
            onSelectStudent={onSelectStudent}
          />
        ),
        workspace: (
          <DataUploadWorkspace
            project={project}
            summary={dataHealth}
            issues={dataIssues}
            dataWorkspaceProps={{ ...dataWorkspaceProps, hideDataExpression: true }}
            onSelectStudent={onSelectStudent}
          />
        ),
      };
    case "map":
      return {
        rightRail: (
          <MapStyleRail
            project={project}
            selectedProvince={selectedProvince}
            userFonts={userFonts}
            canUndo={canUndo}
            canRedo={canRedo}
            undoLabel={undoLabel}
            redoLabel={redoLabel}
            onChangeDataView={onChangeDataView}
            onPatchMap={(patch) => onPatch({ type: "map" }, patch)}
            onResetMap={() => onReset({ type: "map" })}
            onPatchProvince={(province, patch) => onPatch({ type: "province", province }, patch as Record<string, unknown>)}
            onAddUserAsset={onAddUserAsset}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        ),
        workspace: (
          <MapStyleWorkspace
            project={project}
            selectedProvince={selectedProvince}
            userFonts={userFonts}
            canUndo={canUndo}
            canRedo={canRedo}
            undoLabel={undoLabel}
            redoLabel={redoLabel}
            onChangeDataView={onChangeDataView}
            onPatchMap={(patch) => onPatch({ type: "map" }, patch)}
            onResetMap={() => onReset({ type: "map" })}
            onPatchProvince={(province, patch) => onPatch({ type: "province", province }, patch as Record<string, unknown>)}
            onCardPositionsResolved={onCardPositionsResolved}
            onSelect={onSelect}
            onMoveProvinceTexture={onMoveProvinceTexture}
            onResizeMapImage={onResizeMapImage}
            onAddUserAsset={onAddUserAsset}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        ),
      };
    case "frame": {
      const framePicker = templatePickerProps(templateActions);
      return {
        stageActions: (
          <>
            <ToolbarButton label="刷新展示框位置" icon={<RefreshCw size={18} />} onClick={onRefreshPositions} />
          </>
        ),
        rightRail: (
          <ReferenceCardStyleRail
            cards={project.cards}
            userFonts={userFonts}
            onPatch={patchCards}
            onResetCards={resetCards}
            templates={framePicker.templates}
            currentTemplateId={framePicker.currentTemplateId}
            customTemplates={framePicker.customTemplates}
            onApplyTemplate={framePicker.onApplyTemplate}
            onApplyCustomTemplate={framePicker.onApplyCustomTemplate}
            onSaveTemplate={framePicker.onSaveTemplate}
          />
        ),
        workspace: (
          <ReferenceCardStyleWorkspace
            project={renderProject}
            selection={selection}
            userFonts={userFonts}
            onSelect={onSelect}
            onMoveCard={onMoveCard}
            onMoveGuests={onMoveGuests}
            onCardPositionsResolved={onCardPositionsResolved}
          />
        ),
      };
    }
    case "export":
      return {
        rightRail: (
          <DeliveryRail
            project={renderProject}
            dataIssues={dataIssues}
            layoutIssues={layoutIssues}
            resourceIssues={resourceIssues}
            fontIssues={fontIssues}
            pngScale={posterExport.pngScale}
            transparentExport={posterExport.transparentExport}
            includeResources={posterExport.includeResourcesInProjectExport}
            exportState={posterExport.exportState}
            exportError={posterExport.exportError}
            lastExportFileName={posterExport.lastExportFileName}
            onPngScaleChange={posterExport.setPngScale}
            onTransparentExportChange={posterExport.setTransparentExport}
            onIncludeResourcesChange={posterExport.setIncludeResourcesInProjectExport}
            onLocate={onLocateDeliveryIssue}
            onExportPng={() => void posterExport.exportPng()}
            onExportSvg={posterExport.exportSvg}
            onExportProjectPackage={posterExport.exportProjectPackage}
            onRetry={posterExport.retryLastExport}
          />
        ),
        workspace: (
          <DeliveryWorkspace
            project={renderProject}
            posterRef={posterRef}
            userFonts={userFonts}
            dataIssues={dataIssues}
            layoutIssues={layoutIssues}
            resourceIssues={resourceIssues}
            fontIssues={fontIssues}
            pngScale={posterExport.pngScale}
            transparentExport={posterExport.transparentExport}
            includeResources={posterExport.includeResourcesInProjectExport}
            exportState={posterExport.exportState}
            exportError={posterExport.exportError}
            lastExportFileName={posterExport.lastExportFileName}
            onPngScaleChange={posterExport.setPngScale}
            onTransparentExportChange={posterExport.setTransparentExport}
            onIncludeResourcesChange={posterExport.setIncludeResourcesInProjectExport}
            onLocate={onLocateDeliveryIssue}
            onExportPng={() => void posterExport.exportPng()}
            onExportSvg={posterExport.exportSvg}
            onExportProjectPackage={posterExport.exportProjectPackage}
            onRetry={posterExport.retryLastExport}
          />
        ),
      };
    case "content":
      return {
        stageActions: (
          <>
            <ToolbarButton label="刷新展示框位置" icon={<RefreshCw size={18} />} onClick={onRefreshPositions} />
            <ToolbarButton label="返回地图" icon={<MapPinned size={18} />} onClick={onBackToMap} />
          </>
        ),
        rightRail: (
          <ContentLayoutRail
            project={renderProject}
            selection={selection}
            userAssets={userAssets}
            userFonts={userFonts}
            assetPanelProps={assetPanelProps}
            onPatch={onPatch}
            onReset={onReset}
            onApplyFont={onApplyFont}
            onUploadFont={onUploadFont}
            onDeleteUserFont={onDeleteUserFont}
            {...templatePickerProps(templateActions)}
          />
        ),
        workspace: (
          <ContentLayoutWorkspace
            project={renderProject}
            selection={selection}
            userAssets={userAssets}
            userFonts={userFonts}
            canUndo={canUndo}
            canRedo={canRedo}
            undoLabel={undoLabel}
            redoLabel={redoLabel}
            assetPanelProps={assetPanelProps}
            onSelect={onSelect}
            onPatch={onPatch}
            onReset={onReset}
            onRefreshPositions={onRefreshPositions}
            onBackToMap={onBackToMap}
            onUndo={onUndo}
            onRedo={onRedo}
            selectedStudentId={selectedStudentId}
            onSelectStudent={onSelectStudent}
            onApplyFont={onApplyFont}
            onUploadFont={onUploadFont}
            onDeleteUserFont={onDeleteUserFont}
            onMoveText={onMoveText}
            onMoveAsset={onMoveAsset}
            onResizeAsset={onResizeAsset}
            onMoveProvinceTexture={onMoveProvinceTexture}
            onResizeMapImage={onResizeMapImage}
            onCardPositionsResolved={onCardPositionsResolved}
            onMoveCard={onMoveCard}
            onMoveGuests={onMoveGuests}
          />
        ),
      };
  }
}
