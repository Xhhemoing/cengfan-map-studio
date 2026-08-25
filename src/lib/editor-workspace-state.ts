import type { UserAsset } from "./assets";
import type { UserFont } from "./fonts";
import { createProjectPackageEnvelope, type ProjectPackage } from "./project-package";
import type { ProjectDocument } from "./project-document";
import type { RenderSettings } from "./render-settings";
import type { SceneSelection } from "./scene-document";
import type { CustomTemplateRecord } from "./template-store";
import type { WorkspaceSession } from "./workspace-session";

/** 编辑器手上那份「完整工作区」:工程 + 素材 + 字体 + 自定义模板 + 渲染设置。 */
export interface EditorWorkspaceSnapshot {
  project: ProjectDocument;
  assets: UserAsset[];
  fonts: UserFont[];
  customTemplates: CustomTemplateRecord[];
  renderSettings: RenderSettings;
}

/** 编辑器工作区在会话、协作与本地存储之间的搬运:全部是纯换算,setState 留给 App。 */

/**
 * 上次会话记下的选区。省份优先于其它对象:省份是唯一带自己坐标的选择,
 * 认不出来的对象一律退回副标题,而不是留空选区(空选区会让属性面板首屏是空的)。
 */
export function restoredSceneSelection(session: WorkspaceSession): SceneSelection {
  if (session.selectedProvince) return { type: "province", province: session.selectedProvince };
  if (session.selectedObject === "cards") return { type: "cards" };
  if (session.selectedObject === "guests") return { type: "guests" };
  if (session.selectedObject) return { type: "asset", id: session.selectedObject };
  return { type: "text", id: "text-note" };
}

/** 一份完整工作区落到编辑器状态上要动的全部 setter。 */
export interface EditorWorkspaceSetters {
  setProject(project: ProjectDocument): void;
  setUserAssets(assets: UserAsset[]): void;
  setUserFonts(fonts: UserFont[]): void;
  setCustomTemplates(templates: CustomTemplateRecord[]): void;
  setRenderSettings(settings: RenderSettings): void;
  clearPreviewCommands(): void;
}

/**
 * 把已还原的工程包铺到编辑器状态上。预览命令必须一起清掉:它们是针对旧工程算出来的,
 * 留着会把新工作区渲染成一份不存在的中间态。
 */
export function applyWorkspacePackage(setters: EditorWorkspaceSetters, restored: ProjectPackage): void {
  setters.setProject(restored.project);
  setters.setUserAssets(restored.assets);
  setters.setUserFonts(restored.fonts);
  setters.setCustomTemplates(restored.customTemplates);
  setters.setRenderSettings(restored.renderSettings);
  setters.clearPreviewCommands();
}

/**
 * 送往协作房间的这一份工程包。历史要清空:撤销栈是本地的私事,
 * 发过去只会让对端的历史被别人的步骤污染,而且白白撑大每一次增量。
 */
export function collaborationPackage(workspace: EditorWorkspaceSnapshot, exportedAt: string): ProjectPackage {
  const pack = createProjectPackageEnvelope(workspace);
  return { ...pack, exportedAt, project: { ...pack.project, history: { past: [], future: [] } } };
}

/**
 * 收到房间的共享工程时保留本地历史:对端不发历史,直接采用会清空本地撤销栈。
 * 版本号照旧递增,让依赖 version 的渲染知道工程确实换过。
 */
export function mergeSharedProject(current: ProjectDocument, incoming: ProjectDocument): ProjectDocument {
  return { ...incoming, history: current.history, version: current.version + 1 };
}
