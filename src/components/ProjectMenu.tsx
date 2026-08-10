/**
 * Project menu popover for the studio top bar: project management, poster
 * export options, incremental collaboration, and project file I/O.
 * Pure presentation — all state and callbacks flow in through props.
 */
import { Copy, Download, FolderOpen, LogOut, PackageOpen, Plus, Save, Share2 } from "lucide-react";
import type { CollaborationRole, RoomParticipant } from "../lib/collaboration-client";
import type { LocalOverwriteStatus } from "../lib/incremental-workspace-sync";

export type CollaborationStatus = "idle" | "connecting" | "connected" | "syncing" | "conflict" | "error";

export interface ProjectMenuProps {
  roomId: string | null;
  roomVersion: number;
  roomInput: string;
  inviteTokenInput: string;
  roomRole: CollaborationRole | null;
  participants: RoomParticipant[];
  invitationToken: string | null;
  hasStoredRoomAccess: boolean;
  collaborationStatus: CollaborationStatus;
  collaborationMessage: string;
  collaborationOpen: boolean;
  pngScale: number;
  transparentExport: boolean;
  syncStatus: LocalOverwriteStatus;
  onSetCollaborationOpen: (open: boolean) => void;
  onRoomInputChange: (value: string) => void;
  onInviteTokenInputChange: (value: string) => void;
  onCreateInvitation: (role: Exclude<CollaborationRole, "owner">) => void;
  onLeaveRoom: () => void;
  onStartRoom: () => void;
  onJoinRoom: () => void;
  onNewProject: () => void;
  onRestoreLocal: () => void;
  onSaveLocal: () => void;
  onPngScaleChange: (scale: number) => void;
  onTransparentChange: (checked: boolean) => void;
  onExportSvg: () => void;
  onExportProject: () => void;
  onImportProject: (file: File | null) => void;
}

export function ProjectMenu({
  roomId,
  roomVersion,
  roomInput,
  inviteTokenInput,
  roomRole,
  participants,
  invitationToken,
  hasStoredRoomAccess,
  collaborationStatus,
  collaborationMessage,
  collaborationOpen,
  pngScale,
  transparentExport,
  syncStatus,
  onSetCollaborationOpen,
  onRoomInputChange,
  onInviteTokenInputChange,
  onCreateInvitation,
  onLeaveRoom,
  onStartRoom,
  onJoinRoom,
  onNewProject,
  onRestoreLocal,
  onSaveLocal,
  onPngScaleChange,
  onTransparentChange,
  onExportSvg,
  onExportProject,
  onImportProject,
}: ProjectMenuProps) {
  return (
    <details className="project-menu">
      <summary className="secondary-button" aria-label="打开项目菜单">
        <FolderOpen size={16} /> <span>项目</span>
      </summary>
      <div className="project-menu__popover">
        <section>
          <strong>项目管理</strong>
          <button type="button" aria-label="新建项目" onClick={onNewProject}><Plus size={16} /> 新建项目</button>
          <button type="button" aria-label="恢复本机最近项目" onClick={onRestoreLocal}><FolderOpen size={16} /> 恢复最近项目</button>
          <button type="button" aria-label="保存项目到本机" onClick={onSaveLocal}><Save size={16} /> 保存到本机</button>
        </section>
        <section>
          <strong>导出海报</strong>
          <label>PNG 倍率
            <select aria-label="PNG 导出倍率" value={pngScale} onChange={(event) => onPngScaleChange(Number(event.target.value))}>
              <option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option>
            </select>
          </label>
          <label className="project-menu__check boolean-control checkbox-row"><input type="checkbox" checked={transparentExport} onChange={(event) => onTransparentChange(event.target.checked)} />透明背景</label>
          <button type="button" onClick={onExportSvg}><Download size={16} /> 导出 SVG</button>
        </section>
        <section>
          <strong>在线协作</strong>
          <div className="collaboration-control project-menu__collaboration">
            <button
              type="button"
              className={`secondary-button collaboration-button ${roomId ? "is-connected" : ""}`}
              aria-label="增量在线协作"
              aria-expanded={collaborationOpen}
              onClick={() => onSetCollaborationOpen(!collaborationOpen)}
            >
              <Share2 size={16} /> <span>{roomId ? roomId : "增量协作"}</span>
            </button>
            {collaborationOpen && (
              <section className="collaboration-popover" aria-label="增量协作设置">
                <header>
                  <strong>在线协作</strong>
                  <span>v{roomVersion} · 增量同步</span>
                </header>
                {roomId ? (
                  <>
                    <div className="collaboration-room-code">
                      <b>{roomId}</b>
                      <button type="button" aria-label="复制房间码" onClick={() => void navigator.clipboard?.writeText(roomId)}><Copy size={15} /></button>
                    </div>
                    <small>{roomRole === "owner" ? "创建者" : roomRole === "editor" ? "编辑者" : roomRole === "viewer" ? "仅查看" : "正在确认权限"} · {participants.length} 位协作者</small>
                    {roomRole === "viewer" && <p>当前仅查看，无法修改此工程。</p>}
                    {roomRole === "owner" && <div className="collaboration-invitations">
                      <button type="button" onClick={() => onCreateInvitation("editor")}>邀请编辑者</button>
                      <button type="button" onClick={() => onCreateInvitation("viewer")}>邀请查看者</button>
                      {invitationToken && <button type="button" aria-label="复制邀请凭证" title="邀请凭证仅可使用一次，请通过私密渠道发送" onClick={() => void navigator.clipboard?.writeText(invitationToken)}><Copy size={15} /> 复制邀请凭证</button>}
                    </div>}
                    <small data-collaboration-status={collaborationStatus}>{collaborationMessage}</small>
                    <button type="button" className="collaboration-leave" onClick={onLeaveRoom}><LogOut size={14} /> 断开房间</button>
                  </>
                ) : (
                  <>
                    <p>未连接时不会上传或覆盖工程。创建者可生成可编辑或仅查看的一次性邀请凭证。</p>
                    <button type="button" className="collaboration-create" disabled={collaborationStatus === "connecting"} onClick={onStartRoom}><Share2 size={14} /> 创建房间</button>
                    <div className="collaboration-join">
                      <input aria-label="协作房间码" value={roomInput} maxLength={12} placeholder="输入房间码" onChange={(event) => onRoomInputChange(event.target.value.toUpperCase())} />
                      <input aria-label="协作邀请凭证" value={inviteTokenInput} placeholder="输入邀请凭证" onChange={(event) => onInviteTokenInputChange(event.target.value)} />
                      <button type="button" disabled={!roomInput.trim() || (!inviteTokenInput.trim() && !hasStoredRoomAccess) || collaborationStatus === "connecting"} onClick={onJoinRoom}>加入</button>
                    </div>
                    <small data-collaboration-status={collaborationStatus}>{collaborationMessage}</small>
                  </>
                )}
              </section>
            )}
          </div>
        </section>
        <section>
          <strong>工程文件</strong>
          <button
            type="button"
            aria-label="强制保存到浏览器本地"
            title="立即将当前工程、素材、字体、模板和渲染设置覆盖到浏览器本地存储"
            disabled={syncStatus === "saving"}
            onClick={onSaveLocal}
          >
            <Save size={16} /> {syncStatus === "saving" ? "保存中" : "保存到本机"}
          </button>
          <button type="button" onClick={onExportProject}><PackageOpen size={16} /> 导出工程</button>
          <label className="project-menu__file"><PackageOpen size={16} /> 导入工程
            <input type="file" accept="application/json,.json" aria-label="导入完整工程包" onChange={(event) => onImportProject(event.target.files?.[0] ?? null)} />
          </label>
        </section>
      </div>
    </details>
  );
}
