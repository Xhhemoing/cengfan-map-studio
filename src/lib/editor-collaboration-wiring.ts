/**
 * 编辑器与协作房间之间的接线:共享 ref、送出/收下工作区包、愈合探测与去抖上传。
 *
 * 房间控制器(`useCollaborationRoom`)只管房间自身;这一层负责把「工作区」这一侧接上去,
 * 两边共享同一组 ref——各持一份的话,基线与版本会立刻分叉。
 */
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { UserAsset } from "./assets";
import {
  armCollaborationSend,
  createCollaborationHealTracker,
} from "./collaboration-send";
import {
  applyWorkspacePackage,
  collaborationPackage,
  mergeSharedProject,
  type EditorWorkspaceSnapshot,
} from "./editor-workspace-state";
import type { UserFont } from "./fonts";
import type { LocalWorkspaceOverwrite } from "./incremental-workspace-sync";
import type { ProjectDocument } from "./project-document";
import { restoreProjectPackage, type ProjectPackage } from "./project-package";
import type { RenderSettings } from "./render-settings";
import type { CustomTemplateRecord } from "./template-store";
import {
  useCollaborationRoom,
  type UseCollaborationRoomRefs,
  type UseCollaborationRoomResult,
} from "./useCollaborationRoom";

/** 远端工程包要落到的编辑器状态入口。工程走函数式 setState,历史才能就地保留。 */
export interface CollaborationWorkspaceSink {
  setProject: Dispatch<SetStateAction<ProjectDocument>>;
  setUserAssets(assets: UserAsset[]): void;
  setUserFonts(fonts: UserFont[]): void;
  setCustomTemplates(templates: CustomTemplateRecord[]): void;
  setRenderSettings(settings: RenderSettings): void;
  clearPreviewCommands(): void;
}

export interface EditorCollaborationOptions {
  clientId: string;
  /** 送出 effect 的重新武装判据:工作区任一部分变了就重新去抖上传。 */
  project: ProjectDocument;
  assets: UserAsset[];
  fonts: UserFont[];
  customTemplates: CustomTemplateRecord[];
  renderSettings: RenderSettings;
  readWorkspace(): EditorWorkspaceSnapshot;
  workspaceSync: LocalWorkspaceOverwrite;
  sink: CollaborationWorkspaceSink;
}

export function useEditorCollaboration(options: EditorCollaborationOptions): UseCollaborationRoomResult {
  const {
    clientId,
    project,
    assets,
    fonts,
    customTemplates,
    renderSettings,
    readWorkspace,
    workspaceSync,
    sink,
  } = options;

  const collaborationBaselineRef = useRef<ProjectPackage | null>(null);
  const collaborationVersionRef = useRef(0);
  const collaborationRoomRef = useRef<string | null>(null);
  const collaborationAccessTokenRef = useRef<string | null>(null);
  const suppressCollaborationSendRef = useRef(false);
  const backfillInFlightRef = useRef(false);
  // 房间控制器与送出侧共享同一组 ref:两边各持一份的话,基线与版本会立刻分叉。
  const collaborationRefs: UseCollaborationRoomRefs = {
    baselineRef: collaborationBaselineRef,
    versionRef: collaborationVersionRef,
    roomRef: collaborationRoomRef,
    accessTokenRef: collaborationAccessTokenRef,
    suppressSendRef: suppressCollaborationSendRef,
    backfillInFlightRef,
  };

  const currentCollaborationPackage = (exportedAt = new Date().toISOString()): ProjectPackage =>
    collaborationPackage(readWorkspace(), exportedAt);

  const applySharedPackage = (pack: ProjectPackage, _version: number): ProjectPackage => {
    const restored = restoreProjectPackage(pack);
    applyWorkspacePackage({
      setProject: () => sink.setProject((current) => mergeSharedProject(current, restored.project)),
      setUserAssets: sink.setUserAssets,
      setUserFonts: sink.setUserFonts,
      setCustomTemplates: sink.setCustomTemplates,
      setRenderSettings: sink.setRenderSettings,
      clearPreviewCommands: sink.clearPreviewCommands,
    }, restored);
    workspaceSync.markPending();
    return restored;
  };

  const collaboration = useCollaborationRoom({
    clientId,
    currentPackage: currentCollaborationPackage,
    applyPackage: applySharedPackage,
    ...collaborationRefs,
  });

  /**
   * 卸载之后 ref 还活着,但组件已经不在树上:在途上传的回执既不能改基线,也不能再
   * 对着卸载的树 setState。StrictMode 会先卸载再重挂,所以每次挂载都要重新置位。
   */
  const collaborationMountedRef = useRef(true);
  useEffect(() => {
    collaborationMountedRef.current = true;
    return () => {
      collaborationMountedRef.current = false;
    };
  }, []);

  // 愈合探测只置位标记、不额外触发渲染:它的两个信号同时也是送出 effect 的依赖,而
  // effect 按声明顺序执行,标记在同一次 commit 里先于送出 effect 就绪。
  const [collaborationHeal] = useState(createCollaborationHealTracker);
  useEffect(() => {
    collaborationHeal.observe({
      roomId: collaboration.roomId,
      connectionHealCount: collaboration.connectionHealCount,
      roomVersion: collaboration.roomVersion,
    });
  }, [collaborationHeal, collaboration.connectionHealCount, collaboration.roomId, collaboration.roomVersion]);

  useEffect(() => armCollaborationSend({
    clientId,
    room: collaboration,
    refs: { ...collaborationRefs, mountedRef: collaborationMountedRef },
    heal: collaborationHeal,
    controller: collaboration,
    currentPackage: currentCollaborationPackage,
    applyPackage: applySharedPackage,
    // Depend on the individual room fields rather than the whole controller
    // object so the debounce only re-arms when the room or workspace changes.
    // connectionHealCount/roomVersion are the heal signals: without them a diff
    // stranded by a partition waits for the next user edit. The offline flag
    // itself is deliberately not a dependency — the send path now raises it, and
    // re-arming on the raise would retry a doomed upload during the partition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [clientId, customTemplates, project, renderSettings, collaboration.connectionHealCount, collaboration.roomAccessToken, collaboration.roomId, collaboration.roomRole, collaboration.roomReadonly, collaboration.roomClosed, collaboration.roomExpired, collaboration.roomVersion, assets, fonts]);

  return collaboration;
}
