import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AgentAssistant, useAssistantRailState, type RailTabId } from "./AgentAssistant";
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

const RAIL_TABS: ReadonlyArray<{ id: RailTabId; label: string }> = [
  { id: "ai", label: "AI 助手" },
  { id: "stage", label: "本阶段" },
  { id: "advanced", label: "高级功能" },
];

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
  // 页签状态归 AssistantConversationProvider：桌面常驻栏与抽屉是同一份 rail 的两个副本，
  // 各自持有 state 会让抽屉打开时停在另一套页签上。
  const { activeTab, advancedView, selectTab, setAdvancedView } = useAssistantRailState();
  // 但 id 必须按实例区分：两个副本同时在文档里，静态 id 会重复。
  const instanceId = useId();
  const tabId = (tab: RailTabId) => `${instanceId}-${tab}-tab`;
  const panelId = (tab: RailTabId) => `${instanceId}-${tab}-panel`;
  const tabRefs = useRef(new Map<RailTabId, HTMLButtonElement>());

  const nextTabIndex = (key: string, index: number): number | null => {
    switch (key) {
      case "ArrowRight":
      case "ArrowDown": return (index + 1) % RAIL_TABS.length;
      case "ArrowLeft":
      case "ArrowUp": return (index - 1 + RAIL_TABS.length) % RAIL_TABS.length;
      case "Home": return 0;
      case "End": return RAIL_TABS.length - 1;
      default: return null;
    }
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: RailTabId) => {
    const index = nextTabIndex(event.key, RAIL_TABS.findIndex((item) => item.id === tab));
    if (index === null) return;
    event.preventDefault();
    const next = RAIL_TABS[index]!.id;
    selectTab(next);
    tabRefs.current.get(next)?.focus();
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

  // listbox 是一个整体 tab 停靠点：只有一个 option 可 tab 进入，其余靠方向键。
  // 停靠点默认落在已选中项上，用过键盘/焦点后跟随最后一次落焦的 option。
  const optionRefs = useRef(new Map<number, HTMLButtonElement>());
  const [focusedOption, setFocusedOption] = useState<number | null>(null);
  const selectedOption = outline.findIndex((item) => sameSelection(selection, item.selection));
  const tabStopOption = Math.min(
    Math.max(focusedOption ?? (selectedOption >= 0 ? selectedOption : 0), 0),
    Math.max(outline.length - 1, 0),
  );

  // 与 tablist 不同：listbox 到头即停，不环绕（ARIA APG 单选列表的默认行为）。
  const nextOptionIndex = (key: string, index: number): number | null => {
    switch (key) {
      case "ArrowDown":
      case "ArrowRight": return Math.min(index + 1, outline.length - 1);
      case "ArrowUp":
      case "ArrowLeft": return Math.max(index - 1, 0);
      case "Home": return 0;
      case "End": return outline.length - 1;
      default: return null;
    }
  };

  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextOptionIndex(event.key, index);
    if (next === null) return;
    event.preventDefault();
    if (next === index) return;
    setFocusedOption(next);
    optionRefs.current.get(next)?.focus();
  };

  return (
    <div className="studio-assistant-rail">
      <div className="studio-assistant-rail__tabs" role="tablist" aria-label="左侧工具">
        {RAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) tabRefs.current.set(tab.id, node);
              else tabRefs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            data-rail-tab={tab.id}
            id={tabId(tab.id)}
            aria-selected={activeTab === tab.id}
            aria-controls={panelId(tab.id)}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => onTabKeyDown(event, tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "ai" ? (
        <section
          className="studio-assistant-rail__panel"
          role="tabpanel"
          data-rail-panel="ai"
          id={panelId("ai")}
          aria-labelledby={tabId("ai")}
          aria-label="AI 助手"
        >
          <AgentAssistant project={project} assets={assets} onPreview={onPreview} onCommit={onCommit} />
        </section>
      ) : activeTab === "stage" ? (
        <section
          className="studio-assistant-rail__panel"
          role="tabpanel"
          data-rail-panel="stage"
          id={panelId("stage")}
          aria-labelledby={tabId("stage")}
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
                selectTab("advanced", "elements");
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
          data-rail-panel="advanced"
          id={panelId("advanced")}
          aria-labelledby={tabId("advanced")}
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
                    {outline.map(({ selection: itemSelection, label }, index) => (
                      <button
                        key={`${itemSelection.type}-${"id" in itemSelection ? itemSelection.id : ""}-${"province" in itemSelection ? itemSelection.province : ""}`}
                        ref={(node) => {
                          if (node) optionRefs.current.set(index, node);
                          else optionRefs.current.delete(index);
                        }}
                        type="button"
                        role="option"
                        aria-selected={sameSelection(selection, itemSelection)}
                        className={sameSelection(selection, itemSelection) ? "is-active" : undefined}
                        tabIndex={index === tabStopOption ? 0 : -1}
                        onFocus={() => setFocusedOption(index)}
                        onKeyDown={(event) => onOptionKeyDown(event, index)}
                        onClick={() => {
                          setFocusedOption(index);
                          onSelectElement(itemSelection);
                        }}
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
