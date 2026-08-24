import { Download, ImageDown, PackageOpen, Plus, Save } from "lucide-react";
import { useMemo } from "react";
import { AssetPanel } from "../AssetPanel";
import { DataWorkspace } from "../DataWorkspace";
import { MapInspector } from "../inspector/MapInspector";
import { ActionGroup, CompactButton, SegmentedControl } from "../StudioUi";
import { createNoteElement, createTextElement } from "../../lib/canvas-data";
import { dataViews, provinceNames, type ActivePanel } from "../../lib/app-constants";
import { createLandmarkElement } from "../../lib/asset-elements";
import { STYLE_LAYER_TARGETS } from "../../lib/catalog-usage";
import { createId } from "../../lib/ids";
import type { LocalWorkspaceOverwriteState } from "../../lib/incremental-workspace-sync";
import { CHINA_PROVINCE_ADJACENCY } from "../../lib/map-data";
import type { MapTemplateId, ProvinceSummary } from "../../lib/project-data";
import { applyTransaction, type ProjectDocument } from "../../lib/project-document";
import type { ProvinceAppearance } from "../../lib/scene-document";
import { buildResolvedTemplate, resolveStyleLayerSelection } from "../../lib/studio-editor-helpers";
import { createSystemTemplate } from "../../lib/template-document";
import type { CustomTemplateRecord } from "../../lib/template-store";
import { listStudentWarnings } from "../../lib/workflow-progress";
import type { StageSlotsContext } from "./stage-slots";

export type LegacySidebarPanelsProps = {
  ctx: StageSlotsContext;
  activePanel: ActivePanel;
  summary: ProvinceSummary[];
  syncState: LocalWorkspaceOverwriteState;
  customTemplates: CustomTemplateRecord[];
  commitProject: (next: ProjectDocument) => void;
  onStatusMessage: (message: string) => void;
  onActivePanelChange: (panel: ActivePanel) => void;
  onApplySystemTemplate: (templateId: MapTemplateId) => void;
  onApplyCustomTemplate: (record: CustomTemplateRecord) => void;
  onSaveTemplate: () => void;
  onSaveLocal: () => void;
};

/**
 * 经典（legacy）编辑器左侧栏的六个面板（名单/地图/模板/素材/交付/内容），
 * 原 App.tsx 内联 JSX 抽出，行为不变。仅在 legacy 兼容开关开启时渲染。
 */
export function LegacySidebarPanels({
  ctx,
  activePanel,
  summary,
  syncState,
  customTemplates,
  commitProject,
  onStatusMessage,
  onActivePanelChange,
  onApplySystemTemplate,
  onApplyCustomTemplate,
  onSaveTemplate,
  onSaveLocal,
}: LegacySidebarPanelsProps) {
  const { project, renderProject, selection, posterExport, assetPanelProps } = ctx;
  const dataView = renderProject.dataView;
  const exportWarnings = useMemo(() => listStudentWarnings(project), [project]);
  const resolvedTemplate = useMemo(() => buildResolvedTemplate(renderProject), [renderProject]);

  const addText = () => {
    const element = createTextElement("给未来的一封信", 720, 870);
    commitProject(
      applyTransaction(project, {
        id: createId("tx-text"),
        label: "添加文本框",
        source: "manual",
        apply: (current) => ({
          ...current,
          textElements: [...current.textElements, element],
        }),
      }),
    );
    ctx.onSelect({ type: "text", id: element.id });
  };

  const addNote = () => {
    const element = createNoteElement("山高水长，来日再聚", 745, 905);
    commitProject(applyTransaction(project, {
      id: createId("tx-note"),
      label: "添加特别备注",
      source: "manual",
      apply: (current) => ({ ...current, textElements: [...current.textElements, element] }),
    }));
    ctx.onSelect({ type: "text", id: element.id });
  };

  return (
    <>
      {activePanel === "roster" && (
        <div className="panel-content workflow-panel workflow-panel--roster">
          <div className="panel-heading"><span>名单检查</span><small>{project.students.length} 条记录</small></div>
          <DataWorkspace {...ctx.dataWorkspaceProps} />
        </div>
      )}

      {activePanel === "map" && (
        <div className="panel-content workflow-panel workflow-panel--map">
          <div className="panel-heading"><span>地图表达</span><small>选择读图方式</small></div>
          <SegmentedControl
            label="地图表达"
            activeId={dataView}
            items={dataViews.map((view) => ({ id: view.id, label: view.name.replace("卡片", ""), ariaLabel: `${view.name}：${view.description}` }))}
            onChange={ctx.onChangeDataView}
            className="workflow-data-views"
          />
          <MapInspector map={project.map} mode="global" collapsible onPatch={(patch) => ctx.onPatchScene({ type: "map" }, patch)} onReset={() => ctx.onResetScene({ type: "map" })} />
        </div>
      )}

      {activePanel === "layout" && (
        <div className="panel-content">
          <div className="panel-heading">
            <span>内置模板</span>
            <small>应用整套地图元素</small>
          </div>
          <div className="template-grid" aria-label="内置整体模板">
            {(["original", "cartoon", "grain", "q", "scenery"] as const).map((templateId) => {
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
            userAssets={ctx.userAssets}
            assetUsageById={assetPanelProps.assetUsageById}
            onPatchProvinceTextureUniformSize={(provinceTextureUniformSize) => {
              ctx.onPatchScene({ type: "map" }, { provinceTextureUniformSize });
            }}

            onSelectProvince={(province) => {
              if (province) {
                ctx.onSelect({ type: "province", province });
                onActivePanelChange("assets");
              }
            }}
            onSelectInstance={assetPanelProps.onSelectInstance}
            onApplyBackground={assetPanelProps.onApplyBackground}
            onCreateLandmark={(asset) => {
              const selectedProvince = selection.type === "province" ? selection.province : "";
              const element = createLandmarkElement(asset, selectedProvince || "全国", {
                x: project.map.x + project.map.width / 2 - 60,
                y: project.map.y + project.map.height / 2 - 60,
              });
              commitProject(
                applyTransaction(project, {
                  id: createId("tx-landmark"),
                  label: `添加地标：${asset.label}`,
                  source: "manual",
                  apply: (current) => ({
                    ...current,
                    assetElements: [...current.assetElements, element],
                  }),
                }),
              );
              ctx.onSelect({ type: "asset", id: element.id });
            }}
            onCreateDecoration={ctx.onCreateDecoration}
            onApplyProvinceAppearance={(province, appearance: ProvinceAppearance, fill?: string) => {
              try {
                ctx.onSelect({ type: "province", province });
                onActivePanelChange("assets");
                ctx.onPatchScene({ type: "province", province }, { appearance, ...(fill ? { fill } : {}) });
                onStatusMessage(`已应用到地图：${province}`);
              } catch (error) {
                onStatusMessage(error instanceof Error ? error.message : "应用省份贴图失败");
              }
            }}
            onApplyProvinceThemes={assetPanelProps.onApplyProvinceThemes}
            onResetProvinceAppearance={(province) => {
              try {
                ctx.onSelect({ type: "province", province });
                onActivePanelChange("assets");
                ctx.onPatchScene({ type: "province", province }, { appearance: undefined, fill: undefined, textureSrc: undefined });
                onStatusMessage(`已恢复系统默认：${province}`);
              } catch (error) {
                onStatusMessage(error instanceof Error ? error.message : "恢复省份外观失败");
              }
            }}
            onAddUserAsset={ctx.onAddUserAsset}
            onReplaceUserAsset={assetPanelProps.onReplaceUserAsset}
            onDeleteUserAsset={assetPanelProps.onDeleteUserAsset}
            onExportResourcePack={assetPanelProps.onExportResourcePack}
            onImportResourcePack={assetPanelProps.onImportResourcePack}
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
            <button className="wide-button workflow-export-button" type="button" onClick={() => void posterExport.exportPng()} disabled={posterExport.exportingPng}><ImageDown size={16} />{posterExport.exportingPng ? "导出中..." : "导出 PNG"}</button>
            <CompactButton icon={<Download size={14} aria-hidden />} onClick={posterExport.exportSvg}>导出 SVG</CompactButton>
            <CompactButton icon={<Save size={14} aria-hidden />} onClick={onSaveLocal} disabled={syncState.status === "saving"}>保存到本机</CompactButton>
            <CompactButton icon={<PackageOpen size={14} aria-hidden />} onClick={posterExport.openProjectExportDialog}>导出工程</CompactButton>
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
                <CompactButton icon={<Plus size={14} aria-hidden />} onClick={addText}>添加文本框</CompactButton>
                <CompactButton icon={<Plus size={14} aria-hidden />} onClick={addNote}>添加特别备注</CompactButton>
              </ActionGroup>

              <div className="element-list" role="list" aria-label="画布图层">
                {STYLE_LAYER_TARGETS.map((target) => {
                  const selected = target.type === "text"
                    ? selection.type === "text" && selection.id === target.id
                    : selection.type === target.type;
                  const dotClass = target.type === "text"
                    ? (target.id === "text-title" ? "title-dot" : "subtitle-dot")
                    : target.type === "map"
                      ? "map-dot"
                      : target.type === "cards"
                        ? "cards-dot"
                        : target.type === "guests"
                          ? "guests-dot"
                          : "canvas-dot";
                  return (
                    <button
                      key={target.label}
                      type="button"
                      role="listitem"
                      className={selected ? "is-active" : undefined}
                      aria-pressed={selected}
                      onClick={() => ctx.onSelect(resolveStyleLayerSelection(target))}
                    >
                      <span className={`layer-dot ${dotClass}`} />
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
    </>
  );
}
