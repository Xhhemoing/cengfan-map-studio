/**
 * 协作同步胶水：协作客户端标识与全部协作 ref、远端快照/增量落地到工作区状态
 * （apply-remote），以及本地编辑的防抖增量上传（send/debounce）。
 *
 * 房间生命周期（SSE 订阅、断线补齐、成员/只读/关闭、访问控制）仍由
 * useCollaborationRoom 拥有；本 hook 不改变任何线上协议——上传仍走
 * submitRoomOperations，负载形状（txId/clientId/baseVersion/operations）
 * 与提取前的 App.tsx 完全一致。
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { COLLABORATION_SEND_DELAY_MS } from "../lib/app-constants";
import type { UserAsset } from "../lib/assets";
import {
  CollaborationClientError,
  submitRoomOperations,
} from "../lib/collaboration-client";
import { applyCollaborationOperations } from "../lib/collaboration-operations";
import type { UserFont } from "../lib/fonts";
import { createId } from "../lib/ids";
import type { ProjectDocument } from "../lib/project-document";
import { restoreProjectPackage, type ProjectPackage } from "../lib/project-package";
import type { RenderSettings } from "../lib/render-settings";
import {
  buildCollaborationPackage,
  canSendCollaborationUpdate,
  planCollaborationSend,
  type WorkspaceStateSnapshot,
} from "../lib/studio-editor-helpers";
import type { CustomTemplateRecord } from "../lib/template-store";
import { useCollaborationRoom, type UseCollaborationRoomResult } from "../lib/useCollaborationRoom";

export interface UseCollaborationSyncOptions {
  /** 最新工作区快照（由 useWorkspacePersistence 维护）；发送时从这里取当前内容。 */
  latestWorkspaceRef: { current: WorkspaceStateSnapshot };
  /** 工作区状态本体，仅用于在本地编辑后重新武装防抖计时器。 */
  workspace: WorkspaceStateSnapshot;
  setProject: Dispatch<SetStateAction<ProjectDocument>>;
  setUserAssets: Dispatch<SetStateAction<UserAsset[]>>;
  setUserFonts: Dispatch<SetStateAction<UserFont[]>>;
  setCustomTemplates: Dispatch<SetStateAction<CustomTemplateRecord[]>>;
  setRenderSettings: Dispatch<SetStateAction<RenderSettings>>;
  /** 远端内容落地后把本地保存状态标记为待保存。 */
  markWorkspacePending: () => void;
}

export type CollaborationSync = UseCollaborationRoomResult & { clientId: string };

export function useCollaborationSync(options: UseCollaborationSyncOptions): CollaborationSync {
  const { latestWorkspaceRef } = options;
  const [clientId] = useState(() => createId("collab-client"));

  const baselineRef = useRef<ProjectPackage | null>(null);
  const versionRef = useRef(0);
  const roomRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const suppressSendRef = useRef(false);
  const backfillInFlightRef = useRef(false);

  const currentPackage = (exportedAt = new Date().toISOString()): ProjectPackage =>
    buildCollaborationPackage(latestWorkspaceRef.current, exportedAt);

  const applyPackage = (pack: ProjectPackage, _version: number): ProjectPackage => {
    const restored = restoreProjectPackage(pack);
    options.setProject((current) => ({ ...restored.project, history: current.history, version: current.version + 1 }));
    options.setUserAssets(restored.assets);
    options.setUserFonts(restored.fonts);
    options.setCustomTemplates(restored.customTemplates);
    options.setRenderSettings(restored.renderSettings);
    options.markWorkspacePending();
    return restored;
  };

  const collaboration = useCollaborationRoom({
    clientId,
    currentPackage,
    applyPackage,
    baselineRef,
    versionRef,
    roomRef,
    accessTokenRef,
    suppressSendRef,
    backfillInFlightRef,
  });

  const { project, assets, fonts, customTemplates, renderSettings } = options.workspace;
  useEffect(() => {
    const { roomId, roomAccessToken } = collaboration;
    if (!roomId || !roomAccessToken) return;
    if (!canSendCollaborationUpdate(collaboration, Boolean(baselineRef.current))) return;
    if (suppressSendRef.current) {
      suppressSendRef.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      const baseline = baselineRef.current;
      if (!baseline || roomRef.current !== roomId) return;
      const operations = planCollaborationSend(baseline, latestWorkspaceRef.current);
      if (operations.length === 0) return;
      const txId = createId("collab-op");
      collaboration.setCollaborationStatus("syncing");
      collaboration.setCollaborationMessage(`正在同步 ${operations.length} 项增量修改`);
      try {
        const acknowledged = await submitRoomOperations<ProjectPackage>(roomId, roomAccessToken, {
          txId,
          clientId,
          baseVersion: versionRef.current,
          operations,
        });
        baselineRef.current = applyCollaborationOperations(baseline, operations);
        versionRef.current = acknowledged.version;
        collaboration.setRoomVersion(acknowledged.version);
        collaboration.setCollaborationStatus("connected");
        collaboration.setCollaborationMessage(acknowledged.rebasedFromVersion === undefined ? "增量同步已完成" : "已自动合并互不冲突的并发修改");
      } catch (error) {
        if (error instanceof CollaborationClientError && error.code === "VERSION_CONFLICT") {
          collaboration.setCollaborationStatus("conflict");
          collaboration.setCollaborationMessage("同一内容被其他成员修改；已暂停上传，请重新加入房间确认最新版本");
        } else {
          collaboration.setCollaborationStatus("error");
          collaboration.setCollaborationMessage(error instanceof Error ? error.message : "增量同步失败");
        }
      }
    }, COLLABORATION_SEND_DELAY_MS);
    return () => window.clearTimeout(timer);
    // Depend on the individual room fields rather than the whole controller
    // object so the debounce only re-arms when the room or workspace changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, customTemplates, project, renderSettings, collaboration.roomAccessToken, collaboration.roomId, collaboration.roomRole, collaboration.roomReadonly, collaboration.roomClosed, assets, fonts]);

  return { ...collaboration, clientId };
}
