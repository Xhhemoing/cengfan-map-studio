import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { AgentAssistant } from "./AgentAssistant";
import type { UserAsset } from "../lib/assets";
import type { LocalOverwriteStatus } from "../lib/incremental-workspace-sync";
import type { ProjectDocument, ProjectTransaction } from "../lib/project-document";
import type { LayoutHealthIssue } from "../lib/layout-health";
import type { SceneSelection } from "../lib/scene-document";

export type CollaborationStatus = "idle" | "connecting" | "connected" | "syncing" | "conflict" | "error";

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
  onArrangeCards: (mode: "untouched" | "all") => void;
  onRestoreCardPosition: (id: string) => void;
  onRestoreAllCardPositions: () => void;
  onLocateLayoutIssue: (issue: LayoutHealthIssue) => void;
  onPreview: (project: ProjectDocument | null) => void;
  onCommit: (transaction: ProjectTransaction) => void;
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
  onArrangeCards,
  onRestoreCardPosition,
  onRestoreAllCardPositions,
  onLocateLayoutIssue,
  onPreview,
  onCommit,
}: StudioAssistantRailProps) {
  const [activeTab, setActiveTab] = useState<"ai" | "advanced">("ai");
  const [advancedView, setAdvancedView] = useState<"operations" | "elements">("operations");
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
  const manualPositionIds = useMemo(
    () => Object.keys(project.cards.positions ?? {}).sort((left, right) => left.localeCompare(right)),
    [project.cards.positions],
  );

  return (
    <div className="studio-assistant-rail">
      <div className="studio-assistant-rail__tabs" role="tablist" aria-label="左侧工具">
        <button
          type="button"
          role="tab"
          id="studio-ai-tab"
          aria-selected={activeTab === "ai"}
          aria-controls="studio-ai-panel"
          onClick={() => setActiveTab("ai")}
        >
          AI 助手
        </button>
        <button
          type="button"
          role="tab"
          id="studio-advanced-tab"
          aria-selected={activeTab === "advanced"}
          aria-controls="studio-advanced-panel"
          onClick={() => {
            setActiveTab("advanced");
            setAdvancedView("operations");
          }}
        >
          高级功能
        </button>
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
                <section className="studio-advanced__group" aria-label="智能排版控制">
                  <h3>智能排版</h3>
                  <p className="studio-advanced__hint">手调位置会保留。</p>
                  <button type="button" className="wide-button action-button" aria-label="仅排未手调" onClick={() => onArrangeCards("untouched")}>仅排未手调</button>
                  <button type="button" className="wide-button action-button" aria-label="全部重新排版" onClick={() => onArrangeCards("all")}>全部重新排版</button>
                  {manualPositionIds.length > 0 && (
                    <div className="studio-advanced__manual-positions" aria-label="手动位置">
                      {manualPositionIds.map((id) => <button key={id} type="button" onClick={() => onRestoreCardPosition(id)}><span>{id}</span><RotateCcw size={13} aria-hidden /></button>)}
                      <button type="button" onClick={onRestoreAllCardPositions}>恢复全部自动位置</button>
                    </div>
                  )}
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
              <button type="button" className="wide-button action-button" aria-label="打开元素查看" onClick={() => setAdvancedView("elements")}>打开元素查看</button>
            </section>
            <section className="studio-advanced__group" aria-label="工程状态">
              <h3>工程状态</h3>
              <ul className="studio-advanced__status">
                <li><span>当前文档</span><strong>ProjectDocument</strong></li>
                <li><span>学生名单</span><strong>{project.students.length} 条</strong></li>
                <li><span>同步状态</span><strong>{SYNC_LABELS[syncStatus]}</strong></li>
              </ul>
            </section>
            <section className="studio-advanced__group" aria-label="协作与邀请">
              <h3>协作与邀请</h3>
              <ul className="studio-advanced__status">
                <li><span>协作房间</span><strong>{collaboration.roomId ?? "未连接"}</strong></li>
                <li><span>连接状态</span><strong>{COLLABORATION_LABELS[collaboration.status]}</strong></li>
                <li><span>协作者</span><strong>{collaboration.participantCount} 人</strong></li>
              </ul>
              <button type="button" className="wide-button action-button" aria-label="管理协作与邀请" onClick={onOpenCollaboration}>管理协作与邀请</button>
            </section>
            <section className="studio-advanced__group" aria-label="数据诊断">
              <h3>数据诊断</h3>
              <ul className="studio-advanced__status">
                <li><span>数据告警</span><strong>{dataIssueCount > 0 ? `${dataIssueCount} 项` : "无"}</strong></li>
              </ul>
              <button type="button" className="wide-button action-button" aria-label="打开数据诊断" onClick={onOpenDataDiagnostics}>打开数据诊断</button>
            </section>
            <section className="studio-advanced__group" aria-label="渲染性能">
              <h3>渲染性能</h3>
              <ul className="studio-advanced__status">
                <li><span>渲染间隔</span><strong>{renderIntervalMs} ms</strong></li>
              </ul>
              <button type="button" className="wide-button action-button" aria-label="打开渲染设置" onClick={onOpenRenderSettings}>打开渲染设置</button>
            </section>
            <section className="studio-advanced__group" aria-label="开发者配置">
              <h3>开发者配置</h3>
              <div className="studio-advanced__actions">
                <button type="button" className="wide-button action-button" aria-label="打开全局设置" onClick={onOpenSettings}>
                  项目配置与设置
                </button>
                <button type="button" className="wide-button action-button" aria-label="打开项目菜单" onClick={onOpenProject}>
                  项目菜单
                </button>
              </div>
            </section>
            </>}
          </div>
        </section>
      )}
    </div>
  );
}
