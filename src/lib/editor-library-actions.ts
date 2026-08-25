import type { Dispatch, SetStateAction } from "react";
import type { UserAsset } from "./assets";
import { replaceAssetElementSourceTransaction } from "./canvas-edit-transactions";
import { removeUserAsset, removeUserFont } from "./catalog-usage";
import type { UserFont } from "./fonts";
import { applyTransaction, type ProjectDocument } from "./project-document";
import { downloadResourcePack } from "./resource-pack";
import {
  addAssetToLibrary,
  describeAssetRemoval,
  describeFontRemoval,
  EMPTY_ASSET_MESSAGE,
  mergeImportedResourcePack,
  prepareResourcePackExport,
  replaceAssetInLibrary,
} from "./resource-library";

/**
 * 素材库与字体库的编辑动作。每一条都要给用户一句交代:库里发生了什么,只有库自己
 * 知道(合并了几条、重名怎么处理、删掉的素材画布上还在不在),所以文案统一由
 * `resource-library` / `catalog-usage` 出,这里只负责落到 state 并播报。
 */

export interface EditorLibraryActionDeps {
  project: ProjectDocument;
  userAssets: UserAsset[];
  userFonts: UserFont[];
  setUserAssets: Dispatch<SetStateAction<UserAsset[]>>;
  setUserFonts: Dispatch<SetStateAction<UserFont[]>>;
  setStatusMessage(message: string): void;
  commitProject(next: ProjectDocument): void;
}

export function createEditorLibraryActions(deps: EditorLibraryActionDeps) {
  const { setUserAssets, setUserFonts, setStatusMessage } = deps;

  return {
    /** 空 src 的素材进库只会变成画布上的一个洞,拦在入口并说明原因。 */
    addUserAsset: (asset: UserAsset) => {
      if (!asset?.src) {
        setStatusMessage(EMPTY_ASSET_MESSAGE);
        return;
      }
      setUserAssets((current) => {
        const outcome = addAssetToLibrary(current, asset);
        setStatusMessage(outcome.message);
        return outcome.assets;
      });
    },

    /** 换图要同时改库与画布上引用它的实例,否则画布还挂着旧图。 */
    replaceUserAsset: (assetId: string, replacement: UserAsset) => {
      setUserAssets((current) => replaceAssetInLibrary(current, assetId, replacement));
      deps.commitProject(applyTransaction(deps.project, replaceAssetElementSourceTransaction(assetId, replacement)));
      setStatusMessage(`已更新素材：${replacement.label}`);
    },

    /** 先算文案再删:删完就看不出这条素材原本被画布用在哪儿了。 */
    deleteUserAsset: (assetId: string) => {
      const message = describeAssetRemoval(deps.userAssets, assetId);
      setUserAssets((current) => removeUserAsset(current, assetId));
      setStatusMessage(message);
    },

    uploadUserFont: (font: UserFont) => {
      setUserFonts((current) => [...current, font]);
      setStatusMessage(`已上传字体：${font.label}`);
    },

    deleteUserFont: (fontId: string) => {
      const message = describeFontRemoval(deps.userFonts, fontId);
      setUserFonts((current) => removeUserFont(current, fontId));
      setStatusMessage(message);
    },

    exportResourcePack: () => {
      const outcome = prepareResourcePackExport({ assets: deps.userAssets, fonts: deps.userFonts });
      if (outcome.pack) downloadResourcePack(outcome.pack);
      setStatusMessage(outcome.message);
    },

    /** 读文件是异步的:合并结果与文案都在 onload 里才知道。 */
    importResourcePack: (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const outcome = mergeImportedResourcePack({
          text: String(reader.result || ""),
          existingAssets: deps.userAssets,
          existingFonts: deps.userFonts,
        });
        if (outcome.merged) {
          setUserAssets(outcome.merged.assets);
          setUserFonts(outcome.merged.fonts);
        }
        setStatusMessage(outcome.message);
      };
      reader.readAsText(file);
    },
  };
}
