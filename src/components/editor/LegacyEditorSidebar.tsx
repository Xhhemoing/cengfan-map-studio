import { Download, ImageDown, PackageOpen, Plus, Save } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { dataViews, provinceNames, type ActivePanel } from "../../lib/app-constants";
import type { UserAsset } from "../../lib/assets";
import { STYLE_LAYER_TARGETS, type StyleLayerTarget } from "../../lib/catalog-usage";
import type { LocalWorkspaceOverwriteState } from "../../lib/incremental-workspace-sync";
import { CHINA_PROVINCE_ADJACENCY } from "../../lib/map-data";
import type { DataViewId, ProvinceSummary } from "../../lib/project-data";
import type { ProjectDocument } from "../../lib/project-document";
import { buildAssetUsageLabels } from "../../lib/resource-library";
import type { ProvinceAppearance, SceneSelection } from "../../lib/scene-document";
import { createSystemTemplate, type TemplateDocument } from "../../lib/template-document";
import type { CustomTemplateRecord } from "../../lib/template-store";
import type { UsePosterExportResult } from "../../lib/usePosterExport";
import { listStudentWarnings } from "../../lib/workflow-progress";
import { AssetPanel } from "../AssetPanel";
import { DataWorkspace } from "../DataWorkspace";
import { MapInspector } from "../inspector/MapInspector";
import { ActionGroup, CompactButton, SegmentedControl } from "../StudioUi";

type AssetPanelProps = ComponentProps<typeof AssetPanel>;
type MapInspectorProps = ComponentProps<typeof MapInspector>;

const SYSTEM_TEMPLATE_IDS = ["original", "cartoon", "grain", "q", "scenery"] as const;

export interface LegacyEditorSidebarProps {
  assistantRail: ReactNode;
  activePanel: ActivePanel;
  project: ProjectDocument;
  dataView: DataViewId;
  summary: ProvinceSummary[];
  selection: SceneSelection;
  userAssets: UserAsset[];
  assetUsageById: ReturnType<typeof buildAssetUsageLabels>;
  customTemplates: CustomTemplateRecord[];
  resolvedTemplate: TemplateDocument;
  exportWarnings: ReturnType<typeof listStudentWarnings>;
  dataWorkspaceProps: ComponentProps<typeof DataWorkspace>;
  posterExport: UsePosterExportResult;
  syncStatus: LocalWorkspaceOverwriteState["status"];
  onChangeDataView: (view: DataViewId) => void;
  onPatchScene: (target: SceneSelection, patch: Record<string, unknown>) => void;
  onResetScene: (target: Extract<SceneSelection, { type: "canvas" | "map" | "cards" }>) => void;
  onSetSelection: (selection: SceneSelection) => void;
  onSetActivePanel: (panel: ActivePanel) => void;
  onReportStatus: (message: string) => void;
  onApplySystemTemplate: (templateId: (typeof SYSTEM_TEMPLATE_IDS)[number]) => void;
  onApplyCustomTemplate: (record: CustomTemplateRecord) => void;
  onSaveTemplate: () => void;
  onApplyBackground: AssetPanelProps["onApplyBackground"];
  onCreateLandmark: AssetPanelProps["onCreateLandmark"];
  onCreateDecoration: AssetPanelProps["onCreateDecoration"];
  onApplyProvinceThemes: AssetPanelProps["onApplyProvinceThemes"];
  onAddUserAsset: AssetPanelProps["onAddUserAsset"];
  onReplaceUserAsset: AssetPanelProps["onReplaceUserAsset"];
  onDeleteUserAsset: AssetPanelProps["onDeleteUserAsset"];
  onExportResourcePack: AssetPanelProps["onExportResourcePack"];
  onImportResourcePack: AssetPanelProps["onImportResourcePack"];
  onSaveLocal: () => void;
  onAddText: () => void;
  onAddNote: () => void;
  onSelectStyleLayer: (target: StyleLayerTarget) => void;
}

function layerDotClass(target: StyleLayerTarget): string {
  return target.type === "text"
    ? (target.id === "text-title" ? "title-dot" : "subtitle-dot")
    : target.type === "map"
      ? "map-dot"
      : target.type === "cards"
        ? "cards-dot"
        : target.type === "guests"
          ? "guests-dot"
          : "canvas-dot";
}

/**
 * 旧版编辑器左栏:助手轨道 + 按 `activePanel` 切换的六个面板
 * (名单 / 地图 / 模板 / 素材 / 交付 / 内容)。仅在 legacy 开关打开时挂载,
 * DOM 结构、class 名与描述文案与旧的 App 内联分支逐字一致。
 */
export function LegacyEditorSidebar({
  assistantRail,
  activePanel,
  project,
  dataView,
  summary,
  selection,
  userAssets,
  assetUsageById,
  customTemplates,
  resolvedTemplate,
  exportWarnings,
  dataWorkspaceProps,
  posterExport,
  syncStatus,
  onChangeDataView,
  onPatchScene,
  onResetScene,
  onSetSelection,
  onSetActivePanel,
  onReportStatus,
  onApplySystemTemplate,
  onApplyCustomTemplate,
  onSaveTemplate,
  onApplyBackground,
  onCreateLandmark,
  onCreateDecoration,
  onApplyProvinceThemes,
  onAddUserAsset,
  onReplaceUserAsset,
  onDeleteUserAsset,
  onExportResourcePack,
  onImportResourcePack,
  onSaveLocal,
  onAddText,
  onAddNote,
  onSelectStyleLayer,
}: LegacyEditorSidebarProps) {
  const patchMap: MapInspectorProps["onPatch"] = (patch) => onPatchScene({ type: "map" }, patch);

  return (
    <aside className="sidebar studio-sidebar">
      <div className="studio-sidebar__rail">{assistantRail}</div>

      <div className="studio-sidebar__panel">
      {activePanel === "roster" && (
        <div className="panel-content workflow-panel workflow-panel--roster">
          <div className="panel-heading"><span>名单检查</span><small>{project.students.length} 条记录</small></div>
          <DataWorkspace {...dataWorkspaceProps} />
        </div>
      )}

      {activePanel === "map" && (
        <div className="panel-content workflow-panel workflow-panel--map">
          <div className="panel-heading"><span>地图表达</span><small>选择读图方式</small></div>
          <SegmentedControl
            label="地图表达"
            activeId={dataView}
            items={dataViews.map((view) => ({ id: view.id, label: view.name.replace("卡片", ""), ariaLabel: `${view.name}：${view.description}` }))}
            onChange={onChangeDataView}
            className="workflow-data-views"
          />
          <MapInspector map={project.map} mode="global" collapsible onPatch={patchMap} onReset={() => onResetScene({ type: "map" })} />
        </div>
      )}

      {activePanel === "layout" && (
        <div className="panel-content">
          <div className="panel-heading">
            <span>内置模板</span>
            <small>应用整套地图元素</small>
          </div>
          <div className="template-grid" aria-label="内置整体模板">
            {SYSTEM_TEMPLATE_IDS.map((templateId) => {
              const template = createSystemTemplate(templateId);
              return <button
                key={templateId}
                type="button"
                className={`template-card ${project.templateId === templateId ? "selected" : ""}`}
                onClick={() => onApplySystemTemplate(templateId)}
              >
                <span className={`template-card__preview template-card__preview--${templateId}`} />
                <strong>{template.name}</strong>
              </button>;
            })}
          </div>
          <button className="wide-button" type="button" onClick={onSaveTemplate}><Save size={16} /> 保存当前整体模板</button>

          {customTemplates.length > 0 && (
            <>
              <div className="panel-heading data-heading">
                <span>我的模板</span>
                <small>{customTemplates.length}</small>
              </div>
              <div className="view-list">
                {customTemplates.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onApplyCustomTemplate(item)}
                  >
                    <strong>{item.name}</strong>
                    <span>
                      {item.scope === "visual" ? "视觉样式" : "布局倾向"} ·{" "}
                      {item.baseTemplateId}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}


      {activePanel === "assets" && (
        <div className="panel-content">
          <AssetPanel
            instances={project.assetElements
              .filter((element) => element.kind !== "province-texture")
              .map((element) => ({
                id: element.id,
                assetId: element.assetId,
                label: element.label,
                kind: element.kind,
              }))}
            provinces={provinceNames}
            dataProvinces={summary.map((item) => item.province)}
            selectedProvince={selection.type === "province" ? selection.province : ""}
            selectedProvinceStyle={selection.type === "province" ? project.map.provinceStyles?.[selection.province] : undefined}
            provinceStyles={project.map.provinceStyles}
            provinceAdjacency={CHINA_PROVINCE_ADJACENCY}
            mapBaseColor={project.map.landColor}
            posterBackground={project.canvas.backgroundColor}
            provinceTextureUniformSize={project.map.provinceTextureUniformSize}
            userAssets={userAssets}
            assetUsageById={assetUsageById}
            onPatchProvinceTextureUniformSize={(provinceTextureUniformSize) => {
              onPatchScene({ type: "map" }, { provinceTextureUniformSize });
            }}

            onSelectProvince={(province) => {
              if (province) {
                onSetSelection({ type: "province", province });
                onSetActivePanel("assets");
              }
            }}
            onSelectInstance={(id) => onSetSelection({ type: "asset", id })}
            onApplyBackground={onApplyBackground}
            onCreateLandmark={onCreateLandmark}
            onCreateDecoration={onCreateDecoration}
            onApplyProvinceAppearance={(province, appearance: ProvinceAppearance, fill?: string) => {
              try {
                onSetSelection({ type: "province", province });
                onSetActivePanel("assets");
                onPatchScene({ type: "province", province }, { appearance, ...(fill ? { fill } : {}) });
                onReportStatus(`已应用到地图：${province}`);
              } catch (error) {
                onReportStatus(error instanceof Error ? error.message : "应用省份贴图失败");
              }
            }}
            onApplyProvinceThemes={onApplyProvinceThemes}
            onResetProvinceAppearance={(province) => {
              try {
                onSetSelection({ type: "province", province });
                onSetActivePanel("assets");
                onPatchScene({ type: "province", province }, { appearance: undefined, fill: undefined, textureSrc: undefined });
                onReportStatus(`已恢复系统默认：${province}`);
              } catch (error) {
                onReportStatus(error instanceof Error ? error.message : "恢复省份外观失败");
              }
            }}
            onAddUserAsset={onAddUserAsset}
            onReplaceUserAsset={onReplaceUserAsset}
            onDeleteUserAsset={onDeleteUserAsset}
            onExportResourcePack={onExportResourcePack}
            onImportResourcePack={onImportResourcePack}
          />
        </div>
      )}

      {activePanel === "deliver" && (
        <div className="panel-content workflow-panel workflow-panel--deliver">
          <div className="panel-heading"><span>交付检查</span><small>{exportWarnings.unresolvedStudents.length || exportWarnings.hiddenStudents.length ? "需检查" : "可以导出"}</small></div>
          <div className="workflow-delivery-checks">
            <div><strong>{project.students.length}</strong><span>名单记录</span></div>
            <div><strong>{summary.length}</strong><span>目的省市</span></div>
          </div>
          {exportWarnings.unresolvedStudents.length > 0 && <p className="panel-note">{exportWarnings.unresolvedStudents.length} 个城市未匹配，可返回「名单」修正。</p>}
          {exportWarnings.hiddenStudents.length > 0 && <p className="panel-note">{exportWarnings.hiddenStudents.length} 条记录已隐藏，不会出现在海报中。</p>}
          <ActionGroup label="交付操作" className="workflow-delivery-actions">
            <button className="wide-button workflow-export-button" type="button" onClick={() => void posterExport.exportPng()} disabled={posterExport.exportState === "exporting"}><ImageDown size={16} />{posterExport.exportingPng || posterExport.exportState === "exporting" ? "导出中..." : "导出 PNG"}</button>
            <CompactButton icon={<Download size={14} aria-hidden />} onClick={posterExport.exportSvg} disabled={posterExport.exportState === "exporting"}>导出 SVG</CompactButton>
            <CompactButton icon={<Save size={14} aria-hidden />} onClick={onSaveLocal} disabled={syncStatus === "saving"}>保存到本机</CompactButton>
            <CompactButton icon={<PackageOpen size={14} aria-hidden />} onClick={posterExport.openProjectExportDialog} disabled={posterExport.exportState === "exporting"}>导出工程</CompactButton>
          </ActionGroup>
        </div>
      )}

      {activePanel === "content" && (
        <div className="panel-content workflow-panel workflow-panel--content">
          <>
              <div className="panel-heading">
                <span>画布元素</span>
                <small>可编辑图层</small>
              </div>
              <ActionGroup label="添加画布元素" className="content-add-actions">
                <CompactButton icon={<Plus size={14} aria-hidden />} onClick={onAddText}>添加文本框</CompactButton>
                <CompactButton icon={<Plus size={14} aria-hidden />} onClick={onAddNote}>添加特别备注</CompactButton>
              </ActionGroup>

              <div className="element-list" role="list" aria-label="画布图层">
                {STYLE_LAYER_TARGETS.map((target) => {
                  const selected = target.type === "text"
                    ? selection.type === "text" && selection.id === target.id
                    : selection.type === target.type;
                  return (
                    <button
                      key={target.label}
                      type="button"
                      role="listitem"
                      className={selected ? "is-active" : undefined}
                      aria-pressed={selected}
                      onClick={() => onSelectStyleLayer(target)}
                    >
                      <span className={`layer-dot ${layerDotClass(target)}`} />
                      {target.label}
                    </button>
                  );
                })}
              </div>
              <p className="panel-note">点击图层可在右侧打开对应属性面板；数据卡片会同时切换到「板块」页。可管理画布、标题、地图、卡片与特邀嘉宾。</p>
              <p className="panel-note">
                当前模板参数：scale {resolvedTemplate.map.scale.toFixed(2)} ·{" "}
                {resolvedTemplate.cards.preset} · 字段{" "}
                {resolvedTemplate.visibleFields.join("/")}
              </p>
            </>
        </div>
      )}
      </div>
    </aside>
  );
}
