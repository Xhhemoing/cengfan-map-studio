import type { ComponentProps, RefObject } from "react";
import { StickyNote, Type } from "lucide-react";
import type { UserAsset } from "../../lib/assets";
import type { UserFont } from "../../lib/fonts";
import type { ProjectDocument } from "../../lib/project-document";
import type { SceneSelection } from "../../lib/scene-document";
import { AssetPanel } from "../AssetPanel";
import { PosterCanvas } from "../canvas/PosterCanvas";
import { InspectorPanel } from "../inspector/InspectorPanel";
import { ActionGroup, CompactButton } from "../StudioUi";

export type ContentAssetPanelProps = ComponentProps<typeof AssetPanel>;
export interface ContentLayoutWorkspaceProps {
  project: ProjectDocument;
  selection: SceneSelection;
  /** 共享导出 ref：挂上后「导出 SVG/PNG」在本阶段也能直接使用当前画布。 */
  posterRef?: RefObject<SVGSVGElement | null>;
  userAssets?: UserAsset[];
  userFonts?: UserFont[];
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  assetPanelProps?: ContentAssetPanelProps;
  onSelect: (selection: SceneSelection) => void;
  onPatch: (target: SceneSelection, patch: Record<string, unknown>) => void;
  onReset: (target: Extract<SceneSelection, { type: "canvas" | "map" | "cards" }>) => void;
  onRefreshPositions: () => void;
  onBackToMap: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onMoveText?: (id: string, x: number, y: number) => void;
  onMoveAsset?: (id: string, x: number, y: number) => void;
  onResizeAsset?: (id: string, x: number, y: number, width: number, height: number) => void;
  onMoveProvinceTexture?: (province: string, offsetX: number, offsetY: number) => void;
  onResizeMapImage?: (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => void;
  onMoveCard?: (id: string, x: number, y: number) => void;
  onMoveGuests?: (x: number, y: number) => void;
  onCardPositionsResolved?: (positions: Record<string, { x: number; y: number }>) => void;
  onApplyFont?: (target: Parameters<NonNullable<ComponentProps<typeof InspectorPanel>["onApplyFont"]>>[0], fontId: string, applyToAll: boolean) => void;
  onUploadFont?: (font: UserFont) => void;
  onDeleteUserFont?: (fontId: string) => void;
  onSelectStudent?: (id: string) => void;
  selectedStudentId?: string | null;
  /** 内容阶段的「添加」入口：文本框 / 特别备注。 */
  onAddText?: () => void;
  onAddNote?: () => void;
  /** 选中文本后可从检查器删除（含新添加的文本框/备注）。 */
  onDeleteText?: (id: string) => void;
}

const EMPTY_ASSET_PANEL_PROPS: ContentAssetPanelProps = {
  onApplyBackground: () => undefined,
};

function selectionLabel(selection: SceneSelection): string {
  switch (selection.type) {
    case "canvas": return "画布";
    case "map": return "地图展示框";
    case "cards": return "数据展示框";
    case "guests": return "嘉宾板块";
    case "province": return selection.province;
    case "text": return "文字";
    case "asset": return "素材实例";
  }
}

/**
 * Props for the content stage's right rail. The shell owns the rail chrome
 * (labelled aside + resizer + mobile drawer); this component supplies the
 * 当前对象 inspector and the 素材与实例 asset context. History and the
 * position-refresh / back-to-map actions live in the topbar instead.
 */
export type ContentLayoutRailProps = Omit<
  ContentLayoutWorkspaceProps,
  | "posterRef"
  | "canUndo" | "canRedo" | "undoLabel" | "redoLabel"
  | "onRefreshPositions" | "onBackToMap" | "onUndo" | "onRedo"
  | "onSelect" | "onSelectStudent" | "selectedStudentId"
  | "onMoveText" | "onMoveAsset" | "onResizeAsset"
  | "onMoveProvinceTexture" | "onResizeMapImage"
  | "onMoveCard" | "onMoveGuests" | "onCardPositionsResolved"
>;

export function ContentLayoutRail({
  project,
  selection,
  userAssets = [],
  userFonts = [],
  assetPanelProps = EMPTY_ASSET_PANEL_PROPS,
  onPatch,
  onReset,
  onApplyFont,
  onUploadFont,
  onDeleteUserFont,
  onAddText,
  onAddNote,
  onDeleteText,
}: ContentLayoutRailProps) {
  return (
    <aside className="content-layout-workspace__context" aria-label="内容对象属性">
      {(onAddText || onAddNote) && (
        <section className="content-layout-workspace__add" aria-label="添加画布元素">
          <div className="content-layout-workspace__section-heading"><strong>添加</strong><small>文本与备注</small></div>
          <ActionGroup label="添加画布元素">
            {onAddText && <CompactButton icon={<Type size={14} aria-hidden />} onClick={onAddText}>添加文本框</CompactButton>}
            {onAddNote && <CompactButton icon={<StickyNote size={14} aria-hidden />} onClick={onAddNote}>添加特别备注</CompactButton>}
          </ActionGroup>
        </section>
      )}
      <section aria-label="当前对象属性">
        <div className="content-layout-workspace__section-heading"><strong>当前对象</strong><small>{selectionLabel(selection)}</small></div>
        <InspectorPanel
          project={project}
          selection={selection}
          userFonts={userFonts}
          onPatch={onPatch}
          onReset={onReset}
          onDeleteText={onDeleteText}
          onApplyFont={onApplyFont}
          onUploadFont={onUploadFont}
          onDeleteUserFont={onDeleteUserFont}
        />
      </section>
      <details open className="content-layout-workspace__assets" aria-label="内容素材上下文">
        <summary>素材与实例</summary>
        <AssetPanel {...assetPanelProps} userAssets={userAssets} />
      </details>
    </aside>
  );
}

/**
 * Center content of the content stage: the poster canvas preview. The
 * 当前对象 inspector and 素材与实例 context live in the unified right rail
 * (`ContentLayoutRail`); undo/redo, 刷新展示框位置 and 返回地图样式 actions
 * live in the topbar's stage-actions slot.
 */
export function ContentLayoutWorkspace({
  project,
  selection,
  posterRef,
  userFonts = [],
  onSelect,
  onMoveText,
  onMoveAsset,
  onResizeAsset,
  onMoveProvinceTexture,
  onResizeMapImage,
  onMoveCard,
  onMoveGuests,
  onCardPositionsResolved,
  onSelectStudent,
  selectedStudentId = null,
}: ContentLayoutWorkspaceProps) {
  return (
    <main className="content-layout-workspace workflow-panel--content" aria-label="内容与排版">
      <div className="content-layout-workspace__body">
        <section className="content-layout-workspace__preview" aria-label="内容排版画布">
          <div className="content-layout-workspace__preview-heading"><strong>实时画布</strong><span>{project.canvas.width} × {project.canvas.height}</span></div>
          <div className="content-layout-workspace__canvas">
            <PosterCanvas
              project={project}
              posterRef={posterRef}
              selectedTextId={selection.type === "text" ? selection.id : null}
              selectedAssetId={selection.type === "asset" ? selection.id : null}
              selectedProvince={selection.type === "province" ? selection.province : null}
              selectedStudentId={selectedStudentId}
              userFonts={userFonts}
              onSelect={onSelect}
              onMoveText={onMoveText}
              onMoveAsset={onMoveAsset}
              onResizeAsset={onResizeAsset}
              onMoveProvinceTexture={onMoveProvinceTexture}
              onResizeMapImage={onResizeMapImage}
              onMoveCard={onMoveCard}
              onMoveGuests={onMoveGuests}
              onCardPositionsResolved={onCardPositionsResolved}
              onSelectStudent={onSelectStudent}
              mapSelected={selection.type === "map"}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
