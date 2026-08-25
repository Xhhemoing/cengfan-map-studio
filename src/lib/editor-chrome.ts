import { RENDER_SETTINGS_KEY } from "./app-constants";
import { buildFontFaceCss, type UserFont } from "./fonts";
import { DEFAULT_RENDER_SETTINGS, normalizeRenderSettings, type RenderSettings } from "./render-settings";
import type { SceneSelection } from "./scene-document";
import type { WorkspaceSession } from "./workspace-session";
import type { WorkflowStageId } from "./workflow-stages";

/** 编辑器外壳的浏览器侧状态:渲染设置、会话快照、字体样式表。 */

type StorageLike = Pick<Storage, "getItem">;

/**
 * 渲染设置存的是用户机器上的偏好,坏数据不该拦住编辑器启动:任何解析失败都退回默认值。
 * 取 storage 用回调传入 —— 隐私模式下连读 `window.localStorage` 本身都会抛,
 * 所以这一步也必须在 try 里面。
 */
export function loadStoredRenderSettings(getStorage: () => StorageLike | null | undefined): RenderSettings {
  try {
    const storage = getStorage();
    if (!storage) return { ...DEFAULT_RENDER_SETTINGS };
    return normalizeRenderSettings(JSON.parse(storage.getItem(RENDER_SETTINGS_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_RENDER_SETTINGS };
  }
}

/**
 * 会话快照只记「回来时该停在哪」。省份/对象两个选区键在没有选中时要真的不写入,
 * 留一个 undefined 会被序列化成缺席以外的状态,下次启动就恢复出一个并不存在的选区。
 */
export function nextWorkspaceSession(
  base: WorkspaceSession,
  input: { stage: WorkflowStageId; selection: SceneSelection; savedAt?: string },
): WorkspaceSession {
  const { selectedProvince: _savedProvince, selectedObject: _savedObject, ...sessionBase } = base;
  const selection = input.selection;
  const selectedProvince = selection.type === "province" ? selection.province : undefined;
  const selectedObject = selection.type === "asset"
    ? selection.id
    : selection.type === "cards" || selection.type === "guests"
      ? selection.type
      : undefined;
  return {
    ...sessionBase,
    stage: input.stage,
    ...(selectedProvince ? { selectedProvince } : {}),
    ...(selectedObject ? { selectedObject } : {}),
    savedAt: input.savedAt ?? new Date().toISOString(),
  };
}

export const USER_FONT_STYLE_ELEMENT_ID = "cengfan-user-fonts";

/**
 * 用户字体的 @font-face 挂在一个复用的 style 节点上:每次都新建节点的话,
 * 删掉的字体会因为旧节点还在而继续生效。
 */
export function mountUserFontFaces(fonts: UserFont[], doc: Document | undefined = typeof document === "undefined" ? undefined : document): void {
  if (!doc) return;
  let style = doc.getElementById(USER_FONT_STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = USER_FONT_STYLE_ELEMENT_ID;
    doc.head.appendChild(style);
  }
  style.textContent = buildFontFaceCss(fonts);
}
