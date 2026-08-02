import { Download, PackageOpen, Palette, RotateCcw, Scissors, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  createUserAsset,
  listSystemAssets,
  type StudioAsset,
  type UserAsset,
} from "../lib/assets";
import { removeBackground } from "../lib/background-removal";
import {
  extractImageColor,
  extractImageTheme,
  optimizeNeighborThemeColors,
  type ImageThemeResult,
} from "../lib/image-color";

import type { ProvinceAppearance, ProvinceStyle, ProvinceTextureUniformSize } from "../lib/scene-document";
import {
  createTextureAppearance,
  DEFAULT_TEXTURE_SCALE,
  MAX_TEXTURE_SCALE,
  MIN_TEXTURE_SCALE,
  smartTextureLayout,
  withTextureLayout,
} from "../lib/province-texture";
import { FileDropzone } from "./FileDropzone";
import { DeferredInput } from "./DeferredInput";
import { RangeNumberControl } from "./RangeNumberControl";
import { ActionButton, PanelHeader, PanelSection } from "./StudioUi";

interface AssetInstanceSummary {
  id: string;
  assetId: string;
  label: string;
  /** Movable canvas instances only (landmarks/decorations). Province textures are base appearance. */
  kind?: string;
}

function shortProvinceName(name: string): string {
  return name.replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/, "");
}

function loadImageSize(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({
      width: Math.max(1, image.naturalWidth || image.width || 1),
      height: Math.max(1, image.naturalHeight || image.height || 1),
    });
    image.onerror = () => resolve(null);
    image.src = src;
  });
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
  const [message, setMessage] = useState("");

  const [matting, setMatting] = useState(true);
  const [canvasMatting, setCanvasMatting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [matchingThemes, setMatchingThemes] = useState(false);
  const [provinceColor, setProvinceColor] = useState("#5b8c5a");
  const [provinceFilter, setProvinceFilter] = useState("");
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
  const dataProvinceSet = useMemo(() => new Set(dataProvinces), [dataProvinces]);

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
      void inferProvinceThemes([[selectedProvince, asset.src]]);
    };
    if (layout.sizingMode !== "natural") {
      applyAppearance();
      return;
    }
    void loadImageSize(asset.src).then(applyAppearance);
  };

  const patchActiveTextureLayout = (patch: Partial<{ fit: "cover" | "contain"; scale: number; opacity: number; overflow: boolean; sizingMode: "province" | "natural"; offsetX: number; offsetY: number }>) => {
    if (!selectedProvince || !activeTexture) {
      setMessage("请先为该省份应用贴图，再调整比例");
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


  const allAssets: StudioAsset[] = [...systemAssets, ...userAssets];
  const backgroundAssets = allAssets.filter((asset) => asset.kind === "background");
  const filteredProvinces = provinces.filter((province) => {
    if (!provinceFilter.trim()) return true;
    const query = provinceFilter.trim().toLowerCase();
    return province.toLowerCase().includes(query) || shortProvinceName(province).toLowerCase().includes(query);
  });
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

  const confirmDeleteAsset = (asset: UserAsset) => {
    const usage = assetUsageById[asset.id];
    const hint = usage ? `\n${usage}` : "";
    return window.confirm(`确定从素材库删除「${asset.label}」？${hint}\n已应用到地图的外观不会自动清除。`);
  };


  const persistAsset = (asset: UserAsset, successMessage: string) => {
    onAddUserAsset?.(asset);
    setMessage(successMessage);
  };

  const inferProvinceThemes = async (entries: ReadonlyArray<readonly [string, string]>) => {
    setMatchingThemes(true);
    try {
      const settled = await Promise.allSettled(entries.map(async ([province, src]) => [
        province,
        await extractImageTheme(src, { mapBaseColor, posterBackground }),
      ] as const));
      const themes = Object.fromEntries(settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
      if (Object.keys(themes).length === 0) {
        setMessage("未能读取贴图颜色，请检查素材后重试");
        return;
      }
      onApplyProvinceThemes?.(optimizeNeighborThemeColors(themes, provinceAdjacency));
      if (entries.length === 1) {
        setMessage(`已智能匹配${entries[0]?.[0]}底色`);
      } else {
        const failed = entries.length - Object.keys(themes).length;
        setMessage(`已匹配 ${Object.keys(themes).length} 个省份底色${failed ? `，${failed} 个素材读取失败` : ""}`);
      }
    } finally {
      setMatchingThemes(false);
    }
  };

  const handleUpload = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.name.match(/\.(png|jpe?g|gif|webp|svg)$/i)) {
      setMessage("请上传图片文件（png / jpg / webp / svg）");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setMessage("读取图片失败，请重试");
    reader.onload = async () => {
      try {
        const original = String(reader.result || "");
        if (!original) {
          setMessage("图片内容为空，未保存");
          return;
        }
        let src = original;
        let mattingApplied = false;
        if (canvasMatting) {
          try {
            src = await removeBackground(original);
            mattingApplied = true;
          } catch {
            setMessage("自动抠图失败，已使用原图导入画板");
          }
        }
        const asset = createUserAsset({
          label: file.name.replace(/\.[^.]+$/, ""),
          src,
          kind: "decoration",
          mattingApplied,
        });
        onAddUserAsset?.(asset);
        onCreateDecoration?.(asset);
        setMessage(`已导入画布：${asset.label}`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "上传素材失败");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSvgCanvasUpload = (file: File | null) => {
    if (!file) return;
    if (file.type !== "image/svg+xml" && !file.name.match(/\.svg$/i)) {
      setMessage("请选择 SVG 文件");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setMessage("读取 SVG 失败，请重试");
    reader.onload = () => {
      try {
        const src = String(reader.result || "");
        if (!src) {
          setMessage("SVG 内容为空，未导入");
          return;
        }
        const asset = createUserAsset({
          label: file.name.replace(/\.[^.]+$/, ""),
          src,
          kind: "decoration",
        });
        onAddUserAsset?.(asset);
        onCreateDecoration?.(asset);
        setMessage(`已导入画布：${asset.label}`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "导入 SVG 失败");
      }
    };
    reader.readAsDataURL(file);
  };

  const applyMatting = async (asset: UserAsset) => {
    if (asset.mattingApplied) return;
    setProcessing(true);
    try {
      const src = await removeBackground(asset.src);
      onReplaceUserAsset?.(asset.id, { ...asset, src, mattingApplied: true });
      setMessage(`已自动抠图：${asset.label}`);
    } catch {
      setMessage("自动抠图失败，已保留原图");
    } finally {
      setProcessing(false);
    }
  };

  const handleProvinceTextureUpload = (file: File | null) => {
    if (!file) {
      setMessage("未选择文件");
      return;
    }
    if (!selectedProvince) {
      setMessage("请先选择省份，或直接点击地图上的省份");
      return;
    }
    if (!file.type.startsWith("image/") && !file.name.match(/\.(png|jpe?g|gif|webp|svg)$/i)) {
      setMessage("请上传图片文件（png / jpg / webp / svg）");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      setProcessing(false);
      setMessage("读取图片失败，请重试");
    };
    reader.onload = async () => {
      try {
        const original = String(reader.result || "");
        if (!original) {
          setMessage("图片内容为空，未保存");
          return;
        }
        let src = original;
        if (matting) {
          setProcessing(true);
          try {
            src = await removeBackground(original);
          } catch {
            src = original;
            setMessage("自动抠图失败，已使用原图并保存到素材库");
          } finally {
            setProcessing(false);
          }
        }
        const size = await loadImageSize(src);
        let fill: string | null = null;
        try {
          fill = await extractImageColor(src);
        } catch {
          // Keep upload/application working when canvas pixel access is unavailable.
        }
        const asset = createUserAsset({
          label: `${selectedProvince}·${file.name.replace(/\.[^.]+$/, "")}`,
          src,
          kind: "province-texture",
          provinceIds: [selectedProvince],
        });
        persistAsset(asset, `已保存到素材库：${asset.label}`);
        onApplyProvinceAppearance?.(selectedProvince, createTextureAppearance({
          kind: "texture",
          assetId: asset.id,
          src: asset.src,
          fit: "contain",
          scale: DEFAULT_TEXTURE_SCALE,
          overflow: false,
          sizingMode: "natural",
          naturalWidth: size?.width,
          naturalHeight: size?.height,
        }), fill ?? undefined);
        if (fill) setMessage(`已保存到素材库：${asset.label}，省份底色已自动匹配`);
      } catch (error) {
        setProcessing(false);
        setMessage(error instanceof Error ? error.message : "上传省份贴图失败");
      }
    };
    reader.readAsDataURL(file);
  };


  return (
    <div className="asset-panel">
      <PanelHeader title="素材库" meta={`${userAssets.length} 自定义 / ${allAssets.length} 总计`} />

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
                onFile={(file) => handleProvinceTextureUpload(file)}
              />
              <label className="asset-panel__matting" htmlFor="asset-matting">
                <input id="asset-matting" type="checkbox" checked={matting} onChange={(event) => setMatting(event.target.checked)} />
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
              <button type="button" onClick={() => onResetProvinceAppearance?.(selectedProvince)}>系统默认</button>
            </div>
            <div className="asset-panel__theme-actions">
              <button
                type="button"
                disabled={!activeTexture || matchingThemes}
                aria-label={`智能匹配${selectedProvince}底色`}
                onClick={() => activeTexture && void inferProvinceThemes([[selectedProvince, activeTexture.src]])}
              >
                <Palette size={15} aria-hidden /> 智能匹配本省底色
              </button>
              <button
                type="button"
                disabled={texturedProvinceEntries.length === 0 || matchingThemes}
                aria-label="一键智能匹配所有省份底色"
                onClick={() => void inferProvinceThemes(texturedProvinceEntries)}
              >
                <Sparkles size={15} aria-hidden />
                {matchingThemes ? "正在分析贴图..." : `一键匹配全部 ${texturedProvinceEntries.length} 省`}
              </button>
            </div>
            <p className="panel-note">从贴图标志色生成低色度浅背景，并自动避开相邻省份近似颜色；手动纯色不会被覆盖。</p>
            <details className="asset-panel__texture-layout asset-panel__advanced" aria-label="省份贴图比例">
              <summary>高级贴图设置</summary>
              <div className="province-inspector__texture-position">
                <span>位置 X {Math.round(layout.offsetX ?? 0)} · Y {Math.round(layout.offsetY ?? 0)}</span>
                <button type="button" disabled={!activeTexture} title="恢复贴图居中" onClick={() => patchActiveTextureLayout({ offsetX: 0, offsetY: 0 })}>
                  <RotateCcw size={15} /> 恢复居中
                </button>
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
              <label className="asset-panel__matting" htmlFor="asset-texture-uniform-enabled">
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
              <label className="asset-panel__matting" htmlFor="asset-texture-overflow">
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
            {userProvinceTextures.length > 0 && (
              <p className="panel-note">该省份素材库中有 {userProvinceTextures.length} 个自定义贴图</p>
            )}
          </>
        )}
        {!selectedProvince && <p className="asset-empty-state">点击地图省份，或在上方选择后开始设置。</p>}
        {!selectedProvince && texturedProvinceEntries.length > 0 && (
          <div className="asset-panel__theme-actions">
            <button
              type="button"
              disabled={matchingThemes}
              aria-label="一键智能匹配所有省份底色"
              onClick={() => void inferProvinceThemes(texturedProvinceEntries)}
            >
              <Sparkles size={15} aria-hidden />
              {matchingThemes ? "正在分析贴图..." : `一键匹配全部 ${texturedProvinceEntries.length} 省`}
            </button>
          </div>
        )}
      </PanelSection>

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
                    void inferProvinceThemes([[province, asset.src]]);
                  }}
                >
                  <img src={asset.src} alt={asset.label} />
                  <span>{asset.label}</span>
                  {assetUsageById[asset.id] && <em className="asset-usage-badge">{assetUsageById[asset.id]}</em>}
                </button>
                <button
                  type="button"
                  className="asset-thumb-delete"
                  aria-label={`删除素材 ${asset.label}`}
                  title="从素材库删除"
                  onClick={() => {
                    if (!confirmDeleteAsset(asset)) return;
                    onDeleteUserAsset?.(asset.id);
                    setMessage(`已从素材库删除：${asset.label}`);
                  }}
                >
                  <Trash2 size={14} />
                </button>
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
                <button
                  type="button"
                  aria-label={`自动抠图 ${asset.label}`}
                  title="自动抠图"
                  disabled={processing}
                  onClick={() => { void applyMatting(asset); }}
                ><Scissors size={14} /></button>
              )}
              <button
                type="button"
                aria-label={`删除素材 ${asset.label}`}
                title="从素材库删除"
                onClick={() => {
                  if (!confirmDeleteAsset(asset)) return;
                  onDeleteUserAsset?.(asset.id);
                  setMessage(`已从素材库删除：${asset.label}`);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </PanelSection>
      )}

      <PanelSection title="上传画板图片" label="上传素材">
        <FileDropzone
          id="asset-global-upload"
          label="上传图片到画板"
          hint="PNG / JPG / WEBP / GIF · 点击或拖拽"
          accept="image/*"
          onFile={(file) => handleUpload(file)}
        />
        <label className="asset-panel__matting" htmlFor="asset-canvas-matting">
          <input id="asset-canvas-matting" type="checkbox" checked={canvasMatting} onChange={(event) => setCanvasMatting(event.target.checked)} />
          上传时自动抠图
        </label>
      </PanelSection>

      <PanelSection title="SVG 画布元素" label="导入 SVG 到画布">
        <FileDropzone
          id="asset-svg-canvas-upload"
          label="导入 SVG 到画布"
          hint="SVG · 点击或拖拽"
          accept="image/svg+xml,.svg"
          onFile={(file) => handleSvgCanvasUpload(file)}
        />
      </PanelSection>

      <PanelSection title="画布背景">
        {backgroundAssets.map((asset) => <button key={asset.id} className="asset-row" type="button" onClick={() => onApplyBackground(asset)}>{asset.label}<span>设为背景</span></button>)}
      </PanelSection>


      {movableInstances.length > 0 && <PanelSection title="已应用元素" meta="地标/装饰">
        {movableInstances.map((instance) => <button className="asset-row" key={instance.id} type="button" onClick={() => onSelectInstance?.(instance.id)}>已应用：{instance.label}</button>)}
      </PanelSection>}
      <PanelSection title="本地资源包" label="资源包">
        <div className="asset-panel__pack-actions">
          <ActionButton onClick={() => onExportResourcePack?.()}>
            <Download size={16} />导出资源包
          </ActionButton>
          <FileDropzone
            id="asset-pack-import"
            label="导入资源包"
            hint="JSON 资源包 · 点击或拖拽"
            accept="application/json,.json"
            icon={<PackageOpen size={16} aria-hidden />}
            variant="compact"
            onFile={(file) => onImportResourcePack?.(file)}
          />
        </div>
        <p className="panel-note">导出包含本地上传的图片素材与自定义字体，可备份或迁移到其他设备。</p>
      </PanelSection>
      {message && <p className="panel-note" role="status">{message}</p>}
    </div>
  );
}
