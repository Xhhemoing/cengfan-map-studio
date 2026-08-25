/**
 * 内容阶段素材面板的入参装配。
 *
 * 面板要的是「当前工程里有哪些素材实例、省份长什么样、点下去改谁」——这些都能从
 * 工程文档和既有动作里算出来,App 只需要把两边交给这里,不必自己摊开三十行字面量。
 */
import type { ContentAssetPanelProps } from "../components/workspaces/ContentLayoutWorkspace";
import { CHINA_PROVINCE_ADJACENCY } from "./map-data";
import type { ProjectDocument } from "./project-document";
import type { SceneSelection } from "./scene-document";

type Handler<K extends keyof ContentAssetPanelProps> = NonNullable<ContentAssetPanelProps[K]>;

export interface ContentAssetPanelPropsOptions {
  project: ProjectDocument;
  provinceNames: string[];
  dataProvinces: string[];
  userAssets: NonNullable<ContentAssetPanelProps["userAssets"]>;
  assetUsageById: NonNullable<ContentAssetPanelProps["assetUsageById"]>;
  createDecoration: Handler<"onCreateDecoration">;
  applyBackgroundAsset: Handler<"onApplyBackground">;
  applyProvinceThemes: Handler<"onApplyProvinceThemes">;
  addUserAsset: Handler<"onAddUserAsset">;
  replaceUserAsset: Handler<"onReplaceUserAsset">;
  deleteUserAsset: Handler<"onDeleteUserAsset">;
  exportResourcePack: Handler<"onExportResourcePack">;
  importResourcePack: Handler<"onImportResourcePack">;
  setSelection: (selection: SceneSelection) => void;
  patchScene: (target: SceneSelection, patch: Record<string, unknown>) => void;
  reportStatus: (message: string) => void;
}

export function createContentAssetPanelProps(options: ContentAssetPanelPropsOptions): ContentAssetPanelProps {
  const { project, setSelection, patchScene, reportStatus } = options;
  return {
    instances: project.assetElements
      .filter((element) => element.kind !== "province-texture")
      .map((element) => ({ id: element.id, assetId: element.assetId, label: element.label, kind: element.kind })),
    provinces: options.provinceNames,
    dataProvinces: options.dataProvinces,
    provinceStyles: project.map.provinceStyles,
    provinceAdjacency: CHINA_PROVINCE_ADJACENCY,
    mapBaseColor: project.map.landColor,
    posterBackground: project.canvas.backgroundColor,
    userAssets: options.userAssets,
    assetUsageById: options.assetUsageById,
    onCreateDecoration: options.createDecoration,
    onApplyBackground: options.applyBackgroundAsset,
    onSelectInstance: (id: string) => setSelection({ type: "asset", id }),
    onPatchProvinceTextureUniformSize: ((next) =>
      patchScene({ type: "map" }, { provinceTextureUniformSize: next })) satisfies Handler<"onPatchProvinceTextureUniformSize">,
    onApplyProvinceAppearance: ((province, appearance, fill) => {
      setSelection({ type: "province", province });
      patchScene({ type: "province", province }, { appearance, ...(fill ? { fill } : {}) });
      reportStatus(`已应用到地图：${province}`);
    }) satisfies Handler<"onApplyProvinceAppearance">,
    onApplyProvinceThemes: options.applyProvinceThemes,
    onResetProvinceAppearance: (province: string) => {
      setSelection({ type: "province", province });
      patchScene({ type: "province", province }, { appearance: undefined, fill: undefined, textureSrc: undefined });
      reportStatus(`已恢复系统默认：${province}`);
    },
    onAddUserAsset: options.addUserAsset,
    onReplaceUserAsset: options.replaceUserAsset,
    onDeleteUserAsset: options.deleteUserAsset,
    onExportResourcePack: options.exportResourcePack,
    onImportResourcePack: options.importResourcePack,
  };
}
