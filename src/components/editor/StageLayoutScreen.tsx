import { MapPinned, RefreshCw } from "lucide-react";
import type { ComponentProps } from "react";
import { STAGE_METADATA } from "../../lib/stage-metadata";
import { templatePickerProps } from "../../lib/editor-template-actions";
import type { WorkflowStageId } from "../../lib/workflow-stages";
import { CardsInspector } from "../inspector/CardsInspector";
import { StudioLayoutTemplate, type StageSlots } from "../StudioLayoutTemplate";
import { ToolbarButton } from "../StudioUi";
import { ContentLayoutRail, ContentLayoutWorkspace } from "../workspaces/ContentLayoutWorkspace";
import { DataUploadRail, DataUploadWorkspace } from "../workspaces/DataUploadWorkspace";
import { DeliveryRail, DeliveryWorkspace } from "../workspaces/DeliveryWorkspace";
import { MapStyleRail, MapStyleWorkspace } from "../workspaces/MapStyleWorkspace";
import { ReferenceCardStyleRail, ReferenceCardStyleWorkspace } from "../workspaces/ReferenceCardStyleWorkspace";
import type { StageLayoutScreenProps } from "./stage-layout-screen-props";

export type { StageLayoutScreenProps };

type CardsInspectorProps = ComponentProps<typeof CardsInspector>;

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
    statusMessage,
    onDismissStatusMessage,
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
      statusMessage={statusMessage}
      onDismissStatusMessage={onDismissStatusMessage}
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
