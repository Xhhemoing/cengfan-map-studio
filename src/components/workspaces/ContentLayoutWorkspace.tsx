import type { ComponentProps } from "react";
import type { UserAsset } from "../../lib/assets";
import type { UserFont } from "../../lib/fonts";
import type { ProjectDocument } from "../../lib/project-document";
import type { SceneSelection } from "../../lib/scene-document";
import { AssetPanel } from "../AssetPanel";
import { PosterCanvas } from "../canvas/PosterCanvas";
import { InspectorPanel } from "../inspector/InspectorPanel";

export type ContentAssetPanelProps = ComponentProps<typeof AssetPanel>;
export interface ContentLayoutWorkspaceProps {
  project: ProjectDocument;
  selection: SceneSelection;
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
}: ContentLayoutRailProps) {
  return (
    <aside className="content-layout-workspace__context" aria-label="内容对象属性">
      <section aria-label="当前对象属性">
        <div className="content-layout-workspace__section-heading"><strong>当前对象</strong><small>{selectionLabel(selection)}</small></div>
        <InspectorPanel
          project={project}
          selection={selection}
          userFonts={userFonts}
          onPatch={onPatch}
          onReset={onReset}
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
