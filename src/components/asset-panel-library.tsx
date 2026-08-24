import { Scissors, Trash2 } from "lucide-react";
import type { StudioAsset, UserAsset } from "../lib/assets";
import { createTextureAppearance, DEFAULT_TEXTURE_SCALE } from "../lib/province-texture";
import type { ProvinceAppearance } from "../lib/scene-document";
import { IconButton, PanelSection } from "./StudioUi";

function confirmDeleteAsset(asset: UserAsset, usage?: string): boolean {
  const hint = usage ? `\n${usage}` : "";
  return window.confirm(`确定从素材库删除「${asset.label}」？${hint}\n已应用到地图的外观不会自动清除。`);
}

/**
 * Saved user assets: province textures that can be re-applied, and the general
 * uploads that go to the canvas or the poster background. Both lists surface
 * the usage badge and the delete affordance.
 */
export function AssetPanelLibrary({
  libraryTextures,
  userGlobalAssets,
  assetUsageById,
  processing,
  onSelectProvince,
  onApplyProvinceAppearance,
  onApplyBackground,
  onCreateDecoration,
  onApplyMatting,
  onDeleteUserAsset,
  onInferThemes,
  onNotice,
}: {
  libraryTextures: UserAsset[];
  userGlobalAssets: UserAsset[];
  assetUsageById: Record<string, string>;
  processing: boolean;
  onSelectProvince?: (province: string) => void;
  onApplyProvinceAppearance?: (province: string, appearance: ProvinceAppearance, fill?: string) => void;
  onApplyBackground: (asset: StudioAsset) => void;
  onCreateDecoration?: (asset: StudioAsset) => void;
  onApplyMatting: (asset: UserAsset) => void;
  onDeleteUserAsset?: (assetId: string) => void;
  onInferThemes: (entries: ReadonlyArray<readonly [string, string]>) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const deleteAsset = (asset: UserAsset) => {
    if (!confirmDeleteAsset(asset, assetUsageById[asset.id])) return;
    onDeleteUserAsset?.(asset.id);
    onNotice(`已从素材库删除：${asset.label}`);
  };

  return (
    <>
      {libraryTextures.length > 0 && (
        <PanelSection title="已保存省份贴图" meta={libraryTextures.length}>
          <div className="asset-grid asset-grid--manageable" aria-label="素材库省份贴图">
            {libraryTextures.map((asset) => (
              <div key={asset.id} className="asset-thumb-wrap">
                <button
                  type="button"
                  className="asset-thumb"
                  title={asset.label}
                  onClick={() => {
                    const province = asset.provinceIds[0];
                    if (!province) return;
                    onSelectProvince?.(province);
                    onApplyProvinceAppearance?.(province, createTextureAppearance({
                      kind: "texture",
                      assetId: asset.id,
                      src: asset.src,
                      fit: "contain",
                      scale: DEFAULT_TEXTURE_SCALE,
                      overflow: false,
                    }));
                    void onInferThemes([[province, asset.src]]);
                  }}
                >
                  <img src={asset.src} alt={asset.label} />
                  <span>{asset.label}</span>
                  {assetUsageById[asset.id] && <em className="asset-usage-badge">{assetUsageById[asset.id]}</em>}
                </button>
                <IconButton
                  className="asset-thumb-delete"
                  label={`删除素材 ${asset.label}`}
                  variant="danger"
                  onClick={() => deleteAsset(asset)}
                  icon={<Trash2 size={14} aria-hidden />}
                />
              </div>
            ))}
          </div>
        </PanelSection>
      )}

      {userGlobalAssets.length > 0 && (
        <PanelSection title="已上传通用素材" meta={userGlobalAssets.length}>
          {userGlobalAssets.map((asset) => (
            <div key={asset.id} className="asset-row asset-row--manage">
              <button
                type="button"
                className="asset-row__main"
                onClick={() => {
                  if (asset.kind === "background") onApplyBackground(asset);
                  if (asset.kind === "decoration") onCreateDecoration?.(asset);
                }}
              >
                <span>{asset.label}</span>
                <span>
                  {asset.kind === "background"
                    ? "设为背景"
                    : asset.kind === "decoration"
                      ? "添加到画布"
                      : "历史资源（仅保留兼容）"}
                  {assetUsageById[asset.id] ? ` · ${assetUsageById[asset.id]}` : ""}
                </span>
              </button>
              {asset.kind === "decoration" && !asset.mattingApplied && !asset.src.startsWith("data:image/svg+xml") && (
                <IconButton
                  label={`自动抠图 ${asset.label}`}
                  icon={<Scissors size={14} aria-hidden />}
                  variant="ghost"
                  disabled={processing}
                  onClick={() => onApplyMatting(asset)}
                />
              )}
              <IconButton
                label={`删除素材 ${asset.label}`}
                icon={<Trash2 size={14} aria-hidden />}
                variant="danger"
                onClick={() => deleteAsset(asset)}
              />
            </div>
          ))}
        </PanelSection>
      )}
    </>
  );
}
