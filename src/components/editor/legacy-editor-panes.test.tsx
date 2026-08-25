// R12-1 从 App.tsx 拆出的旧版编辑器中栏(画布舞台)与右栏(属性面板 + 项目摘要)的直接契约。
// App 分片 pin(src/App.shell-layout.test.tsx)从 App 那一侧盯同一份 DOM;
// 这里从组件这一侧盯缩放数学、id/class 与摘要文案,拆分后两侧应当同时为真。
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { createInitialProject } from "../../lib/app-initialization";
import type { LocalWorkspaceOverwriteState } from "../../lib/incremental-workspace-sync";
import { buildProvinceSummary } from "../../lib/project-data";
import { LegacyEditorInspector } from "./LegacyEditorInspector";
import { LegacyEditorStage } from "./LegacyEditorStage";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function mount(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(node));
  return container;
}

const noop = () => {};

function createStageActions() {
  return {
    moveText: noop,
    moveAsset: noop,
    resizeAsset: noop,
    moveProvinceTexture: noop,
    resizeMapImage: noop,
    moveCard: noop,
    moveGuests: noop,
  };
}

function createInspectorActions() {
  return {
    patchScene: noop,
    resetSceneTarget: noop,
    removeText: noop,
    removeAsset: noop,
    duplicateAsset: noop,
    changeAssetLayer: noop,
    applyFont: noop,
  };
}

function createLibraryActions() {
  return { addUserAsset: noop, uploadUserFont: noop, deleteUserFont: noop };
}

describe("LegacyEditorStage", () => {
  const project = createInitialProject();

  function renderStage(zoomPercent: number): HTMLDivElement {
    return mount(
      <LegacyEditorStage
        stageRef={createRef<HTMLDivElement>()}
        project={project}
        renderProject={project}
        posterRef={createRef<SVGSVGElement>()}
        zoomPercent={zoomPercent}
        selection={{ type: "canvas" }}
        selectedStudentId={null}
        userFonts={[]}
        showGrid={false}
        gridSize={20}
        renderIntervalMs={0}
        canvasActions={createStageActions()}
        onSelect={noop}
        onSelectStudent={noop}
        onCardPositionsResolved={noop}
      />,
    );
  }

  it("keeps the editor-area / canvas-stage / zoom-shell nesting around the poster", () => {
    const container = renderStage(100);

    const inner = container.querySelector(
      "section.editor-area > .canvas-stage > .canvas-zoom-shell > .canvas-zoom-inner",
    );
    expect(inner).not.toBeNull();
    expect(inner?.querySelector("svg")).not.toBeNull();
  });

  it("sizes the zoom shell by the rounded scaled canvas and scales the inner layer", () => {
    const container = renderStage(80);
    const shell = container.querySelector<HTMLElement>(".canvas-zoom-shell")!;
    const inner = container.querySelector<HTMLElement>(".canvas-zoom-inner")!;

    expect(shell.style.width).toBe(`${Math.round(project.canvas.width * 0.8)}px`);
    expect(shell.style.height).toBe(`${Math.round(project.canvas.height * 0.8)}px`);
    expect(inner.style.width).toBe(`${project.canvas.width}px`);
    expect(inner.style.height).toBe(`${project.canvas.height}px`);
    expect(inner.style.transform).toBe("scale(0.8)");
    expect(inner.style.transformOrigin).toBe("top left");
  });

  it("hands the stage container and the poster node back to the caller's refs", () => {
    const stageRef = createRef<HTMLDivElement>();
    const posterRef = createRef<SVGSVGElement>();
    const container = mount(
      <LegacyEditorStage
        stageRef={stageRef}
        project={project}
        renderProject={project}
        posterRef={posterRef}
        zoomPercent={100}
        selection={{ type: "canvas" }}
        selectedStudentId={null}
        userFonts={[]}
        showGrid={false}
        gridSize={20}
        renderIntervalMs={0}
        canvasActions={createStageActions()}
        onSelect={noop}
        onSelectStudent={noop}
        onCardPositionsResolved={noop}
      />,
    );

    expect(stageRef.current).toBe(container.querySelector(".canvas-stage"));
    expect(posterRef.current).toBe(container.querySelector("svg"));
  });
});

describe("LegacyEditorInspector", () => {
  const project = createInitialProject();
  const summary = buildProvinceSummary(project.students);

  function renderInspector(
    open: boolean,
    syncState: LocalWorkspaceOverwriteState,
    statusMessage = "",
  ): HTMLDivElement {
    return mount(
      <LegacyEditorInspector
        open={open}
        project={project}
        renderProject={project}
        summary={summary}
        selection={{ type: "canvas" }}
        userFonts={[]}
        syncState={syncState}
        statusMessage={statusMessage}
        canvasActions={createInspectorActions()}
        libraryActions={createLibraryActions()}
        onOpenGlobalSettings={noop}
      />,
    );
  }

  // 两个实例同时挂载时 id 选择器会被 document.getElementById 抢先解析,
  // 这里按标签取各自容器内的 aside,再分别断言 id 与 class。
  it("keeps the inspector id and toggles is-open from the open flag alone", () => {
    const closed = renderInspector(false, { status: "idle", savedAt: null }).querySelector("aside")!;
    expect(closed.id).toBe("editor-inspector");
    expect(closed.className).toBe("inspector");

    const opened = renderInspector(true, { status: "idle", savedAt: null }).querySelector("aside")!;
    expect(opened.id).toBe("editor-inspector");
    expect(opened.className).toBe("inspector is-open");
  });

  it("summarises students, destinations and history counts under 项目摘要", () => {
    const container = renderInspector(false, { status: "idle", savedAt: null });
    const details = container.querySelector(".project-summary")!;

    expect(details.querySelector("summary")?.textContent).toBe("项目摘要");
    const numbers = Array.from(details.querySelectorAll(".summary-number")).map((node) => node.textContent);
    expect(numbers).toEqual([`${project.students.length}学生`, `${summary.length}目的省市`]);
    expect(details.textContent).toContain(
      `已记录 ${project.history.past.length} 步，可重做 ${project.history.future.length} 步。`,
    );
  });

  it("reports every local overwrite state through data-sync-status and its label", () => {
    const labels: Array<[LocalWorkspaceOverwriteState["status"], string]> = [
      ["saving", "正在覆盖本地数据"],
      ["saved", "全部数据已保存"],
      ["failed", "本地保存失败"],
      ["idle", "有未保存修改"],
    ];
    for (const [status, label] of labels) {
      const container = renderInspector(false, { status, savedAt: null });
      const node = container.querySelector<HTMLElement>(".project-summary .status")!;
      expect(node.dataset.syncStatus).toBe(status);
      expect(node.textContent).toBe(label);
    }
  });

  it("appends the last save time and the status message as panel notes", () => {
    const savedAt = "2026-01-02T03:04:05.000Z";
    const container = renderInspector(false, { status: "saved", savedAt }, "已从本地完整镜像恢复工作区");
    const notes = Array.from(container.querySelectorAll(".project-summary .panel-note")).map(
      (node) => node.textContent,
    );

    expect(notes[0]).toBe(
      `本地：仅点击强制保存时覆盖本地数据 · ${new Date(savedAt).toLocaleTimeString("zh-CN", { hour12: false })}`,
    );
    expect(notes[1]).toBe("已从本地完整镜像恢复工作区");
  });

  it("drops the status note when there is no message", () => {
    const container = renderInspector(false, { status: "idle", savedAt: null });
    expect(container.querySelectorAll(".project-summary .panel-note")).toHaveLength(1);
  });
});
