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
 * 优先读取完整选区,并兼容旧省份/对象键。只有真实工作区水合后才传 project 校验
 * 文字/素材是否存在:项目加载前的浏览器镜像可能属于另一个项目,不能据此清除选区。
 */
function rememberedSceneSelection(session: WorkspaceSession): SceneSelection {
  if (session.selection) return session.selection;
  if (session.selectedProvince) return { type: "province", province: session.selectedProvince };
  if (session.selectedObject === "cards") return { type: "cards" };
  if (session.selectedObject === "guests") return { type: "guests" };
  if (session.selectedObject) return { type: "asset", id: session.selectedObject };
  return { type: "text", id: "text-note" };
}

export function restoredSceneSelection(session: WorkspaceSession, project?: ProjectDocument): SceneSelection {
  const selection = rememberedSceneSelection(session);
  if (!project) return { ...selection };
  const missing = (selection.type === "text" && !project.textElements.some((element) => element.id === selection.id))
    || (selection.type === "asset" && !project.assetElements.some((element) => element.id === selection.id));
  if (missing) {
    return project.textElements.some((element) => element.id === "text-note")
      ? { type: "text", id: "text-note" }
      : { type: "canvas" };
  }
  return { ...selection };
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
