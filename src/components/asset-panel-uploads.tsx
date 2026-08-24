import { useState } from "react";
import { createUserAsset, type UserAsset } from "../lib/assets";
import { removeBackground } from "../lib/background-removal";
import { extractImageColor, extractImageTheme, optimizeNeighborThemeColors, type ImageThemeResult } from "../lib/image-color";
import { createTextureAppearance, DEFAULT_TEXTURE_SCALE } from "../lib/province-texture";
import type { ProvinceAppearance } from "../lib/scene-document";

export function loadImageSize(src: string): Promise<{ width: number; height: number } | null> {
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

function isSupportedImage(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

function assetLabel(file: File): string {
  return file.name.replace(/\.[^.]+$/, "");
}

/**
 * File ingest, matting and theme inference for the asset panel. Keeps the
 * asynchronous FileReader / canvas work out of the presentational sections.
 */
export function useAssetPanelUploads({
  selectedProvince,
  mapBaseColor,
  posterBackground,
  provinceAdjacency,
  onAddUserAsset,
  onReplaceUserAsset,
  onCreateDecoration,
  onApplyProvinceAppearance,
  onApplyProvinceThemes,
}: {
  selectedProvince: string;
  mapBaseColor: string;
  posterBackground: string;
  provinceAdjacency: Record<string, readonly string[]>;
  onAddUserAsset?: (asset: UserAsset) => void;
  onReplaceUserAsset?: (assetId: string, asset: UserAsset) => void;
  onCreateDecoration?: (asset: UserAsset) => void;
  onApplyProvinceAppearance?: (province: string, appearance: ProvinceAppearance, fill?: string) => void;
  onApplyProvinceThemes?: (themes: Record<string, ImageThemeResult>) => void;
}) {
  const [message, setMessage] = useState("");
  const [matting, setMatting] = useState(true);
  const [canvasMatting, setCanvasMatting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [matchingThemes, setMatchingThemes] = useState(false);

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
    if (!isSupportedImage(file)) {
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
          label: assetLabel(file),
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
          label: assetLabel(file),
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
    if (!isSupportedImage(file)) {
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
          label: `${selectedProvince}·${assetLabel(file)}`,
          src,
          kind: "province-texture",
          provinceIds: [selectedProvince],
        });
        onAddUserAsset?.(asset);
        setMessage(`已保存到素材库：${asset.label}`);
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

  return {
    message,
    setMessage,
    matting,
    setMatting,
    canvasMatting,
    setCanvasMatting,
    processing,
    matchingThemes,
    inferProvinceThemes,
    handleUpload,
    handleSvgCanvasUpload,
    handleProvinceTextureUpload,
    applyMatting,
  };
}
