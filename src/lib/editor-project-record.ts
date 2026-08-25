/**
 * 编辑器当前挂着的项目记录身份,以及围绕它建立的强制保存管线。
 *
 * 四个 ref 必须和 `createWorkspaceSync` 生在一起:保存管线在事件处理器里读它们,
 * 分开放到 App 里只会让「谁负责把 id/name/createdAt 填上」这件事散在两处。
 */
import { useRef, useState } from "react";
import type { BrowserWorkspaceStores } from "./browser-workspace-store";
import { createWorkspaceSync, type EditorProjectRecordRefs } from "./editor-workspace-persistence";
import type {
  LocalWorkspaceOverwrite,
  LocalWorkspaceOverwriteState,
} from "./incremental-workspace-sync";
import type { ProjectStore } from "./project-store";

export interface EditorProjectRecordOptions {
  /** 路由带进来的项目 id;工作台之外的公开编辑器没有项目记录。 */
  projectId: string | undefined;
  stores: BrowserWorkspaceStores;
  projectStore: ProjectStore;
  onStateChange(state: LocalWorkspaceOverwriteState): void;
}

export interface EditorProjectRecord {
  record: EditorProjectRecordRefs;
  workspaceSync: LocalWorkspaceOverwrite;
}

export function useEditorProjectRecord(options: EditorProjectRecordOptions): EditorProjectRecord {
  const idRef = useRef<string | null>(options.projectId ?? null);
  const nameRef = useRef<string | null>(null);
  const createdAtRef = useRef<string>(new Date(0).toISOString());
  const saveErrorRef = useRef<string | null>(null);
  // saveLocal 只在事件处理器(强制保存按钮)经 LocalWorkspaceOverwrite.drain() 触发,属于渲染期之后;
  // 此处 ref 读取发生在保存时刻而非渲染期,react-hooks/refs 无法穿透类间接层,故按行豁免。
  // eslint-disable-next-line react-hooks/refs
  const [state] = useState<EditorProjectRecord>(() => {
    const record: EditorProjectRecordRefs = { idRef, nameRef, createdAtRef, saveErrorRef };
    return {
      record,
      workspaceSync: createWorkspaceSync({
        stores: options.stores,
        projectStore: options.projectStore,
        record,
        onStateChange: options.onStateChange,
      }),
    };
  });
  return state;
}
