import { useMemo, useState, type KeyboardEvent } from "react";
import { AgentAssistant } from "./AgentAssistant";
import { StageOverviewPanel } from "./StageOverviewPanel";
import type { StageOverviewAction, StageOverviewModel } from "../lib/stage-overview";
import type { UserAsset } from "../lib/assets";
import type { LocalOverwriteStatus } from "../lib/incremental-workspace-sync";
import type { ProjectDocument, ProjectTransaction } from "../lib/project-document";
import type { LayoutHealthIssue } from "../lib/layout-health";
import type { SceneSelection } from "../lib/scene-document";

export type CollaborationStatus = "idle" | "connecting" | "connected" | "syncing" | "conflict" | "error" | "closed";

export interface StudioAssistantRailProps {
  project: ProjectDocument;
  assets: UserAsset[];
  syncStatus: LocalOverwriteStatus;
  collaboration: { roomId: string | null; status: CollaborationStatus; participantCount: number };
  dataIssueCount: number;
  renderIntervalMs: number;
  onOpenSettings: () => void;
  onOpenProject: () => void;
  onOpenCollaboration: () => void;
  onOpenDataDiagnostics: () => void;
  onOpenRenderSettings: () => void;
  selection: SceneSelection;
  layoutIssues: LayoutHealthIssue[];
  onSelectElement: (selection: SceneSelection) => void;
  onLocateLayoutIssue: (issue: LayoutHealthIssue) => void;
  onPreview: (project: ProjectDocument | null) => void;
  onCommit: (transaction: ProjectTransaction) => void;
  /** 本阶段总览模型（T2 窄只读 DTO）。 */
  stageOverview: StageOverviewModel;
  onStageOverviewAction: (action: StageOverviewAction) => void;
}

type RailTab = "ai" | "stage" | "advanced";

const RAIL_TABS: ReadonlyArray<{ id: RailTab; label: string }> = [
  { id: "ai", label: "AI 助手" },
  { id: "stage", label: "本阶段" },
  { id: "advanced", label: "高级功能" },
];

const SYNC_LABELS: Record<LocalOverwriteStatus, string> = {
  idle: "未保存修改",
  pending: "有未保存修改",
  saving: "正在保存",
  saved: "已保存",
  failed: "保存失败",
};

const COLLABORATION_LABELS: Record<CollaborationStatus, string> = {
  idle: "未连接",
  connecting: "连接中",
  connected: "已连接",
  syncing: "同步中",
  conflict: "版本冲突",
  error: "连接错误",
  closed: "房间已关闭",
};

function selectionLabel(selection: SceneSelection): string {
  switch (selection.type) {
    case "canvas": return "画布";
    case "map": return "地图展示框";
    case "cards": return "数据展示框";
    case "guests": return "嘉宾板块";
    case "province": return selection.province;
    case "text": return "文字";
    case "asset": return "素材实例";
  }
}

function sameSelection(left: SceneSelection, right: SceneSelection): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function StudioAssistantRail({
  project,
  assets,
  syncStatus,
  collaboration,
  dataIssueCount,
  renderIntervalMs,
  onOpenSettings,
  onOpenProject,
  onOpenCollaboration,
  onOpenDataDiagnostics,
  onOpenRenderSettings,
  selection,
  layoutIssues,
  onSelectElement,
  onLocateLayoutIssue,
  onPreview,
  onCommit,
  stageOverview,
  onStageOverviewAction,
}: StudioAssistantRailProps) {
  const [activeTab, setActiveTab] = useState<RailTab>("ai");
  const [advancedView, setAdvancedView] = useState<"operations" | "elements">("operations");

  const activateTab = (tab: RailTab) => {
    setActiveTab(tab);
    if (tab === "advanced") setAdvancedView("operations");
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % RAIL_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + RAIL_TABS.length) % RAIL_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = RAIL_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = RAIL_TABS[nextIndex]!;
    activateTab(next.id);
    document.getElementById(`studio-${next.id}-tab`)?.focus();
  };
  const outline = useMemo(() => [
    { selection: { type: "canvas" } as const, label: "画布" },
    { selection: { type: "map" } as const, label: "地图展示框" },
    { selection: { type: "cards" } as const, label: "数据展示框" },
    { selection: { type: "guests" } as const, label: "嘉宾板块" },
    ...project.textElements.filter((item) => item.visibility !== false).map((item) => ({
      selection: { type: "text", id: item.id } as const,
      label: item.content.trim() || "未命名文字",
    })),
    ...project.assetElements.filter((item) => item.visibility !== false).map((item) => ({
      selection: { type: "asset", id: item.id } as const,
      label: item.label,
    })),
  ], [project.assetElements, project.textElements]);

  return (
    <div className="studio-assistant-rail">
      <div className="studio-assistant-rail__tabs" role="tablist" aria-label="左侧工具">
        {RAIL_TABS.map(({ id, label }, index) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`studio-${id}-tab`}
            aria-selected={activeTab === id}
            aria-controls={`studio-${id}-panel`}
            tabIndex={activeTab === id ? 0 : -1}
            onClick={() => activateTab(id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === "ai" ? (
        <section
          className="studio-assistant-rail__panel"
          role="tabpanel"
          id="studio-ai-panel"
          aria-labelledby="studio-ai-tab"
          aria-label="AI 助手"
        >
          <AgentAssistant presentation="docked" project={project} assets={assets} onPreview={onPreview} onCommit={onCommit} />
        </section>
      ) : activeTab === "stage" ? (
        <section
          className="studio-assistant-rail__panel"
          role="tabpanel"
          id="studio-stage-panel"
          aria-labelledby="studio-stage-tab"
          aria-label="本阶段"
        >
          <StageOverviewPanel
            model={stageOverview}
            saveLabel={SYNC_LABELS[syncStatus]}
            collaborationLabel={collaboration.roomId
              ? `房间 ${collaboration.roomId} · ${COLLABORATION_LABELS[collaboration.status]}`
              : COLLABORATION_LABELS[collaboration.status]}
            onAction={(action) => {
              if (action.kind === "elements") {
                setActiveTab("advanced");
                setAdvancedView("elements");
                return;
              }
              onStageOverviewAction(action);
            }}
          />
        </section>
      ) : (
        <section
          className="studio-assistant-rail__panel"
          role="tabpanel"
          id="studio-advanced-panel"
          aria-labelledby="studio-advanced-tab"
          aria-label="高级功能"
        >
          <div className="studio-advanced">
            {advancedView === "elements" ? (
              <>
                <div className="studio-advanced__subheader">
                  <strong>元素查看</strong>
                  <button type="button" aria-label="返回高级功能" onClick={() => setAdvancedView("operations")}>返回</button>
                </div>
                <section className="studio-advanced__group" aria-label="画布元素">
                  <div className="studio-advanced__section-heading"><h3>画布元素</h3><small>{outline.length} 个</small></div>
                  <div className="studio-advanced__element-list" role="listbox" aria-label="内容对象列表">
                    {outline.map(({ selection: itemSelection, label }) => (
                      <button
                        key={`${itemSelection.type}-${"id" in itemSelection ? itemSelection.id : ""}-${"province" in itemSelection ? itemSelection.province : ""}`}
                        type="button"
                        role="option"
                        aria-selected={sameSelection(selection, itemSelection)}
                        className={sameSelection(selection, itemSelection) ? "is-active" : undefined}
                        onClick={() => onSelectElement(itemSelection)}
                      >
                        <span>{label}</span><small>{selectionLabel(itemSelection)}</small>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="studio-advanced__group" aria-label="排版问题提示">
                  <div className="studio-advanced__section-heading"><h3>排版问题</h3><small>{layoutIssues.length} 项</small></div>
                  {layoutIssues.length === 0 ? <p className="studio-advanced__hint">当前未发现明显问题。</p> : layoutIssues.map((issue) => <button key={issue.id} type="button" className="studio-advanced__issue" onClick={() => onLocateLayoutIssue(issue)}>{issue.detail}</button>)}
                </section>
              </>
            ) : <>
            <section className="studio-advanced__group" aria-label="元素查看">
              <h3>元素查看</h3>
              <p className="studio-advanced__hint">定位画布、地图、数据框、文字和素材。</p>
              <button type="button" className="studio-advanced__action" aria-label="打开元素查看" onClick={() => setAdvancedView("elements")}>
                <span>打开元素查看</span><small>画布元素 · 排版问题</small>
              </button>
            </section>
            <section className="studio-advanced__group" aria-label="工程状态">
              <h3>工程状态</h3>
              <div className="studio-advanced__meta-line"><span>同步状态</span><strong>{SYNC_LABELS[syncStatus]} · {project.students.length} 条名单</strong></div>
            </section>
            <section className="studio-advanced__group" aria-label="协作与邀请">
              <h3>协作与邀请</h3>
              <button type="button" className="studio-advanced__action" aria-label="管理协作与邀请" onClick={onOpenCollaboration}>
                <span>管理协作与邀请</span>
                <small>{collaboration.roomId
                  ? `房间 ${collaboration.roomId} · ${COLLABORATION_LABELS[collaboration.status]}${collaboration.participantCount > 0 ? ` · ${collaboration.participantCount} 人` : ""}`
                  : COLLABORATION_LABELS[collaboration.status]}</small>
              </button>
            </section>
            <section className="studio-advanced__group" aria-label="数据诊断">
              <h3>数据诊断</h3>
              <button type="button" className="studio-advanced__action" aria-label="打开数据诊断" onClick={onOpenDataDiagnostics}>
                <span>打开数据诊断</span><small>{dataIssueCount > 0 ? `${dataIssueCount} 项告警` : "暂无告警"}</small>
              </button>
            </section>
            <section className="studio-advanced__group" aria-label="渲染性能">
              <h3>渲染性能</h3>
              <button type="button" className="studio-advanced__action" aria-label="打开渲染设置" onClick={onOpenRenderSettings}>
                <span>打开渲染设置</span><small>{renderIntervalMs} ms 间隔</small>
              </button>
            </section>
            <section className="studio-advanced__group" aria-label="开发者配置">
              <h3>开发者配置</h3>
              <button type="button" className="studio-advanced__action" aria-label="打开全局设置" onClick={onOpenSettings}>
                <span>项目配置与设置</span><small>全局设置</small>
              </button>
              <button type="button" className="studio-advanced__action" aria-label="打开项目菜单" onClick={onOpenProject}>
                <span>项目菜单</span><small>导入导出</small>
              </button>
            </section>
            </>}
          </div>
        </section>
      )}
    </div>
  );
}
