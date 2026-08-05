import { ArrowLeft, Redo2, Undo2 } from "lucide-react";
import { useState, type ComponentProps } from "react";
import type { DataViewId } from "../../lib/project-data";
import type { ProjectDocument } from "../../lib/project-document";
import type { UserAsset } from "../../lib/assets";
import type { UserFont } from "../../lib/fonts";
import type { MapSettings, ProvinceStyle, SceneSelection } from "../../lib/scene-document";
import { AssetPanel } from "../AssetPanel";
import { MapInspector } from "../inspector/MapInspector";
import { ProvinceInspector } from "../inspector/ProvinceInspector";
import { PosterCanvas } from "../canvas/PosterCanvas";
import { CompactButton, IconButton, SegmentedControl } from "../StudioUi";
import { type ImageThemeResult } from "../../lib/image-color";
import { type ProvinceTextureUniformSize } from "../../lib/scene-document";

const DATA_VIEWS: Array<{ id: DataViewId; label: string; ariaLabel: string }> = [
  { id: "province", label: "省份", ariaLabel: "切换为省份表达" },
  { id: "city", label: "城市", ariaLabel: "切换为城市表达" },
  { id: "university", label: "院校", ariaLabel: "切换为院校表达" },
  { id: "pins", label: "图钉", ariaLabel: "切换为图钉表达" },
  { id: "heat", label: "热力", ariaLabel: "切换为热力表达" },
];

export type MapStyleAssetPanelProps = ComponentProps<typeof AssetPanel>;
type AssetPanelProps = MapStyleAssetPanelProps;

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
  assetPanelProps?: MapStyleAssetPanelProps;
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const EMPTY_ASSET_PANEL_PROPS: AssetPanelProps = {
  onApplyBackground: () => undefined,
};

export function MapStyleWorkspace({
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
  onSelect,
  onMoveProvinceTexture,
  onResizeMapImage,
  onAddUserAsset,
  assetPanelProps = EMPTY_ASSET_PANEL_PROPS,
  onClose,
  onUndo,
  onRedo,
}: MapStyleWorkspaceProps) {
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const provinceStyle = selectedProvince ? project.map.provinceStyles?.[selectedProvince] : undefined;
  const selectProvince = (province: string) => {
    if (!province) return;
    onSelect({ type: "province", province });
  };
  const patchProvince = (patch: Partial<ProvinceStyle>) => {
    if (selectedProvince) onPatchProvince(selectedProvince, patch);
  };
  const inlineAssetPanelProps: AssetPanelProps = {
    ...assetPanelProps,
    selectedProvince: selectedProvince ?? "",
    selectedProvinceStyle: provinceStyle,
    provinceStyles: project.map.provinceStyles,
    provinceTextureUniformSize: project.map.provinceTextureUniformSize,
    onSelectProvince: selectProvince,
    onAddUserAsset: assetPanelProps.onAddUserAsset ?? onAddUserAsset,
    onPatchProvinceTextureUniformSize: (next: ProvinceTextureUniformSize) => onPatchMap({ provinceTextureUniformSize: next }),
    onApplyProvinceAppearance: (province, appearance, fill) => {
      selectProvince(province);
      assetPanelProps.onApplyProvinceAppearance?.(province, appearance, fill);
    },
    onApplyProvinceThemes: (themes: Record<string, ImageThemeResult>) => assetPanelProps.onApplyProvinceThemes?.(themes),
    onResetProvinceAppearance: (province) => {
      selectProvince(province);
      assetPanelProps.onResetProvinceAppearance?.(province);
    },
  };

  return (
    <main className="map-style-workspace" aria-label="地图样式">
      <header className="map-style-workspace__header">
        <CompactButton
          aria-label="返回编辑器"
          icon={<ArrowLeft size={17} aria-hidden />}
          onClick={onClose}
        >返回编辑器</CompactButton>
        <div className="map-style-workspace__history" role="group" aria-label="地图样式历史">
          <IconButton label={undoLabel} icon={<Undo2 size={17} aria-hidden />} disabled={!canUndo} onClick={onUndo} />
          <IconButton label={redoLabel} icon={<Redo2 size={17} aria-hidden />} disabled={!canRedo} onClick={onRedo} />
        </div>
      </header>

      <div className="map-style-workspace__body">
        <aside className="map-style-workspace__controls" aria-label="地图样式控制">
          <section className="map-style-workspace__section" aria-label="地图表达">
            <div className="map-style-workspace__section-heading">
              <strong>地图表达</strong>
              <small>选择读图方式</small>
            </div>
            <SegmentedControl
              label="地图表达"
              activeId={project.dataView}
              items={DATA_VIEWS}
              onChange={onChangeDataView}
              className="map-style-workspace__data-views"
            />
          </section>
          <MapInspector
            map={project.map}
            mode="global"
            collapsible
            onPatch={onPatchMap}
            onReset={onResetMap}
          />
        </aside>

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
            />
          </div>
        </section>

        <aside className="map-style-workspace__context" aria-label="地图省份样式">
          {selectedProvince ? (
            <>
              <ProvinceInspector
                province={selectedProvince}
                style={provinceStyle}
                onPatch={patchProvince}
                onAddUserAsset={onAddUserAsset}
                uniformSize={project.map.provinceTextureUniformSize}
                onPatchUniformSize={(next) => onPatchMap({ provinceTextureUniformSize: next })}
              />
              <CompactButton
                aria-label="打开省份素材"
                onClick={() => setAssetPanelOpen((open) => !open)}
              >{assetPanelOpen ? "收起省份素材" : "打开省份素材"}</CompactButton>
              {assetPanelOpen && <div className="map-style-workspace__asset-drawer"><AssetPanel {...inlineAssetPanelProps} /></div>}
            </>
          ) : (
            <section className="map-style-workspace__empty" aria-label="省份样式提示">
              <strong>选择省份样式</strong>
              <p>在中央预览中点击任意省份，调整该省底色、贴图比例和显示状态。</p>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
