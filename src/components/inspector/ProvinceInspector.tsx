import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { createUserAsset, listSystemAssets, type UserAsset } from "../../lib/assets";
import { removeBackground } from "../../lib/background-removal";
import { extractImageColor } from "../../lib/image-color";
import type { ProvinceAppearance, ProvinceStyle, ProvinceTextureUniformSize } from "../../lib/scene-document";
import {
  createTextureAppearance,
  DEFAULT_TEXTURE_SCALE,
  MAX_TEXTURE_SCALE,
  MIN_TEXTURE_SCALE,
  smartTextureLayout,
  withTextureLayout,
} from "../../lib/province-texture";
import { FileDropzone } from "../FileDropzone";
import { DeferredInput } from "../DeferredInput";
import { RangeNumberControl } from "../RangeNumberControl";
import { CompactButton, InspectorHeader } from "../StudioUi";

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

export function ProvinceInspector({ province, style, onPatch, onAddUserAsset, uniformSize, onPatchUniformSize }: {
  province: string;
  style?: ProvinceStyle;
  onPatch: (patch: Partial<ProvinceStyle>) => void;
  onAddUserAsset?: (asset: UserAsset) => void;
  uniformSize?: ProvinceTextureUniformSize;
  onPatchUniformSize?: (next: ProvinceTextureUniformSize) => void;

}) {
  const features = useMemo(
    () => listSystemAssets().filter((asset) => asset.kind === "province-texture" && asset.provinceIds.includes(province)),
    [province],
  );
  const appearance = style?.appearance;
  const normalizedUniformSize: ProvinceTextureUniformSize = {
    enabled: uniformSize?.enabled === true,
    width: Math.max(1, uniformSize?.width ?? 100),
    height: Math.max(1, uniformSize?.height ?? 80),
  };
  const color = appearance?.kind === "manual-color" ? appearance.color : style?.fill ?? "#215d75";
  const visible = style?.visible !== false;
  const [matting, setMatting] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const uploadTexture = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => {
      setProcessing(false);
      setMessage("读取图片失败，请重试");
    };
    reader.onload = async () => {
      try {
        const original = String(reader.result ?? "");
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
          // Color extraction is an enhancement; the texture should still be applied.
        }
        const asset = createUserAsset({
          label: `${province}·${file.name.replace(/\.[^.]+$/, "")}`,
          src,
          kind: "province-texture",
          provinceIds: [province],
        });
        onAddUserAsset?.(asset);
        onPatch({
          ...(fill ? { fill } : {}),
          appearance: createTextureAppearance({
            kind: "texture",
            assetId: asset.id,
            src: asset.src,
            fit: "contain",
            scale: DEFAULT_TEXTURE_SCALE,
            overflow: false,
            sizingMode: "natural",
            naturalWidth: size?.width,
            naturalHeight: size?.height,
          }),
        });
        setMessage(`已保存并应用到地图：${asset.label}${fill ? "，省份底色已自动匹配" : ""}`);
      } catch (error) {
        setProcessing(false);
        setMessage(error instanceof Error ? error.message : "上传省份贴图失败");
      }
    };
    reader.readAsDataURL(file);
  };

  const patchTextureLayout = (
    appearance: Exclude<ProvinceAppearance, { kind: "manual-color" }>,
    patch: Parameters<typeof withTextureLayout>[1],
  ) => {
    const applyPatch = (size: { width: number; height: number } | null = null) => onPatch({
      appearance: withTextureLayout(appearance, size ? {
        ...patch,
        naturalWidth: size.width,
        naturalHeight: size.height,
      } : patch),
    });
    if (
      patch.sizingMode === "natural"
      && (!appearance.naturalWidth || !appearance.naturalHeight)
    ) {
      void loadImageSize(appearance.src).then(applyPatch);
      return;
    }
    applyPatch();
  };

  return (
    <section className="property-panel province-inspector">
      <InspectorHeader title={province} meta={appearance && appearance.kind !== "manual-color" ? "贴图" : "纯色"} />
      <div className="province-inspector__primary">
      <label htmlFor="province-color">底色
        <DeferredInput id="province-color" type="color" value={color} onCommit={(next) => onPatch({
          appearance: { kind: "manual-color", color: next },
        })} />
      </label>
      {features.length > 0 && <div className="province-inspector__features">
        <strong>地方特色</strong>
        {features.map((asset) => <CompactButton key={asset.id} onClick={() => onPatch({
          appearance: createTextureAppearance({ kind: "feature", assetId: asset.id, src: asset.src, fit: "contain", scale: DEFAULT_TEXTURE_SCALE, overflow: false, sizingMode: "province" }),
        })}>{asset.label}</CompactButton>)}
      </div>}
      <FileDropzone
        id="province-texture-upload"
        label="上传贴图"
        hint="PNG / JPG · 点击或拖拽"
        accept="image/*"
        busy={processing}
        busyLabel="处理中..."
        onFile={(file) => uploadTexture(file)}
      />
      <label className="asset-panel__matting" htmlFor="province-matting">
        <input id="province-matting" type="checkbox" checked={matting} onChange={(event) => setMatting(event.target.checked)} />
        自动抠图
      </label>
      </div>

      {appearance && appearance.kind !== "manual-color" && (() => {
        const layout = smartTextureLayout({
          fit: appearance.fit,
          scale: appearance.scale,
          opacity: appearance.opacity,
          overflow: appearance.overflow,
          sizingMode: appearance.sizingMode,
          naturalWidth: appearance.naturalWidth,
          naturalHeight: appearance.naturalHeight,
          customWidth: appearance.customWidth,
          customHeight: appearance.customHeight,
          offsetX: appearance.offsetX,
          offsetY: appearance.offsetY,
        });
        return (
          <details className="province-inspector__texture-layout province-inspector__advanced" aria-label="贴图比例调节">
            <summary>高级贴图设置</summary>
            <div className="province-inspector__texture-position">
              <span>位置 X {Math.round(layout.offsetX ?? 0)} · Y {Math.round(layout.offsetY ?? 0)}</span>
              <CompactButton icon={<RotateCcw size={14} aria-hidden />} variant="ghost" onClick={() => onPatch({
                appearance: withTextureLayout(appearance, { offsetX: 0, offsetY: 0 }),
              })}>恢复居中</CompactButton>
            </div>
            <label htmlFor="province-texture-sizing">比例依据
              <select id="province-texture-sizing" value={layout.sizingMode} onChange={(event) => patchTextureLayout(
                appearance,
                { sizingMode: event.target.value as "province" | "natural" },
              )}>
                <option value="province">省份占比</option>
                <option value="natural">原图比例</option>
              </select>
            </label>
            <label htmlFor="province-texture-fit">适配方式
              <select id="province-texture-fit" value={layout.fit} onChange={(event) => onPatch({
                appearance: withTextureLayout(appearance, { fit: event.target.value as "cover" | "contain" }),
              })}>
                <option value="contain">完整显示（不裁切）</option>
                <option value="cover">铺满省界（可裁切）</option>
              </select>
            </label>
            <RangeNumberControl
              id="province-texture-scale"
              label="总体大小"
              value={Math.round(layout.scale * 100)}
              min={MIN_TEXTURE_SCALE * 100}
              max={MAX_TEXTURE_SCALE * 100}
              step={5}
              suffix="%"
              onCommit={(value) => onPatch({
                appearance: withTextureLayout(appearance, { scale: value / 100 }),
              })}
            />
            <label className="asset-panel__matting" htmlFor="province-texture-uniform-enabled">
              <input
                id="province-texture-uniform-enabled"
                type="checkbox"
                checked={normalizedUniformSize.enabled}
                onChange={(event) => onPatchUniformSize?.({
                  ...normalizedUniformSize,
                  enabled: event.target.checked,
                })}
              />
              所有省份贴图统一大小
            </label>
            {normalizedUniformSize.enabled && (
              <div className="province-inspector__uniform-size" aria-label="统一贴图尺寸">
                <RangeNumberControl
                  id="province-texture-uniform-width"
                  label="统一宽度"
                  value={normalizedUniformSize.width}
                  min={1}
                  max={2000}
                  step={1}
                  onCommit={(width) => onPatchUniformSize?.({ ...normalizedUniformSize, width })}
                />
                <RangeNumberControl
                  id="province-texture-uniform-height"
                  label="统一高度"
                  value={normalizedUniformSize.height}
                  min={1}
                  max={2000}
                  step={1}
                  onCommit={(height) => onPatchUniformSize?.({ ...normalizedUniformSize, height })}
                />
              </div>
            )}
            <label htmlFor="province-texture-opacity">透明度（%）
              <DeferredInput
                id="province-texture-opacity"
                type="number"
                min={0}
                max={100}
                step={5}
                value={Math.round((layout.opacity ?? 1) * 100)}
                onCommit={(draft) => {
                  const opacity = Number(draft);
                  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) return;
                  onPatch({ appearance: withTextureLayout(appearance, { opacity: opacity / 100 }) });
                }}
              />
            </label>
            <label className="asset-panel__matting" htmlFor="province-texture-overflow">
              <input
                id="province-texture-overflow"
                type="checkbox"
                checked={layout.overflow}
                onChange={(event) => onPatch({
                  appearance: withTextureLayout(appearance, { overflow: event.target.checked }),
                })}
              />
              允许图片溢出省界
            </label>
            <CompactButton icon={<RotateCcw size={14} aria-hidden />} onClick={() => patchTextureLayout(appearance, {
              fit: "contain",
              scale: DEFAULT_TEXTURE_SCALE,
              overflow: false,
              sizingMode: "natural",
            })}>智能适配（完整且不溢出）</CompactButton>

          </details>
        );
      })()}
      <label htmlFor="province-visible">显示省份
        <input id="province-visible" type="checkbox" checked={visible} onChange={(event) => onPatch({ visible: event.target.checked })} />
      </label>
      <CompactButton variant="ghost" icon={<RotateCcw size={14} aria-hidden />} onClick={() => onPatch({ appearance: undefined, fill: undefined, textureSrc: undefined })}>跟随整体地图</CompactButton>
      {message && <p className="panel-note" role="status">{message}</p>}
    </section>
  );
}
