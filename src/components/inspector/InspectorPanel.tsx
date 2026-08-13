import type { ProjectDocument } from "../../lib/project-document";
import type { GuestPanelSettings, SceneSelection } from "../../lib/scene-document";
import type { UserAsset } from "../../lib/assets";
import type { UserFont } from "../../lib/fonts";
import type { TypographyTarget } from "../../lib/typography";
import { CanvasInspector } from "./CanvasInspector";
import { CardsInspector } from "./CardsInspector";
import { GuestsInspector } from "./GuestsInspector";
import { MapInspector } from "./MapInspector";
import { TextInspector } from "./TextInspector";
import { AssetInspector } from "./AssetInspector";
import { ProvinceInspector } from "./ProvinceInspector";
import { TypographyPanel } from "../TypographyPanel";
import type { ReactNode } from "react";
import { Settings2 } from "lucide-react";
import { CompactButton } from "../StudioUi";

/** 全局设置分区（与 GlobalSettingsScreen.sections 保持一致）。 */
export type GlobalSettingsSectionId = "canvas" | "map" | "cards" | "guests" | "typography" | "advanced";

const DEFAULT_GUESTS: GuestPanelSettings = {
  title: "特邀嘉宾 · 老师名单",
  x: 48,
  y: 780,
  width: 280,
  padding: 14,
  background: "#ffffff",
  opacity: 0.92,
  textColor: "#1c3154",
  fontSize: 13,
  visibility: true,
  people: [],
};

export function InspectorPanel({ project, selection, userFonts = [], provinces = [], onPatch, onReset, onDeleteText, onDeleteAsset, onDuplicateAsset, onLayerChange, onAddUserAsset, onOpenGlobalSettings, onApplyFont, onUploadFont, onDeleteUserFont, onOpenDisplayFrame }: {
  project: ProjectDocument;
  selection: SceneSelection;
  userFonts?: UserFont[];
  provinces?: readonly string[];
  onPatch: (target: SceneSelection, patch: Record<string, unknown>) => void;
  onReset: (target: Extract<SceneSelection, { type: "canvas" | "map" | "cards" }>) => void;
  onDeleteText?: (id: string) => void;
  onDeleteAsset?: (id: string) => void;
  onDuplicateAsset?: (id: string) => void;
  onLayerChange?: (id: string, delta: -1 | 1) => void;
  onAddUserAsset?: (asset: UserAsset) => void;
  /** 打开全屏全局设置（各面板完整控件已内联到右侧栏，此入口用于批量/高级配置）。 */
  onOpenGlobalSettings?: (section: GlobalSettingsSectionId) => void;
  onApplyFont?: (target: TypographyTarget, fontId: string, applyToAll: boolean) => void;
  onUploadFont?: (font: UserFont) => void;
  onDeleteUserFont?: (fontId: string) => void;
  /** 打开自定义展示框编辑器（展示框 stage）。 */
  onOpenDisplayFrame?: () => void;

}) {
  const guests = project.guests ?? DEFAULT_GUESTS;

  let panel: ReactNode;
  if (selection.type === "canvas") {
    panel = <CanvasInspector canvas={project.canvas} onPatch={(patch) => onPatch(selection, patch)} onReset={() => onReset(selection)} />;
  } else if (selection.type === "map") {
    panel = <MapInspector map={project.map} onPatch={(patch) => onPatch(selection, patch)} onReset={() => onReset(selection)} />;
  } else if (selection.type === "province") {
    panel = <ProvinceInspector
      province={selection.province}
      style={project.map.provinceStyles?.[selection.province]}
      onPatch={(patch) => onPatch(selection, patch)}
      onAddUserAsset={onAddUserAsset}
      uniformSize={project.map.provinceTextureUniformSize}
      onPatchUniformSize={(uniformSize) => onPatch({ type: "map" }, { provinceTextureUniformSize: uniformSize })}

    />;
  } else if (selection.type === "cards") {
    panel = <CardsInspector
      cards={project.cards}
      userFonts={userFonts}
      onPatch={(patch) => onPatch(selection, patch)}
      onReset={() => onReset(selection)}
      onOpenDisplayFrame={onOpenDisplayFrame}
    />;
  } else if (selection.type === "guests") {
    panel = <GuestsInspector guests={guests} onPatch={(patch) => onPatch(selection, patch)} />;
  } else if (selection.type === "text") {
    const text = project.textElements.find((element) => element.id === selection.id);
    panel = text
      ? <TextInspector text={text} userFonts={userFonts} onPatch={(patch) => onPatch(selection, patch)} onDelete={() => onDeleteText?.(text.id)} />
      : <section className="property-panel"><p>文本已删除。</p></section>;
  } else if (selection.type === "asset") {
    const asset = project.assetElements.find((element) => element.id === selection.id);
    panel = asset ? (
      <AssetInspector
        asset={asset}
        onPatch={(patch) => onPatch(selection, patch)}
        onDelete={() => onDeleteAsset?.(asset.id)}
        onDuplicate={() => onDuplicateAsset?.(asset.id)}
        onLayerChange={(delta) => onLayerChange?.(asset.id, delta)}
      />
    ) : <section className="property-panel"><h2>素材属性</h2><p>素材已删除。</p></section>;
  } else {
    panel = <section className="property-panel"><p>请选择画布元素进行编辑。</p></section>;
  }

  return (
    <>
      {onOpenGlobalSettings && (
        <CompactButton
          className="inspector-global-entry"
          icon={<Settings2 size={14} aria-hidden />}
          aria-label="打开全局设置"
          onClick={() => onOpenGlobalSettings("canvas")}
        >全局设置（画布 · 地图 · 字体排版）</CompactButton>
      )}
      {panel}
      {onApplyFont && (
        <details className="inspector-global-typography">
          <summary>字体排版</summary>
          <TypographyPanel
            project={project}
            provinces={provinces}
            userFonts={userFonts}
            onApplyFont={onApplyFont}
            onPatch={onPatch}
            onUploadFont={onUploadFont}
            onDeleteUserFont={onDeleteUserFont}
          />
        </details>
      )}
    </>
  );
}
