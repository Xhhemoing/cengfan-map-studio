import { ArrowLeft, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { useMemo, type ComponentProps } from "react";
import type { UserAsset } from "../../lib/assets";
import type { UserFont } from "../../lib/fonts";
import type { ProjectDocument } from "../../lib/project-document";
import type { LayoutHealthIssue } from "../../lib/layout-health";
import type { SceneSelection } from "../../lib/scene-document";
import { AssetPanel } from "../AssetPanel";
import { PosterCanvas } from "../canvas/PosterCanvas";
import { InspectorPanel } from "../inspector/InspectorPanel";
import { CompactButton, IconButton } from "../StudioUi";

export type ContentAssetPanelProps = ComponentProps<typeof AssetPanel>;
type ArrangeMode = "untouched" | "all";

export interface ContentLayoutWorkspaceProps {
  project: ProjectDocument;
  selection: SceneSelection;
  userAssets?: UserAsset[];
  userFonts?: UserFont[];
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  layoutIssues: LayoutHealthIssue[];
  assetPanelProps?: ContentAssetPanelProps;
  onSelect: (selection: SceneSelection) => void;
  onPatch: (target: SceneSelection, patch: Record<string, unknown>) => void;
  onReset: (target: Extract<SceneSelection, { type: "canvas" | "map" | "cards" }>) => void;
  onArrangeCards: (mode: ArrangeMode) => void;
  onLocateLayoutIssue: (issue: LayoutHealthIssue) => void;
  onRestoreCardPosition: (id: string) => void;
  onRestoreAllCardPositions: () => void;
  onClose: () => void;
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

export function ContentLayoutWorkspace({
  project,
  selection,
  userAssets = [],
  userFonts = [],
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  layoutIssues,
  assetPanelProps = EMPTY_ASSET_PANEL_PROPS,
  onSelect,
  onPatch,
  onReset,
  onArrangeCards,
  onLocateLayoutIssue,
  onRestoreCardPosition,
  onRestoreAllCardPositions,
  onClose,
  onBackToMap,
  onUndo,
  onRedo,
  onMoveText,
  onMoveAsset,
  onResizeAsset,
  onMoveProvinceTexture,
  onResizeMapImage,
  onMoveCard,
  onMoveGuests,
  onApplyFont,
  onUploadFont,
  onDeleteUserFont,
  onSelectStudent,
  selectedStudentId = null,
}: ContentLayoutWorkspaceProps) {
  const manualPositionIds = useMemo(
    () => Object.keys(project.cards.positions ?? {}).sort((left, right) => left.localeCompare(right)),
    [project.cards.positions],
  );
  const outline = useMemo(() => [
    { selection: { type: "canvas" } as const, label: "画布" },
    { selection: { type: "map" } as const, label: "地图展示框" },
    { selection: { type: "cards" } as const, label: "数据展示框" },
    { selection: { type: "guests" } as const, label: "嘉宾板块" },
    ...project.textElements.filter((item) => item.visibility !== false).map((item) => ({
      selection: { type: "text", id: item.id } as const,
      label: item.content.trim() || "未命名文字",
    })),
    ...project.assetElements.filter((item) => item.visibility !== false).map((item) => ({
      selection: { type: "asset", id: item.id } as const,
      label: item.label,
    })),
  ], [project.assetElements, project.textElements]);

  return (
    <main className="content-layout-workspace workflow-panel--content" aria-label="内容与排版">
      <header className="content-layout-workspace__header">
        <div className="content-layout-workspace__header-actions">
          <CompactButton aria-label="返回编辑器" icon={<ArrowLeft size={17} aria-hidden />} onClick={onClose}>返回编辑器</CompactButton>
          <CompactButton aria-label="返回地图样式" variant="ghost" onClick={onBackToMap}>地图样式</CompactButton>
        </div>
        <div className="content-layout-workspace__history" role="group" aria-label="内容与排版历史">
          <IconButton label={undoLabel} icon={<Undo2 size={17} aria-hidden />} disabled={!canUndo} onClick={onUndo} />
          <IconButton label={redoLabel} icon={<Redo2 size={17} aria-hidden />} disabled={!canRedo} onClick={onRedo} />
        </div>
      </header>

      <div className="content-layout-workspace__body">
        <aside className="content-layout-workspace__outline" aria-label="内容大纲">
          <div className="content-layout-workspace__section-heading"><strong>内容大纲</strong><small>{outline.length} 个对象</small></div>
          <div className="content-layout-workspace__outline-list" role="listbox" aria-label="内容对象列表">
            {outline.map(({ selection: itemSelection, label }) => (
              <button
                key={`${itemSelection.type}-${"id" in itemSelection ? itemSelection.id : ""}-${"province" in itemSelection ? itemSelection.province : ""}`}
                type="button"
                role="option"
                aria-selected={JSON.stringify(selection) === JSON.stringify(itemSelection)}
                className={JSON.stringify(selection) === JSON.stringify(itemSelection) ? "is-active" : undefined}
                onClick={() => onSelect(itemSelection)}
              >
                <span>{label}</span>
                <small>{selectionLabel(itemSelection)}</small>
              </button>
            ))}
          </div>
          <section className="content-layout-workspace__section" aria-label="智能排版控制">
            <div className="content-layout-workspace__section-heading"><strong>智能排版</strong><small>手调位置会保留</small></div>
            <button type="button" className="wide-button" aria-label="仅排未手调" onClick={() => onArrangeCards("untouched")}>仅排未手调</button>
            <button type="button" className="secondary-button" aria-label="全部重新排版" onClick={() => onArrangeCards("all")}>全部重新排版</button>
            {manualPositionIds.length > 0 && (
              <div className="content-layout-workspace__manual-positions" aria-label="手动位置">
                <div className="content-layout-workspace__section-heading"><strong>手动位置</strong><small>{manualPositionIds.length}</small></div>
                {manualPositionIds.map((id) => (
                  <button key={id} type="button" onClick={() => onRestoreCardPosition(id)}>
                    <span>{id}</span><RotateCcw size={13} aria-hidden />
                  </button>
                ))}
                <button type="button" className="content-layout-workspace__restore-all" onClick={onRestoreAllCardPositions}>恢复全部自动位置</button>
              </div>
            )}
          </section>
          <section className="content-layout-workspace__issues" aria-label="排版问题提示">
            <div className="content-layout-workspace__section-heading"><strong>排版问题</strong><small>{layoutIssues.length} 项</small></div>
            {layoutIssues.length === 0 ? <p>当前未发现明显问题。</p> : layoutIssues.map((issue) => <button key={issue.id} type="button" onClick={() => onLocateLayoutIssue(issue)}>{issue.detail}</button>)}
          </section>
        </aside>

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
              onSelectStudent={onSelectStudent}
              mapSelected={selection.type === "map"}
            />
          </div>
        </section>

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
      </div>
    </main>
  );
}
