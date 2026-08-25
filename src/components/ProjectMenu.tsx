/**
 * Project menu popover for the studio top bar: project management, poster
 * export options, incremental collaboration, and project file I/O.
 * Pure presentation — all state and callbacks flow in through props, except
 * the room nickname, a device-local preference read/written here.
 */
import { useState } from "react";
import { Copy, Download, FolderOpen, LogOut, PackageOpen, Plus, Save, Share2 } from "lucide-react";
import type { CollaborationRole, RoomAccessAction, RoomMember, RoomPersistenceOutcome } from "../lib/collaboration-client";
import {
  describeRole,
  loadDisplayName,
  mergeRoomRoster,
  saveDisplayName,
} from "../lib/collaboration-identity";
import type { LocalOverwriteStatus } from "../lib/incremental-workspace-sync";
import { PROJECT_PACKAGE_FILE_ACCEPT } from "../lib/project-package";
import { DisplayNameInput } from "./collaboration/DisplayNameInput";
import { RoomRoster } from "./collaboration/RoomRoster";

export type CollaborationStatus = "idle" | "connecting" | "connected" | "syncing" | "conflict" | "error" | "closed";

/**
 * 落盘降级的两种后果要给两种交代。跳过的房间重启后不会回来,"及时导出备份"是唯一的出路;
 * 裁剪的房间连快照带版本都还在,只是最近的增量历史没了——对它说"重启后将无法恢复"是假话,
 * 而假话会让房里的人做出多余的决定,或者干脆不再相信这条提示。
 *
 * 只认布尔位的旧服务端说不出是哪一种,沿用跳过那句:宁可把裁剪说重,不能把死亡说轻。
 */
const PERSISTENCE_NOTE_COPY: Record<"skipped" | "trimmed", string> = {
  skipped: "该房间体量超过服务器持久化上限，服务器重启后将无法恢复，请及时导出备份",
  trimmed: "该房间体量超过服务器持久化上限，重启后房间会恢复，但最近的增量历史会丢失，长时间离线的成员需要重新加载完整快照，建议导出备份",
};

/**
 * 上面两句说的是"这一间房太大了",这一句说的是"整台服务器此刻写不进磁盘"——两件事互不替代,
 * 可以同时成立,所以这是一条附加的提示而不是替换。落盘连续失败期间三态与时刻报的都还是上一次
 * **成功**落盘,房间看上去一切正常;真出事的时候丢的是这段时间里的全部改动,而不只是历史。
 */
const PERSIST_FAILURE_NOTE_COPY = "服务器暂时无法写入磁盘，此期间的改动在服务器重启后可能丢失，请及时导出备份";

export interface ProjectMenuProps {
  roomId: string | null;
  roomVersion: number;
  roomInput: string;
  inviteTokenInput: string;
  roomRole: CollaborationRole | null;
  members: RoomMember[];
  ownClientId: string;
  roomReadonly: boolean;
  roomClosed: boolean;
  /**
   * 房间已过期/已失效:订阅已经永久停止。可选是为了让接线方按自己的节奏传入,
   * 缺省视为未过期。
   */
  roomExpired?: boolean;
  /** 传输层不可达:重试仍在继续,本地修改不会丢。 */
  collaborationOffline?: boolean;
  /**
   * 服务端上一次落盘没能完整写下这个房间:同步一切正常,但落盘不完整。跳过与裁剪都会置位,
   * 它只决定要不要出提示。可选是为了让接线方按自己的节奏传入,缺省视为服务端没有给出说法。
   */
  roomPersistenceDegraded?: boolean;
  /**
   * 上一次落盘对这个房间的处置(R7-2 的 `persistence.outcome`),决定提示说什么。缺省(只认
   * 布尔位的旧服务端)沿用跳过那句。
   */
  roomPersistenceKind?: RoomPersistenceOutcome | null;
  /**
   * 服务端当前落盘失败连击的最近一次失败时刻(R8-2 的 `persistence.lastFailureAt`),没有连击
   * 时为 `null`。缺省(旧接线方还没传)同样视为没有连击:不替服务端宣布磁盘坏了。
   */
  roomPersistFailureAt?: number | null;
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
  onSetRoomAccess: (action: RoomAccessAction) => void;
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
  members,
  ownClientId,
  roomReadonly,
  roomClosed,
  roomExpired = false,
  collaborationOffline = false,
  roomPersistenceDegraded = false,
  roomPersistenceKind = null,
  roomPersistFailureAt = null,
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
  onSetRoomAccess,
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
  // 终局与离线是互斥的两种处境:终局房间不会再重连,离线只是等网络回来,提示语不能混用。
  const terminalKind = roomClosed ? "closed" : roomExpired ? "expired" : undefined;
  const isOffline = collaborationOffline && terminalKind === undefined;
  // 持久化降级排在最后:房间已经死了的时候"及时导出备份"无从执行,断线的时候连接本身更急。
  // 只有一间正在正常同步的房间才需要被告知它活不过服务端重启。
  const showPersistenceNote = roomPersistenceDegraded && Boolean(roomId) && terminalKind === undefined && !isOffline;
  // 服务端说得出处置就按处置挑文案;说不出(或说的是 persisted 这种和降级矛盾的组合)沿用跳过那句。
  const persistenceNoteKind = roomPersistenceKind === "trimmed" || roomPersistenceKind === "skipped" ? roomPersistenceKind : undefined;
  // 落盘失败排在容量降级之后,但两者不互斥:一间被裁剪过的房间同样会遇上磁盘写不进去,
  // 那是两个各自成立的事实。终局与离线仍然把它压下去——房间已经没了的时候"及时导出备份"
  // 无从执行,断线的时候连接本身更急。
  const showPersistFailureNote = roomPersistFailureAt !== null && Boolean(roomId) && terminalKind === undefined && !isOffline;
  // Raw input stays in state for a natural typing feel; storage always holds
  // the normalized value, and the hook normalizes again on create/join.
  const [displayName, setDisplayName] = useState(() => loadDisplayName());
  const handleDisplayNameChange = (next: string) => {
    setDisplayName(next);
    saveDisplayName(next);
  };
  return (
    <details className="project-menu">
      <summary className="secondary-button" aria-label="打开项目与协作菜单">
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
                    <DisplayNameInput value={displayName} connected onChange={handleDisplayNameChange} />
                    <small>{describeRole(roomRole).label} · {members.length} 位成员</small>
                    <RoomRoster entries={mergeRoomRoster({ members, ownClientId, ownDisplayName: displayName })} />
                    <small>模式：{roomClosed ? "已关闭" : roomExpired ? "已失效" : roomReadonly ? "只读" : "可编辑"}</small>
                    {roomClosed ? (
                      <p className="collaboration-closed">房间已关闭，无法继续同步或编辑。</p>
                    ) : roomExpired ? (
                      <p className="collaboration-closed" role="status" data-collaboration-terminal="expired">
                        房间已过期或已失效，不会再自动重连。请重新创建房间，或让创建者重新邀请。
                      </p>
                    ) : (
                      <>
                        {roomRole === "viewer" && <p>当前仅查看，无法修改此工程。</p>}
                        {roomReadonly && roomRole !== "owner" && <p>房间为只读模式，无法修改此工程。</p>}
                        {roomRole === "owner" && <div className="collaboration-invitations">
                          <button type="button" onClick={() => onCreateInvitation("editor")}>邀请编辑者</button>
                          <button type="button" onClick={() => onCreateInvitation("viewer")}>邀请查看者</button>
                          {invitationToken && <button type="button" aria-label="复制邀请凭证" title="邀请凭证仅可使用一次，请通过私密渠道发送" onClick={() => void navigator.clipboard?.writeText(invitationToken)}><Copy size={15} /> 复制邀请凭证</button>}
                          <button type="button" onClick={() => onSetRoomAccess("set-readonly")}>{roomReadonly ? "恢复编辑" : "设为只读"}</button>
                          <button type="button" onClick={() => onSetRoomAccess("close")}>关闭房间</button>
                        </div>}
                      </>
                    )}
                    {isOffline && (
                      <p className="collaboration-offline" role="status" data-collaboration-offline="true">
                        网络已断开，正在自动重连；本地修改会保留，恢复后自动续传。
                      </p>
                    )}
                    {showPersistenceNote && (
                      <p
                        className="collaboration-persist-degraded"
                        role="status"
                        data-collaboration-persist="degraded"
                        data-collaboration-persist-kind={persistenceNoteKind}
                      >
                        {PERSISTENCE_NOTE_COPY[persistenceNoteKind ?? "skipped"]}
                      </p>
                    )}
                    {showPersistFailureNote && (
                      <p
                        className="collaboration-persist-degraded collaboration-persist-failure"
                        role="status"
                        data-collaboration-persist-failure="true"
                      >
                        {PERSIST_FAILURE_NOTE_COPY}
                      </p>
                    )}
                    <small data-collaboration-status={collaborationStatus} data-collaboration-terminal={terminalKind}>{collaborationMessage}</small>
                    <button type="button" className="collaboration-leave" onClick={onLeaveRoom}><LogOut size={14} /> 断开房间</button>
                  </>
                ) : (
                  <>
                    <p>未连接时不会上传或覆盖工程。创建者可生成可编辑或仅查看的一次性邀请凭证。</p>
                    <DisplayNameInput value={displayName} connected={false} onChange={handleDisplayNameChange} />
                    <button type="button" className="collaboration-create" disabled={collaborationStatus === "connecting"} onClick={onStartRoom}><Share2 size={14} /> 创建房间</button>
                    <div className="collaboration-join">
                      <input aria-label="协作房间码" value={roomInput} maxLength={12} placeholder="输入房间码" onChange={(event) => onRoomInputChange(event.target.value.toUpperCase())} />
                      <input aria-label="协作邀请凭证" value={inviteTokenInput} placeholder="输入邀请凭证" onChange={(event) => onInviteTokenInputChange(event.target.value)} />
                      <button type="button" disabled={!roomInput.trim() || (!inviteTokenInput.trim() && !hasStoredRoomAccess) || collaborationStatus === "connecting"} onClick={onJoinRoom}>加入</button>
                    </div>
                    {roomExpired && (
                      <p className="collaboration-closed" role="status" data-collaboration-terminal="expired">
                        房间已过期或已失效，不会再自动重连。请重新创建房间，或让创建者重新邀请。
                      </p>
                    )}
                    {isOffline && (
                      <p className="collaboration-offline" role="status" data-collaboration-offline="true">
                        网络已断开，本地修改会保留，恢复后自动续传。
                      </p>
                    )}
                    <small data-collaboration-status={collaborationStatus} data-collaboration-terminal={terminalKind}>{collaborationMessage}</small>
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
            <input type="file" accept={PROJECT_PACKAGE_FILE_ACCEPT} aria-label="导入完整工程包" onChange={(event) => onImportProject(event.target.files?.[0] ?? null)} />
          </label>
        </section>
      </div>
    </details>
  );
}
