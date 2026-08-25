/**
 * 本地资源库（素材 + 字体）：素材去重入库、替换（同步更新画布实例）、删除，
 * 字体上传/删除，资源包导入导出，以及用户字体的 @font-face 注入与预加载。
 * 自 App.tsx 提取（Round 3），行为与提示文案保持一致。
 */
import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import type { UserAsset } from "../lib/assets";
import { removeUserAsset, removeUserFont } from "../lib/catalog-usage";
import { buildFontFaceCss, ensureUserFontsLoaded, type UserFont } from "../lib/fonts";
import { createId } from "../lib/ids";
import { applyTransaction, type ProjectDocument } from "../lib/project-document";
import {
  createResourcePack,
  downloadResourcePack,
  mergeResourcePack,
  parseResourcePack,
} from "../lib/resource-pack";
import { addAssetToLibrary, buildAssetUsageMap } from "../lib/studio-editor-helpers";

export interface UseResourceLibraryOptions {
  project: ProjectDocument;
  userAssets: UserAsset[];
  setUserAssets: Dispatch<SetStateAction<UserAsset[]>>;
  userFonts: UserFont[];
  setUserFonts: Dispatch<SetStateAction<UserFont[]>>;
  commitProject: (next: ProjectDocument) => void;
  setStatusMessage: (message: string) => void;
}

export function useResourceLibrary({
  project,
  userAssets,
  setUserAssets,
  userFonts,
  setUserFonts,
  commitProject,
  setStatusMessage,
}: UseResourceLibraryOptions) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "cengfan-user-fonts";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = buildFontFaceCss(userFonts);
  }, [userFonts]);

  useEffect(() => {
    void ensureUserFontsLoaded(userFonts);
  }, [userFonts]);

  const addUserAsset = (asset: UserAsset) => {
    if (!asset?.src) {
      setStatusMessage("素材内容为空，未保存");
      return;
    }
    setUserAssets((current) => {
      const { assets, message } = addAssetToLibrary(current, asset);
      setStatusMessage(message);
      return assets;
    });
  };

  const replaceUserAsset = (assetId: string, replacement: UserAsset) => {
    setUserAssets((current) => current.map((asset) => asset.id === assetId ? replacement : asset));
    commitProject(
      applyTransaction(project, {
        id: createId(`tx-asset-replace-${assetId}`),
        label: `更新素材：${replacement.label}`,
        source: "manual",
        apply: (current) => ({
          ...current,
          assetElements: current.assetElements.map((element) =>
            element.assetId === assetId ? { ...element, src: replacement.src, label: replacement.label } : element,
          ),
        }),
      }),
    );
    setStatusMessage(`已更新素材：${replacement.label}`);
  };

  const deleteUserAsset = (assetId: string) => {
    const asset = userAssets.find((item) => item.id === assetId);
    setUserAssets((current) => removeUserAsset(current, assetId));
    setStatusMessage(asset ? `已从素材库删除：${asset.label}` : "已从素材库删除素材");
  };

  const deleteUserFont = (fontId: string) => {
    const font = userFonts.find((item) => item.id === fontId);
    setUserFonts((current) => removeUserFont(current, fontId));
    setStatusMessage(font ? `已删除字体：${font.label}` : "已删除字体");
  };

  const uploadUserFont = (font: UserFont) => {
    setUserFonts((current) => [...current, font]);
    setStatusMessage(`已上传字体：${font.label}`);
  };

  const exportResourcePack = () => {
    if (userAssets.length === 0 && userFonts.length === 0) {
      setStatusMessage("本地素材库为空，请先上传图片或字体");
      return;
    }
    const pack = createResourcePack({ assets: userAssets, fonts: userFonts });
    downloadResourcePack(pack);
    setStatusMessage(`已导出资源包：${userAssets.length} 个素材，${userFonts.length} 个字体`);
  };

  const importResourcePack = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { pack, assetCount, fontCount } = parseResourcePack(String(reader.result || ""));
        const merged = mergeResourcePack({
          existingAssets: userAssets,
          existingFonts: userFonts,
          incoming: pack,
        });
        setUserAssets(merged.assets);
        setUserFonts(merged.fonts);
        setStatusMessage(`资源包已导入：新增 ${merged.addedAssets}/${assetCount} 素材，${merged.addedFonts}/${fontCount} 字体`);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "资源包导入失败");
      }
    };
    reader.readAsText(file);
  };

  const assetUsageById = useMemo(() => buildAssetUsageMap(project, userAssets), [project, userAssets]);

  return {
    assetUsageById,
    addUserAsset,
    replaceUserAsset,
    deleteUserAsset,
    deleteUserFont,
    uploadUserFont,
    exportResourcePack,
    importResourcePack,
  };
}
