/**
 * 聚焦阶段顶栏的动作节点（原 App.tsx 内联 JSX 抽出，行为不变）：
 * AI 助手入口按钮、撤销/重做组、「导出与工程」项目菜单与右侧工程动作区。
 * 项目菜单节点由 App 构造一次，聚焦阶段与旧版编辑器共用同一实例。
 */
import { Bot, Redo2, Undo2 } from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";
import { ProjectMenu } from "../ProjectMenu";
import { SkinSelector } from "../SkinSelector";
import { ThemeToggle } from "../ThemeToggle";
import { ToolbarButton, ToolbarGroup } from "../StudioUi";
import { WorkbenchBackButton } from "./WorkbenchBackButton";
import type { LocalWorkspaceOverwriteState } from "../../lib/incremental-workspace-sync";
import type { ProjectHistorySummary } from "../../lib/studio-editor-helpers";
import type { UsePosterExportResult } from "../../lib/usePosterExport";
import type { CollaborationSync } from "../../hooks/use-collaboration-sync";
import type { StudioChrome } from "../../hooks/use-studio-chrome";

export interface ProjectMenuGroupProps {
  collaboration: CollaborationSync;
  posterExport: UsePosterExportResult;
  syncStatus: LocalWorkspaceOverwriteState["status"];
  onNewProject: () => void;
  onRestoreLocal: () => void;
  onSaveLocal: () => void;
}

/** 顶栏「导出与工程」菜单：协作房间、项目新建/恢复/保存与导入导出。 */
export function ProjectMenuGroup({
  collaboration,
  posterExport,
  syncStatus,
  onNewProject,
  onRestoreLocal,
  onSaveLocal,
}: ProjectMenuGroupProps) {
  return (
    <ToolbarGroup label="导出与工程">
      <ProjectMenu
        roomId={collaboration.roomId}
        roomVersion={collaboration.roomVersion}
        roomInput={collaboration.roomInput}
        inviteTokenInput={collaboration.inviteTokenInput}
        roomRole={collaboration.roomRole}
        members={collaboration.roomMembers}
        ownClientId={collaboration.clientId}
        roomReadonly={collaboration.roomReadonly}
        roomClosed={collaboration.roomClosed}
        invitationToken={collaboration.invitationToken}
        hasStoredRoomAccess={collaboration.hasStoredRoomAccess}
        collaborationStatus={collaboration.collaborationStatus}
        collaborationMessage={collaboration.collaborationMessage}
        collaborationOpen={collaboration.collaborationOpen}
        pngScale={posterExport.pngScale}
        transparentExport={posterExport.transparentExport}
        syncStatus={syncStatus}
        onSetCollaborationOpen={collaboration.setCollaborationOpen}
        onRoomInputChange={collaboration.setRoomInput}
        onInviteTokenInputChange={collaboration.setInviteTokenInput}
        onCreateInvitation={collaboration.createInvitation}
        onSetRoomAccess={collaboration.setAccess}
        onLeaveRoom={collaboration.leaveRoom}
        onStartRoom={collaboration.startRoom}
        onJoinRoom={collaboration.joinRoom}
        onNewProject={onNewProject}
        onRestoreLocal={onRestoreLocal}
        onSaveLocal={onSaveLocal}
        onPngScaleChange={posterExport.setPngScale}
        onTransparentChange={posterExport.setTransparentExport}
        onExportSvg={posterExport.exportSvg}
        onExportProject={posterExport.openProjectExportDialog}
        onImportProject={posterExport.importProjectPackage}
      />
    </ToolbarGroup>
  );
}

/** 顶栏 AI 助手与高级功能入口（移动端唤起抽屉）。 */
export function AssistantEntryButton({
  open,
  onOpen,
  buttonRef,
}: {
  open: boolean;
  onOpen: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label="打开AI助手与高级功能"
      aria-expanded={open}
      onClick={onOpen}
    >
      <Bot size={17} aria-hidden />
    </button>
  );
}

/** 顶栏「历史与缩放」组（聚焦阶段仅撤销/重做）。 */
export function HistoryActionsGroup({
  history,
  onUndo,
  onRedo,
}: {
  history: ProjectHistorySummary;
  onUndo: () => void;
  onRedo: () => void;
}) {
  // 与 MapStyleRail 相同的读屏反馈（WCAG 4.1.3 状态消息）：撤销/重做本身零反馈，
  // 按钮 aria-label 的静默更新不会被读出。点击时用点击前的标签播报
  // 「已撤销：某步骤 / 已重做：某步骤」；tick 的隐形空格后缀在两次播报之间切换，
  // 保证连续撤销两个同名步骤时 DOM 文本仍有变化（aria-live 不会复读完全相同的文本）。
  const [historyAnnouncement, setHistoryAnnouncement] = useState({ text: "", tick: 0 });
  const announceHistory = (label: string) =>
    setHistoryAnnouncement((prev) => ({ text: `已${label}`, tick: prev.tick + 1 }));
  return (
    <>
      <ToolbarGroup label="历史与缩放" className="topbar-action-group--history">
        <ToolbarButton
          label={history.undoLabel}
          icon={<Undo2 size={18} aria-hidden />}
          disabled={!history.canUndo}
          onClick={() => { announceHistory(history.undoLabel); onUndo(); }}
        />
        <ToolbarButton
          label={history.redoLabel}
          icon={<Redo2 size={18} aria-hidden />}
          disabled={!history.canRedo}
          onClick={() => { announceHistory(history.redoLabel); onRedo(); }}
        />
      </ToolbarGroup>
      {/* 持久存在（而非按需挂载）的播报区：区域必须先于变更就在 DOM 里，
          读屏才能可靠播报；sr-only 绝对定位，不影响顶栏布局。窄屏 CSS 只隐藏
          组内 icon-button，本节点在组外，不受影响。 */}
      <span className="sr-only" role="status" aria-live="polite" data-topbar-history-announcement>
        {historyAnnouncement.text}
        {historyAnnouncement.tick % 2 === 1 ? "\u00A0" : ""}
      </span>
    </>
  );
}

/** 顶栏右侧工程动作区：返回项目列表 + 项目菜单 + 界面主题。 */
export function ProjectActionsGroup({
  showBack,
  onBack,
  projectMenu,
  chrome,
}: {
  showBack: boolean;
  onBack: () => void;
  /** 「导出与工程」菜单节点（与旧版编辑器共用同一实例）。 */
  projectMenu: ReactNode;
  chrome: StudioChrome;
}) {
  return (
    <>
      {showBack && <WorkbenchBackButton onClick={onBack} />}
      {projectMenu}
      <ToolbarGroup label="界面主题" className="topbar-action-group--theme">
        <SkinSelector skin={chrome.skin} onChange={chrome.setSkin} />
        <ThemeToggle mode={chrome.themeMode} resolvedTheme={chrome.resolvedTheme} onChange={chrome.setThemeMode} />
      </ToolbarGroup>
    </>
  );
}
