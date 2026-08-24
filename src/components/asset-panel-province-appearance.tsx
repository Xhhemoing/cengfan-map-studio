import { Palette, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { StudioAsset } from "../lib/assets";
import {
  createTextureAppearance,
  DEFAULT_TEXTURE_SCALE,
  MAX_TEXTURE_SCALE,
  MIN_TEXTURE_SCALE,
  smartTextureLayout,
  withTextureLayout,
} from "../lib/province-texture";
import type { ProvinceAppearance, ProvinceStyle, ProvinceTextureUniformSize } from "../lib/scene-document";
import { DeferredInput } from "./DeferredInput";
import { FileDropzone } from "./FileDropzone";
import { RangeNumberControl } from "./RangeNumberControl";
import { ActionButton, ActionGroup, CompactButton, PanelSection } from "./StudioUi";
import { loadImageSize } from "./asset-panel-uploads";

type TextureLayoutPatch = Partial<{
  fit: "cover" | "contain";
  scale: number;
  opacity: number;
  overflow: boolean;
  sizingMode: "province" | "natural";
  offsetX: number;
  offsetY: number;
}>;

function shortProvinceName(name: string): string {
  return name.replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/, "");
}

/**
 * Province-first appearance workspace: province picker, texture upload, solid
 * fill, smart background matching and the advanced texture layout controls.
 */
export function AssetPanelProvinceAppearance({
  provinces,
  dataProvinces,
  selectedProvince,
  selectedProvinceStyle,
  provinceTextures,
  texturedProvinceEntries,
  userProvinceTextureCount,
  provinceTextureUniformSize,
  matting,
  processing,
  matchingThemes,
  onMattingChange,
  onSelectProvince,
  onUploadTexture,
  onApplyProvinceAppearance,
  onResetProvinceAppearance,
  onPatchProvinceTextureUniformSize,
  onInferThemes,
  onNotice,
}: {
  provinces: string[];
  dataProvinces: string[];
  selectedProvince: string;
  selectedProvinceStyle?: ProvinceStyle;
  provinceTextures: StudioAsset[];
  texturedProvinceEntries: ReadonlyArray<readonly [string, string]>;
  userProvinceTextureCount: number;
  provinceTextureUniformSize?: ProvinceTextureUniformSize;
  matting: boolean;
  processing: boolean;
  matchingThemes: boolean;
  onMattingChange: (matting: boolean) => void;
  onSelectProvince?: (province: string) => void;
  onUploadTexture: (file: File | null) => void;
  onApplyProvinceAppearance?: (province: string, appearance: ProvinceAppearance, fill?: string) => void;
  onResetProvinceAppearance?: (province: string) => void;
  onPatchProvinceTextureUniformSize?: (next: ProvinceTextureUniformSize) => void;
  onInferThemes: (entries: ReadonlyArray<readonly [string, string]>) => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [provinceColor, setProvinceColor] = useState("#5b8c5a");
  const [provinceFilter, setProvinceFilter] = useState("");
  const dataProvinceSet = useMemo(() => new Set(dataProvinces), [dataProvinces]);
  const activeTexture = selectedProvinceStyle?.appearance?.kind === "feature" || selectedProvinceStyle?.appearance?.kind === "texture"
    ? selectedProvinceStyle.appearance
    : null;
  const normalizedUniformSize: ProvinceTextureUniformSize = {
    enabled: provinceTextureUniformSize?.enabled === true,
    width: Math.max(1, provinceTextureUniformSize?.width ?? 100),
    height: Math.max(1, provinceTextureUniformSize?.height ?? 80),
  };
  const layout = smartTextureLayout({
    fit: activeTexture?.fit,
    scale: activeTexture?.scale,
    opacity: activeTexture?.opacity,
    overflow: activeTexture?.overflow,
    sizingMode: activeTexture?.sizingMode,
    naturalWidth: activeTexture?.naturalWidth,
    naturalHeight: activeTexture?.naturalHeight,
    offsetX: activeTexture?.offsetX,
    offsetY: activeTexture?.offsetY,
  });
  const filteredProvinces = provinces.filter((province) => {
    if (!provinceFilter.trim()) return true;
    const query = provinceFilter.trim().toLowerCase();
    return province.toLowerCase().includes(query) || shortProvinceName(province).toLowerCase().includes(query);
  });

  const applyTextureAsset = (asset: StudioAsset, kind: "feature" | "texture" = asset.source === "system" ? "feature" : "texture") => {
    if (!selectedProvince) return;
    const applyAppearance = (naturalSize: { width: number; height: number } | null = null) => {
      onApplyProvinceAppearance?.(selectedProvince, createTextureAppearance({
        kind,
        assetId: asset.id,
        src: asset.src,
        fit: layout.fit,
        scale: layout.scale,
        opacity: layout.opacity,
        overflow: layout.overflow,
        sizingMode: layout.sizingMode === "natural" ? "natural" : "province",
        naturalWidth: naturalSize?.width,
        naturalHeight: naturalSize?.height,
      }));
      void onInferThemes([[selectedProvince, asset.src]]);
    };
    if (layout.sizingMode !== "natural") {
      applyAppearance();
      return;
    }
    void loadImageSize(asset.src).then(applyAppearance);
  };

  const patchActiveTextureLayout = (patch: TextureLayoutPatch) => {
    if (!selectedProvince || !activeTexture) {
      onNotice("请先为该省份应用贴图，再调整比例");
      return;
    }
    const applyPatch = (naturalSize: { width: number; height: number } | null = null) => {
      const nextPatch = naturalSize
        ? { ...patch, naturalWidth: naturalSize.width, naturalHeight: naturalSize.height }
        : patch;
      onApplyProvinceAppearance?.(selectedProvince, withTextureLayout(activeTexture, nextPatch));
    };
    if (
      patch.sizingMode === "natural"
      && (!activeTexture.naturalWidth || !activeTexture.naturalHeight)
    ) {
      void loadImageSize(activeTexture.src).then(applyPatch);
      return;
    }
    applyPatch();
  };

  return (
    <PanelSection
      title="省份外观"
      meta={selectedProvince ? shortProvinceName(selectedProvince) : "未选择"}
      label="省份素材"
      className="asset-section--province"
      data-asset-province-workspace
    >
      <div className="asset-province-picker">
        <label htmlFor="asset-province-filter">查找
          <input
            id="asset-province-filter"
            type="search"
            placeholder="输入省份名称"
            value={provinceFilter}
            onChange={(event) => setProvinceFilter(event.target.value)}
          />
        </label>
        <label htmlFor="asset-province">省份
          <select id="asset-province" value={selectedProvince} onChange={(event) => onSelectProvince?.(event.target.value)}>
            <option value="">请选择或点击地图</option>
            {filteredProvinces.map((province) => <option key={province} value={province}>{province}{dataProvinceSet.has(province) ? "*" : ""}</option>)}
          </select>
        </label>
      </div>
      {selectedProvince && (
        <>
          <div className="asset-province-primary-actions">
            <FileDropzone
              id="asset-province-upload"
              label="上传贴图"
              hint="PNG / JPG · 点击或拖拽"
              accept="image/*"
              busy={processing}
              busyLabel="处理中..."
              onFile={(file) => onUploadTexture(file)}
            />
            <label className="asset-panel__matting" htmlFor="asset-matting">
              <input id="asset-matting" type="checkbox" checked={matting} onChange={(event) => onMattingChange(event.target.checked)} />
              自动抠图
            </label>
          </div>
          <div className="asset-grid" aria-label="省份贴图选择">
            {provinceTextures.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className="asset-thumb"
                title={asset.label}
                onClick={() => applyTextureAsset(asset)}
              >
                <img src={asset.src} alt={asset.label} />
                <span>{asset.label.split("·").pop()}</span>
              </button>
            ))}
          </div>
          <div className="asset-panel__color-row">
            <label htmlFor="asset-province-color">纯色
              <DeferredInput id="asset-province-color" type="color" value={provinceColor} onCommit={(color) => {
                setProvinceColor(color);
                onApplyProvinceAppearance?.(selectedProvince, { kind: "manual-color", color });
              }} />
            </label>
            <CompactButton variant="ghost" onClick={() => onResetProvinceAppearance?.(selectedProvince)}>系统默认</CompactButton>
          </div>
          <ActionGroup label="省份底色操作" className="asset-panel__theme-actions">
            <CompactButton
              icon={<Palette size={14} aria-hidden />}
              disabled={!activeTexture || matchingThemes}
              aria-label={`智能匹配${selectedProvince}底色`}
              onClick={() => activeTexture && void onInferThemes([[selectedProvince, activeTexture.src]])}
            >
              智能匹配本省底色
            </CompactButton>
            <CompactButton
              icon={<Sparkles size={14} aria-hidden />}
              disabled={texturedProvinceEntries.length === 0 || matchingThemes}
              aria-label="一键智能匹配所有省份底色"
              onClick={() => void onInferThemes(texturedProvinceEntries)}
            >
              {matchingThemes ? "正在分析贴图..." : `一键匹配全部 ${texturedProvinceEntries.length} 省`}
            </CompactButton>
          </ActionGroup>
          <p className="panel-note">从贴图标志色生成低色度浅背景，并自动避开相邻省份近似颜色；手动纯色不会被覆盖。</p>
          <details className="asset-panel__texture-layout asset-panel__advanced" aria-label="省份贴图比例">
            <summary>高级贴图设置</summary>
            <div className="property-panel__advanced-title">高级贴图设置<small>位置 · 比例依据 · 适配方式 · 统一尺寸 · 透明度</small></div>
            <div className="province-inspector__texture-position">
              <span>位置 X {Math.round(layout.offsetX ?? 0)} · Y {Math.round(layout.offsetY ?? 0)}</span>
              <CompactButton icon={<RotateCcw size={14} aria-hidden />} variant="ghost" disabled={!activeTexture} onClick={() => patchActiveTextureLayout({ offsetX: 0, offsetY: 0 })}>恢复居中</CompactButton>
            </div>
            <label htmlFor="asset-texture-sizing">比例依据
              <select id="asset-texture-sizing" value={layout.sizingMode === "natural" ? "natural" : "province"} disabled={!activeTexture} onChange={(event) => patchActiveTextureLayout({ sizingMode: event.target.value as "province" | "natural" })}>
                <option value="province">省份占比</option>
                <option value="natural">原图比例</option>
              </select>
            </label>
            <label htmlFor="asset-texture-fit">适配方式
              <select id="asset-texture-fit" value={layout.fit} disabled={!activeTexture} onChange={(event) => patchActiveTextureLayout({ fit: event.target.value as "cover" | "contain" })}>
                <option value="contain">完整显示（不裁切）</option>
                <option value="cover">铺满省界（可裁切）</option>
              </select>
            </label>
            <RangeNumberControl
              id="asset-texture-scale"
              label="总体大小"
              value={Math.round(layout.scale * 100)}
              min={MIN_TEXTURE_SCALE * 100}
              max={MAX_TEXTURE_SCALE * 100}
              step={5}
              suffix="%"
              disabled={!activeTexture}
              onCommit={(value) => patchActiveTextureLayout({ scale: value / 100 })}
            />
            <label className="boolean-control checkbox-row" htmlFor="asset-texture-uniform-enabled">
              <input
                id="asset-texture-uniform-enabled"
                type="checkbox"
                checked={normalizedUniformSize.enabled}
                onChange={(event) => onPatchProvinceTextureUniformSize?.({
                  ...normalizedUniformSize,
                  enabled: event.target.checked,
                })}
              />
              所有省份贴图统一大小
            </label>
            {normalizedUniformSize.enabled && (
              <div className="asset-panel__uniform-size" aria-label="统一贴图尺寸">
                <RangeNumberControl
                  id="asset-texture-uniform-width"
                  label="统一宽度"
                  value={normalizedUniformSize.width}
                  min={1}
                  max={2000}
                  step={1}
                  onCommit={(width) => onPatchProvinceTextureUniformSize?.({ ...normalizedUniformSize, width })}
                />
                <RangeNumberControl
                  id="asset-texture-uniform-height"
                  label="统一高度"
                  value={normalizedUniformSize.height}
                  min={1}
                  max={2000}
                  step={1}
                  onCommit={(height) => onPatchProvinceTextureUniformSize?.({ ...normalizedUniformSize, height })}
                />
              </div>
            )}
            <label htmlFor="asset-texture-opacity">透明度（%）
              <input
                id="asset-texture-opacity"
                type="number"
                min={0}
                max={100}
                step={5}
                value={Math.round((layout.opacity ?? 1) * 100)}
                disabled={!activeTexture}
                onChange={(event) => patchActiveTextureLayout({ opacity: Number(event.target.value) / 100 })}
              />
            </label>
            <label className="boolean-control checkbox-row" htmlFor="asset-texture-overflow">
              <input
                id="asset-texture-overflow"
                type="checkbox"
                checked={layout.overflow}
                disabled={!activeTexture}
                onChange={(event) => patchActiveTextureLayout({ overflow: event.target.checked })}
              />
              允许图片溢出省界
            </label>
            <ActionButton disabled={!activeTexture} onClick={() => patchActiveTextureLayout({ fit: "contain", scale: DEFAULT_TEXTURE_SCALE, overflow: false })}>
              智能适配（完整且不溢出）
            </ActionButton>

          </details>
          {userProvinceTextureCount > 0 && (
            <p className="panel-note">该省份素材库中有 {userProvinceTextureCount} 个自定义贴图</p>
          )}
        </>
      )}
      {!selectedProvince && <p className="asset-empty-state">点击地图省份，或在上方选择后开始设置。</p>}
      {!selectedProvince && texturedProvinceEntries.length > 0 && (
        <ActionGroup label="省份底色操作" className="asset-panel__theme-actions">
          <CompactButton
            icon={<Sparkles size={14} aria-hidden />}
            disabled={matchingThemes}
            aria-label="一键智能匹配所有省份底色"
            onClick={() => void onInferThemes(texturedProvinceEntries)}
          >
            {matchingThemes ? "正在分析贴图..." : `一键匹配全部 ${texturedProvinceEntries.length} 省`}
          </CompactButton>
        </ActionGroup>
      )}
    </PanelSection>
  );
}
