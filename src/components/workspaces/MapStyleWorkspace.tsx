import { Redo2, Undo2 } from "lucide-react";
import type { DataViewId } from "../../lib/project-data";
import type { ProjectDocument } from "../../lib/project-document";
import type { UserAsset } from "../../lib/assets";
import type { UserFont } from "../../lib/fonts";
import type { MapSettings, ProvinceStyle, SceneSelection } from "../../lib/scene-document";
import { InspectorPanel } from "../inspector/InspectorPanel";
import { PosterCanvas } from "../canvas/PosterCanvas";
import { IconButton, SegmentedControl } from "../StudioUi";

const DATA_VIEWS: Array<{ id: DataViewId; label: string; ariaLabel: string }> = [
  { id: "province", label: "省份", ariaLabel: "切换为省份表达" },
  { id: "city", label: "城市", ariaLabel: "切换为城市表达" },
  { id: "university", label: "院校", ariaLabel: "切换为院校表达" },
  { id: "pins", label: "图钉", ariaLabel: "切换为图钉表达" },
  { id: "heat", label: "热力", ariaLabel: "切换为热力表达" },
];


export interface MapStyleWorkspaceProps {
  project: ProjectDocument;
  selectedProvince: string | null;
  userFonts?: UserFont[];
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  onChangeDataView: (view: DataViewId) => void;
  onPatchMap: (patch: Partial<MapSettings>) => void;
  onResetMap: () => void;
  onPatchProvince: (province: string, patch: Partial<ProvinceStyle>) => void;
  onSelect: (selection: SceneSelection) => void;
  onMoveProvinceTexture?: (province: string, offsetX: number, offsetY: number) => void;
  onResizeMapImage?: (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => void;
  onAddUserAsset?: (asset: UserAsset) => void;
  onCardPositionsResolved?: (positions: Record<string, { x: number; y: number }>) => void;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Props for the map stage's right rail. The shell owns the rail chrome
 * (labelled aside + resizer + mobile drawer); this component supplies the
 * 地图表达 segmented control, the undo/redo history group and the
 * map/province InspectorPanel.
 */
export type MapStyleRailProps = Omit<
  MapStyleWorkspaceProps,
  "onSelect" | "onMoveProvinceTexture" | "onResizeMapImage" | "onCardPositionsResolved"
>;

export function MapStyleRail({
  project,
  selectedProvince,
  userFonts = [],
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onChangeDataView,
  onPatchMap,
  onResetMap,
  onPatchProvince,
  onAddUserAsset,
  onUndo,
  onRedo,
}: MapStyleRailProps) {
  return (
    <aside className="map-style-workspace__context" aria-label="地图对象属性">
      <section className="map-style-workspace__section" aria-label="地图表达">
        <div className="map-style-workspace__section-heading">
          <strong>地图表达</strong>
          <div className="map-style-workspace__history" role="group" aria-label="地图样式历史">
            <IconButton label={undoLabel} icon={<Undo2 size={17} aria-hidden />} disabled={!canUndo} onClick={onUndo} />
            <IconButton label={redoLabel} icon={<Redo2 size={17} aria-hidden />} disabled={!canRedo} onClick={onRedo} />
          </div>
        </div>
        <SegmentedControl
          label="地图表达"
          activeId={project.dataView}
          items={DATA_VIEWS}
          onChange={onChangeDataView}
          className="map-style-workspace__data-views"
        />
      </section>
      <InspectorPanel
        project={project}
        selection={selectedProvince ? { type: "province", province: selectedProvince } : { type: "map" }}
        userFonts={userFonts}
        onPatch={(target, patch) => {
          if (target.type === "map") onPatchMap(patch as Partial<MapSettings>);
          if (target.type === "province") onPatchProvince(target.province, patch as Partial<ProvinceStyle>);
        }}
        onReset={(target) => {
          if (target.type === "map") onResetMap();
        }}
        onAddUserAsset={onAddUserAsset}
      />
    </aside>
  );
}

/**
 * Center content of the map style stage: the poster canvas preview. The
 * map/province controls live in the unified right rail (`MapStyleRail`).
 */
export function MapStyleWorkspace({
  project,
  selectedProvince,
  userFonts = [],
  onSelect,
  onMoveProvinceTexture,
  onResizeMapImage,
  onCardPositionsResolved,
}: MapStyleWorkspaceProps) {
  return (
    <main className="map-style-workspace" aria-label="地图样式">
      <div className="map-style-workspace__body">
        <section className="map-style-workspace__preview" aria-label="地图样式预览">
          <div className="map-style-workspace__preview-heading">
            <div>
              <strong>实时预览</strong>
              <small>{selectedProvince ? `正在编辑 ${selectedProvince}` : "点击地图省份进入省份样式"}</small>
            </div>
            <span>{project.students.length} 条名单</span>
          </div>
          <div className="map-style-workspace__canvas">
            <PosterCanvas
              project={project}
              selectedProvince={selectedProvince}
              userFonts={userFonts}
              onSelect={onSelect}
              onMoveProvinceTexture={onMoveProvinceTexture}
              onResizeMapImage={onResizeMapImage}
              onCardPositionsResolved={onCardPositionsResolved}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
