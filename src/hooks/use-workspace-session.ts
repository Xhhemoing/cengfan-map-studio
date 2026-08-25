/**
 * 编辑器会话（上次所处阶段与画布选中对象）的一次性加载与自动保存。
 * 会话独立于工程数据，仅存 localStorage；读写失败时静默降级。
 */
import { useEffect, useState } from "react";
import { loadBrowserValue } from "../lib/app-initialization";
import type { SceneSelection } from "../lib/scene-document";
import { buildWorkspaceSessionUpdate } from "../lib/studio-editor-helpers";
import { loadWorkspaceSession, saveWorkspaceSession, type WorkspaceSession } from "../lib/workspace-session";
import type { WorkflowStageId } from "../lib/workflow-stages";

/** 挂载时读取一次上次会话；之后保持不变（作为阶段/选中对象的初始值来源）。 */
export function useWorkspaceSessionState(): WorkspaceSession {
  const [session] = useState(() => typeof window === "undefined"
    ? loadWorkspaceSession(null)
    : loadBrowserValue(() => loadWorkspaceSession(window.localStorage), loadWorkspaceSession(null)));
  return session;
}

/** 阶段或选中对象变化时把最新会话写回 localStorage。 */
export function useWorkspaceSessionAutosave(
  session: WorkspaceSession,
  stage: WorkflowStageId,
  selection: SceneSelection,
): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = loadBrowserValue(() => window.localStorage, null);
    if (!storage) return;
    saveWorkspaceSession(storage, buildWorkspaceSessionUpdate(session, stage, selection, new Date().toISOString()));
  }, [session, stage, selection]);
}
