import type { ComponentProps } from "react";
import { dataViews, provinceNames } from "../../lib/app-constants";
import type { createEditorCanvasActions } from "../../lib/editor-canvas-actions";
import type { createEditorLibraryActions } from "../../lib/editor-library-actions";
import type { UserFont } from "../../lib/fonts";
import type { LocalWorkspaceOverwriteState } from "../../lib/incremental-workspace-sync";
import type { ProvinceSummary } from "../../lib/project-data";
import type { ProjectDocument } from "../../lib/project-document";
import type { SceneSelection } from "../../lib/scene-document";
import { InspectorPanel } from "../inspector/InspectorPanel";

type EditorCanvasActions = ReturnType<typeof createEditorCanvasActions>;
type EditorLibraryActions = ReturnType<typeof createEditorLibraryActions>;
type InspectorPanelProps = ComponentProps<typeof InspectorPanel>;

export interface LegacyEditorInspectorProps {
  /** 窄屏下由顶栏的属性面板开关控制,展开时加 `is-open`。 */
  open: boolean;
  /** 摘要里的历史步数读已提交的 project,学生/读图方式读带预览的 renderProject。 */
  project: ProjectDocument;
  renderProject: ProjectDocument;
  summary: ProvinceSummary[];
  selection: SceneSelection;
  userFonts: UserFont[];
  syncState: LocalWorkspaceOverwriteState;
  statusMessage: string;
  canvasActions: Pick<
    EditorCanvasActions,
    | "patchScene"
    | "resetSceneTarget"
    | "removeText"
    | "removeAsset"
    | "duplicateAsset"
    | "changeAssetLayer"
    | "applyFont"
  >;
  libraryActions: Pick<EditorLibraryActions, "addUserAsset" | "uploadUserFont" | "deleteUserFont">;
  onOpenGlobalSettings: InspectorPanelProps["onOpenGlobalSettings"];
}

/**
 * 旧版编辑器右栏:`#editor-inspector` 外壳 + InspectorPanel + 项目摘要折叠区。
 * 摘要里的本地保存状态通过 `data-sync-status` 暴露给测试与样式,文案与 App 内联时逐字一致。
 */
export function LegacyEditorInspector({
  open,
  project,
  renderProject,
  summary,
  selection,
  userFonts,
  syncState,
  statusMessage,
  canvasActions,
  libraryActions,
  onOpenGlobalSettings,
}: LegacyEditorInspectorProps) {
  return (
    <aside id="editor-inspector" className={`inspector${open ? " is-open" : ""}`}>
      <InspectorPanel
        project={renderProject}
        selection={selection}
        userFonts={userFonts}
        onPatch={canvasActions.patchScene}
        onReset={canvasActions.resetSceneTarget}
        onDeleteText={canvasActions.removeText}
        onDeleteAsset={canvasActions.removeAsset}
        onDuplicateAsset={canvasActions.duplicateAsset}
        onLayerChange={canvasActions.changeAssetLayer}
        onAddUserAsset={libraryActions.addUserAsset}
        provinces={provinceNames}
        onOpenGlobalSettings={onOpenGlobalSettings}
        onApplyFont={canvasActions.applyFont}
        onUploadFont={libraryActions.uploadUserFont}
        onDeleteUserFont={libraryActions.deleteUserFont}
      />
      <details className="project-summary">
        <summary>项目摘要</summary>
        <div className="summary-number"><strong>{renderProject.students.length}</strong><span>学生</span></div>
        <div className="summary-number"><strong>{summary.length}</strong><span>目的省市</span></div>
        <p>{dataViews.find((view) => view.id === renderProject.dataView)?.description}</p>
        <p>已记录 {project.history.past.length} 步，可重做 {project.history.future.length} 步。</p>
        <div className="status" data-sync-status={syncState.status}>
          <span />
          {syncState.status === "saving" ? "正在覆盖本地数据" : syncState.status === "saved" ? "全部数据已保存" : syncState.status === "failed" ? "本地保存失败" : "有未保存修改"}
        </div>
        <p className="panel-note">
          本地：仅点击强制保存时覆盖本地数据
          {syncState.savedAt && ` · ${new Date(syncState.savedAt).toLocaleTimeString("zh-CN", { hour12: false })}`}
        </p>
        {statusMessage && <p className="panel-note">{statusMessage}</p>}
      </details>
    </aside>
  );
}
