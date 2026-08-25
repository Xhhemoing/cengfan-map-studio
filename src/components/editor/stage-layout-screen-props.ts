import type { ReactNode, RefObject } from "react";
import type { UserAsset } from "../../lib/assets";
import type { DataHealthSummary, DataIssue } from "../../lib/data-health";
import type { EditorTemplateActions } from "../../lib/editor-template-actions";
import type { UserFont } from "../../lib/fonts";
import type { LayoutHealthIssue } from "../../lib/layout-health";
import type { ProjectDocument } from "../../lib/project-document";
import type { ResourceHealthIssue } from "../../lib/resource-health";
import type { SceneSelection } from "../../lib/scene-document";
import type { UsePosterExportResult } from "../../lib/usePosterExport";
import type { WorkflowStageId } from "../../lib/workflow-stages";
import type { ContentAssetPanelProps, ContentLayoutWorkspaceProps } from "../workspaces/ContentLayoutWorkspace";
import type { DataUploadWorkspaceProps } from "../workspaces/DataUploadWorkspace";
import type { DeliveryIssue } from "../workspaces/DeliveryWorkspace";
import type { MapStyleWorkspaceProps } from "../workspaces/MapStyleWorkspace";

/**
 * 聚焦阶段整屏的入参。单独成文件是因为它同时被 `StageLayoutScreen` 与其
 * `buildStageSlots` 消费，而 `StageLayoutScreen.tsx` 已经贴着 400 行的拆分线。
 */
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
  /** 保存 / 导入 / 模板 / 复制等操作的结果回执，由壳层的 live region 播报。 */
  statusMessage?: string;
  onDismissStatusMessage?: () => void;
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
