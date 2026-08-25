import { useMemo } from "react";
import { listSystemAssets, type StudioAsset, type UserAsset } from "../lib/assets";
import type { ImageThemeResult } from "../lib/image-color";
import type { ProvinceAppearance, ProvinceStyle, ProvinceTextureUniformSize } from "../lib/scene-document";
import { AssetPanelLibrary } from "./asset-panel-library";
import { AssetPanelProvinceAppearance } from "./asset-panel-province-appearance";
import { AssetPanelResourcePack, AssetPanelUploadSections } from "./asset-panel-upload-sections";
import { useAssetPanelUploads } from "./asset-panel-uploads";
import { PanelHeader, PanelSection } from "./StudioUi";

interface AssetInstanceSummary {
  id: string;
  assetId: string;
  label: string;
  /** Movable canvas instances only (landmarks/decorations). Province textures are base appearance. */
  kind?: string;
}

export function AssetPanel({
  instances = [],
  provinces = [],
  dataProvinces = [],
  selectedProvince = "",
  selectedProvinceStyle,
  provinceStyles = {},
  provinceAdjacency = {},
  mapBaseColor = "#d6d3c2",
  posterBackground = "#fff9ed",
  provinceTextureUniformSize,
  userAssets = [],

  onSelectProvince,
  onSelectInstance,
  onApplyBackground,
  onCreateLandmark: _onCreateLandmark,
  onCreateDecoration,
  onApplyProvinceAppearance,
  onApplyProvinceThemes,
  onPatchProvinceTextureUniformSize,

  onResetProvinceAppearance,
  onAddUserAsset,
  onReplaceUserAsset,
  onDeleteUserAsset,

  onExportResourcePack,
  onImportResourcePack,
  assetUsageById = {},

}: {
  instances?: AssetInstanceSummary[];
  provinces?: string[];
  dataProvinces?: string[];
  selectedProvince?: string;
  selectedProvinceStyle?: ProvinceStyle;
  provinceStyles?: Record<string, ProvinceStyle>;
  provinceAdjacency?: Record<string, readonly string[]>;
  mapBaseColor?: string;
  posterBackground?: string;
  provinceTextureUniformSize?: ProvinceTextureUniformSize;
  userAssets?: UserAsset[];

  onSelectProvince?: (province: string) => void;
  onSelectInstance?: (id: string) => void;
  onApplyBackground: (asset: StudioAsset) => void;
  /** Compatibility-only: legacy canvas instances remain readable but cannot be created here. */
  onCreateLandmark?: (asset: StudioAsset) => void;
  /** Compatibility-only: legacy canvas instances remain readable but cannot be created here. */
  onCreateDecoration?: (asset: StudioAsset) => void;
  onApplyProvinceAppearance?: (province: string, appearance: ProvinceAppearance, fill?: string) => void;
  onApplyProvinceThemes?: (themes: Record<string, ImageThemeResult>) => void;
  onPatchProvinceTextureUniformSize?: (next: ProvinceTextureUniformSize) => void;

  onResetProvinceAppearance?: (province: string) => void;
  onAddUserAsset?: (asset: UserAsset) => void;
  onReplaceUserAsset?: (assetId: string, asset: UserAsset) => void;
  onDeleteUserAsset?: (assetId: string) => void;

  onExportResourcePack?: () => void;
  onImportResourcePack?: (file: File) => void;
  /** assetId -> short usage label, e.g. "使用中 · 浙江省" */
  assetUsageById?: Record<string, string>;

}) {
  const systemAssets = useMemo(() => listSystemAssets(), []);
  const uploads = useAssetPanelUploads({
    selectedProvince,
    mapBaseColor,
    posterBackground,
    provinceAdjacency,
    onAddUserAsset,
    onReplaceUserAsset,
    onCreateDecoration,
    onApplyProvinceAppearance,
    onApplyProvinceThemes,
  });

  const allAssets: StudioAsset[] = [...systemAssets, ...userAssets];
  const backgroundAssets = allAssets.filter((asset) => asset.kind === "background");
  const provinceTextures = selectedProvince
    ? allAssets.filter((asset) => asset.kind === "province-texture" && asset.provinceIds.includes(selectedProvince))
    : [];
  const userProvinceTextures = selectedProvince
    ? userAssets.filter((asset) => asset.kind === "province-texture" && asset.provinceIds.includes(selectedProvince))
    : [];
  const libraryTextures = userAssets.filter((asset) => asset.kind === "province-texture");
  const texturedProvinceEntries = Object.entries(provinceStyles).flatMap(([province, style]) => {
    const appearance = style.appearance;
    return appearance && (appearance.kind === "feature" || appearance.kind === "texture")
      ? [[province, appearance.src] as const]
      : [];
  });
  const movableInstances = instances.filter((instance) => instance.kind !== "province-texture");
  const userGlobalAssets = userAssets.filter((asset) => asset.kind !== "province-texture");

  return (
    <div className="asset-panel">
      <PanelHeader title="素材库" meta={`${userAssets.length} 自定义 / ${allAssets.length} 总计`} />

      <AssetPanelProvinceAppearance
        provinces={provinces}
        dataProvinces={dataProvinces}
        selectedProvince={selectedProvince}
        selectedProvinceStyle={selectedProvinceStyle}
        provinceTextures={provinceTextures}
        texturedProvinceEntries={texturedProvinceEntries}
        userProvinceTextureCount={userProvinceTextures.length}
        provinceTextureUniformSize={provinceTextureUniformSize}
        matting={uploads.matting}
        processing={uploads.processing}
        matchingThemes={uploads.matchingThemes}
        onMattingChange={uploads.setMatting}
        onSelectProvince={onSelectProvince}
        onUploadTexture={uploads.handleProvinceTextureUpload}
        onApplyProvinceAppearance={onApplyProvinceAppearance}
        onResetProvinceAppearance={onResetProvinceAppearance}
        onPatchProvinceTextureUniformSize={onPatchProvinceTextureUniformSize}
        onInferThemes={uploads.inferProvinceThemes}
        onNotice={uploads.setMessage}
      />

      <AssetPanelLibrary
        libraryTextures={libraryTextures}
        userGlobalAssets={userGlobalAssets}
        assetUsageById={assetUsageById}
        processing={uploads.processing}
        onSelectProvince={onSelectProvince}
        onApplyProvinceAppearance={onApplyProvinceAppearance}
        onApplyBackground={onApplyBackground}
        onCreateDecoration={onCreateDecoration}
        onApplyMatting={(asset) => { void uploads.applyMatting(asset); }}
        onDeleteUserAsset={onDeleteUserAsset}
        onInferThemes={uploads.inferProvinceThemes}
        onNotice={uploads.setMessage}
      />

      <AssetPanelUploadSections
        canvasMatting={uploads.canvasMatting}
        onCanvasMattingChange={uploads.setCanvasMatting}
        onUploadImage={uploads.handleUpload}
        onUploadSvg={uploads.handleSvgCanvasUpload}
      />

      <PanelSection title="画布背景">
        {backgroundAssets.map((asset) => <button key={asset.id} className="asset-row" type="button" onClick={() => onApplyBackground(asset)}>{asset.label}<span>设为背景</span></button>)}
      </PanelSection>


      {movableInstances.length > 0 && <PanelSection title="已应用元素" meta="地标/装饰">
        {movableInstances.map((instance) => <button className="asset-row" key={instance.id} type="button" onClick={() => onSelectInstance?.(instance.id)}>已应用：{instance.label}</button>)}
      </PanelSection>}

      <AssetPanelResourcePack
        onExportResourcePack={onExportResourcePack}
        onImportResourcePack={onImportResourcePack}
      />
      {uploads.message && <p className="panel-note" role="status">{uploads.message}</p>}
    </div>
  );
}
