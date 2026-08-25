import type { RefObject } from "react";
import type { CardPositions, createEditorCanvasActions } from "../../lib/editor-canvas-actions";
import type { UserFont } from "../../lib/fonts";
import type { ProjectDocument } from "../../lib/project-document";
import type { SceneSelection } from "../../lib/scene-document";
import { PosterCanvas } from "../canvas/PosterCanvas";

type EditorCanvasActions = ReturnType<typeof createEditorCanvasActions>;

export interface LegacyEditorStageProps {
  /** 窄屏自适应缩放的 effect 从这个容器读可用尺寸,ref 的持有者仍是 App。 */
  stageRef: RefObject<HTMLDivElement | null>;
  /** 缩放外壳按已提交的画布尺寸布局,海报本身渲染可能带预览的 renderProject。 */
  project: ProjectDocument;
  renderProject: ProjectDocument;
  posterRef: RefObject<SVGSVGElement | null>;
  zoomPercent: number;
  selection: SceneSelection;
  selectedStudentId: string | null;
  userFonts: UserFont[];
  showGrid: boolean;
  gridSize: number;
  renderIntervalMs: number;
  canvasActions: Pick<
    EditorCanvasActions,
    | "moveText"
    | "moveAsset"
    | "resizeAsset"
    | "moveProvinceTexture"
    | "resizeMapImage"
    | "moveCard"
    | "moveGuests"
  >;
  onSelect: (selection: SceneSelection) => void;
  onSelectStudent: (id: string) => void;
  onCardPositionsResolved: (positions: CardPositions) => void;
}

/**
 * 旧版编辑器中栏:`editor-area` / `canvas-stage` 两层容器 + 缩放外壳里的 PosterCanvas。
 * 缩放数学(外壳按百分比取整、内层按原始尺寸 scale)与 DOM 结构和 App 内联时逐字一致。
 */
export function LegacyEditorStage({
  stageRef,
  project,
  renderProject,
  posterRef,
  zoomPercent,
  selection,
  selectedStudentId,
  userFonts,
  showGrid,
  gridSize,
  renderIntervalMs,
  canvasActions,
  onSelect,
  onSelectStudent,
  onCardPositionsResolved,
}: LegacyEditorStageProps) {
  return (
    <section className="editor-area">
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
              posterRef={posterRef}
              selectedTextId={selection.type === "text" ? selection.id : null}
              selectedAssetId={selection.type === "asset" ? selection.id : null}
              selectedProvince={selection.type === "province" ? selection.province : null}
              userFonts={userFonts}
              showGrid={showGrid}
              gridSize={gridSize}
              renderIntervalMs={renderIntervalMs}
              onSelect={onSelect}
              onMoveText={canvasActions.moveText}
              onMoveAsset={canvasActions.moveAsset}
              onResizeAsset={canvasActions.resizeAsset}
              mapSelected={selection.type === "map"}
              onMoveProvinceTexture={canvasActions.moveProvinceTexture}
              onResizeMapImage={canvasActions.resizeMapImage}
              onCardPositionsResolved={onCardPositionsResolved}
              selectedStudentId={selectedStudentId}
              onSelectStudent={onSelectStudent}
              onMoveCard={canvasActions.moveCard}
              onMoveGuests={canvasActions.moveGuests}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
