import { Bot, MapPinned, Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadInitialProject,
  loadBrowserValue,
  WorkbenchBackButton,
} from "./lib/app-initialization";
import { CHINA_PROVINCE_ADJACENCY } from "./lib/map-data";
import {
  COLLABORATION_SEND_DELAY_MS,
  provinceNames,
  dataViews,
  type ActivePanel,
} from "./lib/app-constants";
import {
  buildProvinceSummary,
  type DataViewId,
  type MapTemplateId,
} from "./lib/project-data";
import { createId } from "./lib/ids";

import { AssistantConversationProvider } from "./components/AgentAssistant";
import { ProjectMenu } from "./components/ProjectMenu";
import { WorkflowStageStepper } from "./components/WorkflowStageStepper";
import { StudioAssistantRail } from "./components/StudioAssistantRail";

import "./components/workflow-workspaces.css";
import { GlobalSettingsScreen, type GlobalSettingsSection } from "./components/GlobalSettingsScreen";
import type { DeliveryIssue } from "./components/workspaces/DeliveryWorkspace";

import { ToolbarButton, ToolbarGroup } from "./components/StudioUi";
import {
  WORKFLOW_STAGE_TO_LEGACY_PANEL,
  deriveWorkflowStageProgress,
  type WorkflowStageId,
} from "./lib/workflow-stages";
import { deriveStageOverviewModel, type StageOverviewAction } from "./lib/stage-overview";
import { LEGACY_EDITOR_STORAGE_KEY, loadWorkspaceSession, saveWorkspaceSession } from "./lib/workspace-session";
import { resolveDeliveryIssueLocation } from "./lib/delivery-target";
import { ThemeToggle } from "./components/ThemeToggle";
import { SkinSelector } from "./components/SkinSelector";
import { buildDataHealthSummary, listDataIssues } from "./lib/data-health";
import { computeWorkflowProgress, type WorkflowStepId } from "./lib/workflow-progress";
import {
  applyTransaction,
  createProjectDocument,
  redoTransaction,
  undoTransaction,
  type ProjectDocument,
  type ProjectTransaction,
} from "./lib/project-document";
import {
  removeUserAsset,
  removeUserFont,
} from "./lib/catalog-usage";

import { createSystemTemplate } from "./lib/template-document";
import {
  applyCustomTemplateToProject,
  type CustomTemplateRecord,
} from "./lib/template-store";
import { createDecorationElement } from "./lib/asset-elements";
import { createDefaultScene, type SceneSelection } from "./lib/scene-document";

import { createProvinceThemeTransaction, createSceneTransaction } from "./lib/inspector-operations";
import {
  buildFontFaceCss,
  ensureUserFontsLoaded,
  type UserFont,
} from "./lib/fonts";
import {
  type StudioAsset,
  type UserAsset,
} from "./lib/assets";
import {
  createResourcePack,
  downloadResourcePack,
  mergeResourcePack,
  parseResourcePack,
} from "./lib/resource-pack";
import {
  restoreProjectPackage,
  type ProjectPackage,
} from "./lib/project-package";
import { usePosterExport } from "./lib/usePosterExport";
import { applyTypographyFont, type TypographyTarget } from "./lib/typography";
import type { ImageThemeResult } from "./lib/image-color";
import { listResourceHealthIssues } from "./lib/resource-health";

import { DEFAULT_GRID_SIZE } from "./lib/grid";
import { renderIntervalMs } from "./lib/render-settings";
import {
  CollaborationClientError,
  submitRoomOperations,
} from "./lib/collaboration-client";
import { applyCollaborationOperations, diffCollaborationDocument } from "./lib/collaboration-operations";
import { useCollaborationRoom } from "./lib/useCollaborationRoom";
import { useStudioChrome } from "./hooks/use-studio-chrome";
import { useWorkspacePersistence } from "./hooks/use-workspace-persistence";
import {
  buildAssetUsageMap,
  buildCollaborationPackage,
  buildCustomTemplateDraft,
  createAppendStudentsTransaction,
  createApplySystemTemplateTransaction,
  createDataViewTransaction,
  createReplaceStudentsTransaction,
  createStudentDeleteTransaction,
  createStudentUpdateTransaction,
  createStudentVisibilityToggleTransaction,
  createStudentsVisibilityTransaction,
  freezeCardPositions,
  listContentLayoutIssues,
  resolveLayoutIssueSelection,
  snapCanvasPoint,
  type StudentEditPatch,
} from "./lib/studio-editor-helpers";
import type { StageSlotsContext } from "./components/studio-editor/stage-slots";
import { LegacyEditorChrome } from "./components/studio-editor/LegacyEditorChrome";
import { StudioStageScreen } from "./components/studio-editor/StudioStageScreen";

function StudioApp({ projectId }: { projectId?: string }) {
  const {
    project,
    setProject,
    userAssets,
    setUserAssets,
    userFonts,
    setUserFonts,
    customTemplates,
    setCustomTemplates,
    renderSettings,
    setRenderSettings,
    syncState,
    statusMessage,
    setStatusMessage,
    projectLoading,
    projectMissing,
    workspaceSync,
    latestWorkspaceRef,
    overwriteBrowserStorage,
    handleBackToWorkbench,
  } = useWorkspacePersistence({ projectId });
  const [agentPreview, setAgentPreview] = useState<ProjectDocument | null>(null);
  const [workspaceSession] = useState(() => typeof window === "undefined"
    ? loadWorkspaceSession(null)
    : loadBrowserValue(() => loadWorkspaceSession(window.localStorage), loadWorkspaceSession(null)));
  const [selection, setSelection] = useState<SceneSelection>(() => {
    if (workspaceSession.selectedProvince) return { type: "province", province: workspaceSession.selectedProvince };
    if (workspaceSession.selectedObject === "cards") return { type: "cards" };
    if (workspaceSession.selectedObject === "guests") return { type: "guests" };
    if (workspaceSession.selectedObject) return { type: "asset", id: workspaceSession.selectedObject };
    return { type: "text", id: "text-note" };
  });
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showGrid] = useState(false);
  const [gridSize] = useState(DEFAULT_GRID_SIZE);
  const [collaborationClientId] = useState(() => createId("collab-client"));

  const collaborationBaselineRef = useRef<ProjectPackage | null>(null);
  const collaborationVersionRef = useRef(0);
  const collaborationRoomRef = useRef<string | null>(null);
  const collaborationAccessTokenRef = useRef<string | null>(null);
  const suppressCollaborationSendRef = useRef(false);
  const backfillInFlightRef = useRef(false);

  const posterRef = useRef<SVGSVGElement>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(() => WORKFLOW_STAGE_TO_LEGACY_PANEL[workspaceSession.stage] ?? "roster");
  const [legacyEditorEnabled] = useState(() => typeof window !== "undefined"
    && loadBrowserValue(() => window.localStorage.getItem(LEGACY_EDITOR_STORAGE_KEY) === "1", false));
  const [activeStage, setActiveStage] = useState<WorkflowStageId>(() => legacyEditorEnabled ? "content" : workspaceSession.stage);
  const lastNonTemplateStageRef = useRef<WorkflowStageId>(activeStage === "data" ? "content" : activeStage);
  const [assistantDrawerOpen, setAssistantDrawerOpen] = useState(false);
  const assistantEntryRef = useRef<HTMLButtonElement>(null);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<WorkflowStepId>("roster");
  const [globalSettingsSection, setGlobalSettingsSection] = useState<GlobalSettingsSection | null>(null);
  const chrome = useStudioChrome();
  const { themeMode, setThemeMode, skin, setSkin, resolvedTheme } = chrome;

  const resolvedRenderInterval = renderIntervalMs(renderSettings);
  const workflowProgress = useMemo(() => computeWorkflowProgress(project), [project]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = loadBrowserValue(() => window.localStorage, null);
    if (!storage) return;
    const selectedProvince = selection.type === "province" ? selection.province : undefined;
    const selectedObject = selection.type === "asset" ? selection.id : selection.type === "cards" || selection.type === "guests" ? selection.type : undefined;
    const { selectedProvince: _savedProvince, selectedObject: _savedObject, ...sessionBase } = workspaceSession;
    saveWorkspaceSession(storage, {
      ...sessionBase,
      stage: activeStage,
      ...(selectedProvince ? { selectedProvince } : {}),
      ...(selectedObject ? { selectedObject } : {}),
      savedAt: new Date().toISOString(),
    });
  }, [activeStage, selection, workspaceSession]);
  const dataHealth = useMemo(() => buildDataHealthSummary(project), [project]);
  const dataIssues = useMemo(() => listDataIssues(project), [project]);
  const resourceHealthIssues = useMemo(
    () => listResourceHealthIssues(project, userAssets, userFonts),
    [project, userAssets, userFonts],
  );
  const resourceIssues = useMemo(
    () => resourceHealthIssues.filter((issue) => issue.kind === "resource"),
    [resourceHealthIssues],
  );
  const fontIssues = useMemo(
    () => resourceHealthIssues.filter((issue) => issue.kind === "font"),
    [resourceHealthIssues],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "cengfan-user-fonts";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = buildFontFaceCss(userFonts);
  }, [userFonts]);

  useEffect(() => {
    void ensureUserFontsLoaded(userFonts);
  }, [userFonts]);

  const renderProject = agentPreview ?? project;

  const template = renderProject.templateId;
  const dataView = renderProject.dataView;
  const summary = buildProvinceSummary(renderProject.students);

  const currentCollaborationPackage = (exportedAt = new Date().toISOString()): ProjectPackage =>
    buildCollaborationPackage(latestWorkspaceRef.current, exportedAt);

  const applySharedPackage = (pack: ProjectPackage, _version: number): ProjectPackage => {
    const restored = restoreProjectPackage(pack);
    setProject((current) => ({ ...restored.project, history: current.history, version: current.version + 1 }));
    setUserAssets(restored.assets);
    setUserFonts(restored.fonts);
    setCustomTemplates(restored.customTemplates);
    setRenderSettings(restored.renderSettings);
    workspaceSync.markPending();
    return restored;
  };

  const collaboration = useCollaborationRoom({
    clientId: collaborationClientId,
    currentPackage: currentCollaborationPackage,
    applyPackage: applySharedPackage,
    baselineRef: collaborationBaselineRef,
    versionRef: collaborationVersionRef,
    roomRef: collaborationRoomRef,
    accessTokenRef: collaborationAccessTokenRef,
    suppressSendRef: suppressCollaborationSendRef,
    backfillInFlightRef,
  });

  useEffect(() => {
    const { roomId, roomAccessToken, roomRole, roomReadonly, roomClosed } = collaboration;
    if (!roomId || !roomAccessToken || roomRole === "viewer" || roomReadonly || roomClosed || !collaborationBaselineRef.current) return;
    if (suppressCollaborationSendRef.current) {
      suppressCollaborationSendRef.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      const baseline = collaborationBaselineRef.current;
      if (!baseline || collaborationRoomRef.current !== roomId) return;
      const current = buildCollaborationPackage(latestWorkspaceRef.current, baseline.exportedAt);
      const operations = diffCollaborationDocument(baseline, current);
      if (operations.length === 0) return;
      const txId = createId("collab-op");
      collaboration.setCollaborationStatus("syncing");
      collaboration.setCollaborationMessage(`正在同步 ${operations.length} 项增量修改`);
      try {
        const acknowledged = await submitRoomOperations<ProjectPackage>(roomId, roomAccessToken, {
          txId,
          clientId: collaborationClientId,
          baseVersion: collaborationVersionRef.current,
          operations,
        });
        collaborationBaselineRef.current = applyCollaborationOperations(baseline, operations);
        collaborationVersionRef.current = acknowledged.version;
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
  }, [collaborationClientId, customTemplates, project, renderSettings, collaboration.roomAccessToken, collaboration.roomId, collaboration.roomRole, collaboration.roomReadonly, collaboration.roomClosed, userAssets, userFonts]);

  const commitProject = (next: ProjectDocument) => {
    if (!collaboration.canEdit) {
      collaboration.setCollaborationMessage("当前仅查看，无法修改此工程");
      return;
    }
    setProject(next);
    workspaceSync.markPending();
  };

  const commitProjectTransaction = (transaction: ProjectTransaction) => {
    if (!collaboration.canEdit) {
      collaboration.setCollaborationMessage("当前仅查看，无法修改此工程");
      return;
    }
    setProject((current) => {
      const next = applyTransaction(current, transaction);
      return next;
    });
    setAgentPreview(null);
    workspaceSync.markPending();
  };

  const posterExport = usePosterExport({
    posterRef,
    project,
    userAssets,
    userFonts,
    customTemplates,
    renderSettings,
    applyImportedPackage: (pack) => {
      setUserAssets(pack.assets);
      setUserFonts(pack.fonts);
      setCustomTemplates(pack.customTemplates);
      setRenderSettings(pack.renderSettings);
      commitProject(pack.project);
      setSelection({ type: "canvas" });
    },
    reportStatus: setStatusMessage,
  });

  const canUndo = project.history.past.length > 0;
  const canRedo = project.history.future.length > 0;
  const undoLabel = canUndo
    ? `撤销：${project.history.past[project.history.past.length - 1]?.label ?? "上一步"}`
    : "暂无可撤销操作";
  const redoLabel = canRedo
    ? `重做：${project.history.future[0]?.label ?? "下一步"}`
    : "暂无可重做操作";

  const handleUndo = () => {
    if (!canUndo) return;
    commitProject(undoTransaction(project));
  };

  const handleRedo = () => {
    if (!canRedo) return;
    commitProject(redoTransaction(project));
  };

  const maybeSnap = (x: number, y: number) => snapCanvasPoint(x, y, showGrid, gridSize);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }
      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const resolvedCardPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null);
  const captureCardPositions = (positions: Record<string, { x: number; y: number }>) => {
    resolvedCardPositionsRef.current = positions;
  };
  const freezeCardPositionsForMapChange = (current: ProjectDocument) =>
    freezeCardPositions(current, resolvedCardPositionsRef.current);
  const refreshDisplayFramePositions = () => {
    if (typeof window !== "undefined" && Object.keys(project.cards.positions ?? {}).length > 0
      && !window.confirm("刷新展示框位置会重新按当前地图计算数据框位置，是否继续？")) return;
    resolvedCardPositionsRef.current = null;
    commitProjectTransaction({
      id: createId("tx-display-frame-position-refresh"),
      label: "刷新展示框位置",
      source: "manual",
      apply: (current) => ({ ...current, cards: { ...current.cards, positions: {} } }),
    });
    setStatusMessage("已刷新展示框位置");
  };
  const patchScene = (target: SceneSelection, patch: Record<string, unknown>) => {
    if (target.type !== "map" && target.type !== "province") {
      commitProjectTransaction(createSceneTransaction(target, patch));
      return;
    }
    const transaction = createSceneTransaction(target, patch);
    commitProjectTransaction({
      ...transaction,
      apply: (current) => {
        const next = transaction.apply(current);
        return { ...next, cards: freezeCardPositionsForMapChange(current) };
      },
    });
  };

  const applyFont = (target: TypographyTarget, fontId: string, applyToAll: boolean) => {
    commitProjectTransaction({
      id: createId("tx-typography"),
      label: applyToAll ? "应用字体到全部同类文本" : "修改字体",
      source: "manual",
      apply: (current) => applyTypographyFont(current, target, fontId, applyToAll),
    });
  };

  const resetSceneTarget = (target: Extract<SceneSelection, { type: "canvas" | "map" | "cards" }>) => {
    const defaults = createDefaultScene(project.templateId);
    const patch = target.type === "canvas"
      ? defaults.canvas
      : target.type === "map"
        ? defaults.map
        : defaults.cards;
    patchScene(target, { ...patch } as Record<string, unknown>);
  };

  const addUserAsset = (asset: UserAsset) => {
    if (!asset?.src) {
      setStatusMessage("素材内容为空，未保存");
      return;
    }
    setUserAssets((current) => {
      if (current.some((item) => item.id === asset.id || item.src === asset.src && item.kind === asset.kind && JSON.stringify(item.provinceIds) === JSON.stringify(asset.provinceIds))) {
        setStatusMessage(`素材库已有相同素材：${asset.label}`);
        return current;
      }
      const next = [...current, asset];
      setStatusMessage(`已加入素材库：${asset.label}`);
      return next;
    });
  };

  const replaceUserAsset = (assetId: string, replacement: UserAsset) => {
    setUserAssets((current) => current.map((asset) => asset.id === assetId ? replacement : asset));
    commitProject(
      applyTransaction(project, {
        id: createId(`tx-asset-replace-${assetId}`),
        label: `更新素材：${replacement.label}`,
        source: "manual",
        apply: (current) => ({
          ...current,
          assetElements: current.assetElements.map((element) =>
            element.assetId === assetId ? { ...element, src: replacement.src, label: replacement.label } : element,
          ),
        }),
      }),
    );
    setStatusMessage(`已更新素材：${replacement.label}`);
  };

  const deleteUserAsset = (assetId: string) => {
    const asset = userAssets.find((item) => item.id === assetId);
    setUserAssets((current) => {
      const next = removeUserAsset(current, assetId);
      return next;
    });
    setStatusMessage(asset ? `已从素材库删除：${asset.label}` : "已从素材库删除素材");
  };

  const deleteUserFont = (fontId: string) => {
    const font = userFonts.find((item) => item.id === fontId);
    setUserFonts((current) => {
      const next = removeUserFont(current, fontId);
      return next;
    });
    setStatusMessage(font ? `已删除字体：${font.label}` : "已删除字体");
  };

  const uploadUserFont = (font: UserFont) => {
    setUserFonts((current) => [...current, font]);
    setStatusMessage(`已上传字体：${font.label}`);
  };

  const assetUsageById = useMemo(() => buildAssetUsageMap(project, userAssets), [project, userAssets]);

  const exportResourcePack = () => {
    if (userAssets.length === 0 && userFonts.length === 0) {
      setStatusMessage("本地素材库为空，请先上传图片或字体");
      return;
    }
    const pack = createResourcePack({ assets: userAssets, fonts: userFonts });
    downloadResourcePack(pack);
    setStatusMessage(`已导出资源包：${userAssets.length} 个素材，${userFonts.length} 个字体`);
  };

  const importResourcePack = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { pack, assetCount, fontCount } = parseResourcePack(String(reader.result || ""));
        const merged = mergeResourcePack({
          existingAssets: userAssets,
          existingFonts: userFonts,
          incoming: pack,
        });
        setUserAssets(merged.assets);
        setUserFonts(merged.fonts);
        setStatusMessage(`资源包已导入：新增 ${merged.addedAssets}/${assetCount} 素材，${merged.addedFonts}/${fontCount} 字体`);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "资源包导入失败");
      }
    };
    reader.readAsText(file);
  };


  const handleSceneSelect = (next: SceneSelection) => {
    setSelection(next);
  };

  const locateLayoutIssue = (issue: { id: string }) => {
    const next = resolveLayoutIssueSelection(project, issue.id);
    if (next) setSelection(next);
  };

  const locateDeliveryIssue = (item: DeliveryIssue) => {
    if (item.kind === "data") {
      setSelectedStudentId(item.issue.studentId);
      setActiveStage("data");
      setActivePanel("roster");
      return;
    }
    if (item.kind === "layout") {
      locateLayoutIssue(item.issue);
      setActiveStage("content");
      setActivePanel("content");
      return;
    }
    const target = item.issue.target;
    const location = resolveDeliveryIssueLocation(target);
    if (!location) return;
    if (location.selectionKind === "map") setSelection({ type: "map" });
    else if (location.selectionKind === "province") setSelection({ type: "province", province: location.province! });
    else if (location.selectionKind === "guests") setSelection({ type: "guests" });
    else if (location.selectionKind === "cards") setSelection({ type: "cards" });
    else if (location.selectionKind === "text" || location.selectionKind === "asset") {
      setSelection({ type: location.selectionKind, id: location.id! });
    }
    setActiveStage(location.stage);
    setActivePanel(location.stage === "frame" ? "layout" : location.stage === "map" ? "map" : "content");
  };

  const contentLayoutIssues = useMemo(() => listContentLayoutIssues(project), [project]);

  const applySystemTemplate = (templateId: MapTemplateId) => {
    commitProject(applyTransaction(project, createApplySystemTemplateTransaction(templateId)));
  };

  const applyCustomTemplateRecord = (record: CustomTemplateRecord) => {
    commitProject(
      applyTransaction(project, {
        id: `tx-custom-${record.id}`,
        label: `应用自定义模板：${record.name}`,
        source: "manual",
        apply: (current) => applyCustomTemplateToProject(current, record),
      }),
    );
  };

  const saveCurrentTemplate = () => {
    const name = window.prompt("自定义模板名称", "我的地图版式");
    if (!name?.trim()) return;
    const scope = window.confirm("点击“确定”保存视觉样式；点击“取消”保存布局倾向（含卡片分组）")
      ? "visual"
      : "layout";
    const record = buildCustomTemplateDraft(project, name, scope);
    const next = [record, ...customTemplates].slice(0, 20);
    setCustomTemplates(next);
    setStatusMessage(`已保存模板：${record.name}`);
  };

  const createNewProject = () => {
    if (!window.confirm("新建项目会清空当前未保存修改，是否继续？")) return;
    const next = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    setProject(next);
    setSelection({ type: "canvas" });
    setSelectedStudentId(null);
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setActiveStage("data");
    setStatusMessage("已新建空项目");
  };

  const restoreLocalProject = () => {
    const next = loadInitialProject();
    setProject(next);
    setSelection({ type: "canvas" });
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setActiveStage("data");
    setStatusMessage("已恢复本机最近项目");
  };

  const openGlobalData = () => {
    if (activeStage !== "data") lastNonTemplateStageRef.current = activeStage;
    setGlobalSettingsSection(null);
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setActiveStage("data");
  };

  const handleWorkflowStageChange = (stage: WorkflowStageId) => {
    setGlobalSettingsSection(null);
    if (stage !== "data") lastNonTemplateStageRef.current = stage;
    setActiveStage(stage);
    if (stage === "data") {
      openGlobalData();
      return;
    }
    const legacyPanel = WORKFLOW_STAGE_TO_LEGACY_PANEL[stage];
    if (!legacyPanel) return;
    setActivePanel(legacyPanel);
    setActiveWorkflowStep(stage === "map" ? "presentation" : stage === "frame" ? "layout" : stage === "export" ? "export" : "local");
  };

  const changeDataView = (view: DataViewId) => commitProjectTransaction(createDataViewTransaction(view));

  const dataWorkspaceProps = {
    students: project.students,
    dataView: project.dataView,
    onChangeDataView: changeDataView,
    onAppendStudents: (records: typeof project.students) => commitProjectTransaction(createAppendStudentsTransaction(records)),
    onReplaceStudents: (records: typeof project.students) => commitProjectTransaction(createReplaceStudentsTransaction(records)),
    onUpdateStudent: (id: string, patch: StudentEditPatch) => commitProjectTransaction(createStudentUpdateTransaction(id, patch)),
    onToggleVisibility: (id: string) => commitProjectTransaction(createStudentVisibilityToggleTransaction(id)),
    onDeleteStudent: (id: string) => commitProjectTransaction(createStudentDeleteTransaction(id)),
    onSetStudentsVisibility: (visibility: boolean) => commitProjectTransaction(createStudentsVisibilityTransaction(visibility)),
    selectedStudentId,
    onSelectStudent: setSelectedStudentId,
  };

  const handleCreateDecoration = (asset: StudioAsset) => {
    const element = createDecorationElement(asset, {
      x: project.canvas.width - 180,
      y: project.canvas.height - 180,
    });
    commitProject(
      applyTransaction(project, {
        id: createId("tx-decoration"),
        label: `添加装饰：${asset.label}`,
        source: "manual",
        apply: (current) => ({
          ...current,
          assetElements: [...current.assetElements, element],
        }),
      }),
    );
    setSelection({ type: "asset", id: element.id });
  };

  const applyBackgroundAsset = (asset: StudioAsset) => {
    commitProject(applyTransaction(project, {
      id: createId("tx-bg"),
      label: `应用背景：${asset.label}`,
      source: "manual",
      apply: (current) => ({
        ...current,
        canvas: { ...current.canvas, backgroundImageSrc: asset.src },
        style: { ...current.style, backgroundImageSrc: asset.src },
      }),
    }));
  };

  const applyProvinceThemes = (themes: Record<string, ImageThemeResult>) => {
    const entries = Object.entries(themes);
    if (entries.length === 0) return;
    const transaction = createProvinceThemeTransaction(themes);
    commitProjectTransaction({
      ...transaction,
      apply: (current) => ({ ...transaction.apply(current), cards: freezeCardPositionsForMapChange(current) }),
    });
    setStatusMessage(`已应用 ${entries.length} 个省份智能底色`);
  };

  const moveProvinceTexture = (province: string, offsetX: number, offsetY: number) => {
    const appearance = project.map.provinceStyles?.[province]?.appearance;
    if (!appearance || appearance.kind === "manual-color") return;
    patchScene({ type: "province", province }, { appearance: { ...appearance, offsetX, offsetY } });
  };

  const resizeMapImage = (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => {
    const source = project.map.renderSource;
    if (source?.kind !== "image" || !source.alignment) return;
    patchScene({ type: "map" }, { renderSource: { ...source, alignment: { ...source.alignment, ...alignment } } });
  };

  const moveTextElement = (id: string, x: number, y: number) => {
    const point = maybeSnap(x, y);
    commitProject(applyTransaction(project, createSceneTransaction({ type: "text", id }, point)));
  };

  const moveAssetElement = (id: string, x: number, y: number) => {
    const point = maybeSnap(x, y);
    const current = project.assetElements.find((asset) => asset.id === id);
    if (!current || (current.x === point.x && current.y === point.y)) return;
    commitProject(applyTransaction(project, createSceneTransaction({ type: "asset", id }, point)));
  };

  const resizeAssetElement = (id: string, x: number, y: number, width: number, height: number) => {
    const point = maybeSnap(x, y);
    const current = project.assetElements.find((asset) => asset.id === id);
    if (!current || (current.x === point.x && current.y === point.y && current.width === width && current.height === height)) return;
    commitProject(applyTransaction(project, createSceneTransaction({ type: "asset", id }, { x: point.x, y: point.y, width, height })));
  };

  const moveCardPosition = (id: string, x: number, y: number) => {
    const point = maybeSnap(x, y);
    commitProject(applyTransaction(project, {
      id: createId(`tx-card-position-${id}`),
      label: "调整数据框位置",
      source: "manual",
      apply: (current) => ({ ...current, cards: { ...current.cards, positions: { ...current.cards.positions, [id]: point } } }),
    }));
  };

  const moveGuestsPanel = (x: number, y: number) => {
    const point = maybeSnap(x, y);
    commitProject(applyTransaction(project, createSceneTransaction({ type: "guests" }, point)));
  };

  const mapStyleAssetPanelProps: StageSlotsContext["assetPanelProps"] = {
    instances: project.assetElements
      .filter((element) => element.kind !== "province-texture")
      .map((element) => ({ id: element.id, assetId: element.assetId, label: element.label, kind: element.kind })),
    provinces: provinceNames,
    dataProvinces: summary.map((item) => item.province),
    provinceStyles: project.map.provinceStyles,
    provinceAdjacency: CHINA_PROVINCE_ADJACENCY,
    mapBaseColor: project.map.landColor,
    posterBackground: project.canvas.backgroundColor,
    userAssets,
    assetUsageById,
    onApplyBackground: applyBackgroundAsset,
    onSelectInstance: (id) => setSelection({ type: "asset", id }),
    onPatchProvinceTextureUniformSize: (next) => patchScene({ type: "map" }, { provinceTextureUniformSize: next }),
    onApplyProvinceAppearance: (province, appearance, fill) => {
      setSelection({ type: "province", province });
      patchScene({ type: "province", province }, { appearance, ...(fill ? { fill } : {}) });
      setStatusMessage(`已应用到地图：${province}`);
    },
    onApplyProvinceThemes: applyProvinceThemes,
    onResetProvinceAppearance: (province) => {
      setSelection({ type: "province", province });
      patchScene({ type: "province", province }, { appearance: undefined, fill: undefined, textureSrc: undefined });
      setStatusMessage(`已恢复系统默认：${province}`);
    },
    onAddUserAsset: addUserAsset,
    onReplaceUserAsset: replaceUserAsset,
    onDeleteUserAsset: deleteUserAsset,
    onExportResourcePack: exportResourcePack,
    onImportResourcePack: importResourcePack,
  };

  const openStudioSettings = () => {
    setActiveWorkflowStep("layout");
    setGlobalSettingsSection("canvas");
  };
  const openTopbarProjectMenu = () => {
    const menu = document.querySelector<HTMLDetailsElement>(".topbar .project-menu");
    if (menu) menu.open = !menu.open;
  };
  const openCollaborationSettings = () => {
    openTopbarProjectMenu();
    collaboration.setCollaborationOpen(true);
  };
  const openDataDiagnostics = () => {
    setGlobalSettingsSection("cards");
  };
  const openRenderSettings = () => {
    setGlobalSettingsSection("advanced");
  };
  const projectExportActions = (
    <ToolbarGroup label="导出与工程">
      <ProjectMenu
      roomId={collaboration.roomId}
      roomVersion={collaboration.roomVersion}
      roomInput={collaboration.roomInput}
      inviteTokenInput={collaboration.inviteTokenInput}
      roomRole={collaboration.roomRole}
      members={collaboration.roomMembers}
      ownClientId={collaborationClientId}
      roomReadonly={collaboration.roomReadonly}
      roomClosed={collaboration.roomClosed}
      invitationToken={collaboration.invitationToken}
      hasStoredRoomAccess={collaboration.hasStoredRoomAccess}
      collaborationStatus={collaboration.collaborationStatus}
      collaborationMessage={collaboration.collaborationMessage}
      collaborationOpen={collaboration.collaborationOpen}
      pngScale={posterExport.pngScale}
      transparentExport={posterExport.transparentExport}
      syncStatus={syncState.status}
      onSetCollaborationOpen={collaboration.setCollaborationOpen}
      onRoomInputChange={collaboration.setRoomInput}
      onInviteTokenInputChange={collaboration.setInviteTokenInput}
      onCreateInvitation={collaboration.createInvitation}
      onSetRoomAccess={collaboration.setAccess}
      onLeaveRoom={collaboration.leaveRoom}
      onStartRoom={collaboration.startRoom}
      onJoinRoom={collaboration.joinRoom}
      onNewProject={createNewProject}
      onRestoreLocal={restoreLocalProject}
      onSaveLocal={() => void overwriteBrowserStorage()}
      onPngScaleChange={posterExport.setPngScale}
      onTransparentChange={posterExport.setTransparentExport}
      onExportSvg={posterExport.exportSvg}
      onExportProject={posterExport.openProjectExportDialog}
      onImportProject={posterExport.importProjectPackage}
    />
    </ToolbarGroup>
  );
  const stageOverview = useMemo(
    () => deriveStageOverviewModel({
      stage: activeStage,
      project,
      stageProgress: deriveWorkflowStageProgress(project, workflowProgress),
      dataHealth,
      dataIssues,
      layoutIssues: contentLayoutIssues,
      resourceIssues,
      dataViewLabel: dataViews.find((view) => view.id === dataView)?.name ?? dataView,
      exportState: posterExport.exportState,
    }),
    [activeStage, project, workflowProgress, dataHealth, dataIssues, contentLayoutIssues, resourceIssues, dataView, posterExport.exportState],
  );

  const handleStageOverviewAction = (action: StageOverviewAction) => {
    if (action.kind === "data-diagnostics") {
      openDataDiagnostics();
      return;
    }
    if (action.kind === "locate-layout") {
      locateLayoutIssue(action.issue);
      return;
    }
    if (action.kind === "locate-delivery") {
      locateDeliveryIssue(action.issue);
      return;
    }
    if (action.kind === "stage") {
      setActiveStage(action.stage);
      return;
    }
    if (action.kind === "export-png") {
      void posterExport.exportPng();
      return;
    }
  };

  const studioAssistantRail = (
    <StudioAssistantRail
      project={project}
      assets={userAssets}
      syncStatus={syncState.status}
      collaboration={{ roomId: collaboration.roomId, status: collaboration.collaborationStatus, participantCount: collaboration.roomParticipants.length }}
      dataIssueCount={dataIssues.length}
      renderIntervalMs={resolvedRenderInterval}
      onOpenSettings={openStudioSettings}
      onOpenProject={openTopbarProjectMenu}
      onOpenCollaboration={openCollaborationSettings}
      onOpenDataDiagnostics={openDataDiagnostics}
      onOpenRenderSettings={openRenderSettings}
      selection={selection}
      layoutIssues={contentLayoutIssues}
      onSelectElement={handleSceneSelect}
      onLocateLayoutIssue={locateLayoutIssue}
      onPreview={setAgentPreview}
      onCommit={commitProjectTransaction}
      stageOverview={stageOverview}
      onStageOverviewAction={handleStageOverviewAction}
    />
  );

  const assistantEntryButton = (
    <button
      ref={assistantEntryRef}
      type="button"
      aria-label="打开AI助手与高级功能"
      aria-expanded={assistantDrawerOpen}
      onClick={() => setAssistantDrawerOpen(true)}
    >
      <Bot size={17} />
    </button>
  );

  const historyActionsNode = (
    <ToolbarGroup label="历史与缩放" className="topbar-action-group--history">
      <ToolbarButton label={undoLabel} icon={<Undo2 size={18} />} disabled={!canUndo} onClick={handleUndo} />
      <ToolbarButton label={redoLabel} icon={<Redo2 size={18} />} disabled={!canRedo} onClick={handleRedo} />
    </ToolbarGroup>
  );

  const projectActionsNode = (
    <>
      {projectId && <WorkbenchBackButton onClick={() => void handleBackToWorkbench()} />}
      {projectExportActions}
      <ToolbarGroup label="界面主题" className="topbar-action-group--theme">
        <SkinSelector skin={skin} onChange={setSkin} />
        <ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={setThemeMode} />
      </ToolbarGroup>
    </>
  );

  const workflowNavNode = (
    <WorkflowStageStepper
      activeId={activeStage}
      project={project}
      progress={workflowProgress}
      onChange={handleWorkflowStageChange}
    />
  );

  if (projectId && projectLoading) {
    return (
      <main className="workbench-shell">
        <section role="status" className="workbench-loading">
          <div className="brand">
            <MapPinned size={24} />
            <span className="brand-label brand-label__full">蹭饭地图工作室</span>
            <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
            <em>Beta</em>
          </div>
          <p>正在加载项目…</p>
        </section>
      </main>
    );
  }

  if (projectMissing) {
    return (
      <main className="workbench-shell">
        <section className="workbench-error workbench-error--recover" role="alert">
          <span className="workbench-brand-mark"><MapPinned size={22} /></span>
          <strong>项目不存在或已删除</strong>
          <p>这个链接指向的项目已经不在本机项目列表中了。可以回到项目列表继续编辑其他项目。</p>
          <div className="workbench-error-actions">
            <button type="button" className="primary-button" aria-label="返回项目列表" onClick={() => { window.location.hash = "#/"; }}>
              返回项目列表
            </button>
          </div>
        </section>
      </main>
    );
  }
  if (globalSettingsSection) {
    return (
      <div className="app-shell" data-editor-theme={resolvedTheme} data-editor-skin={skin}>
        <header className="topbar">
          <div className="brand">
            <MapPinned size={24} />
            <span className="brand-label brand-label__full">蹭饭地图工作室</span>
            <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
            <em>Beta</em>
          </div>
          <div className="topbar-workflow">
            <WorkflowStageStepper activeId={activeStage} project={project} progress={workflowProgress} onChange={handleWorkflowStageChange} />
          </div>
          <div className="topbar-actions">
            {projectId && <WorkbenchBackButton onClick={() => void handleBackToWorkbench()} />}
          </div>
        </header>
        <GlobalSettingsScreen
        project={project}
        userFonts={userFonts}
        initialSection={globalSettingsSection}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        onClose={() => setGlobalSettingsSection(null)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onPatch={patchScene}
        onReset={resetSceneTarget}
        selectedStudentId={dataWorkspaceProps.selectedStudentId}
        onSelectStudent={dataWorkspaceProps.onSelectStudent}
        onChangeDataView={dataWorkspaceProps.onChangeDataView}
        onAppendStudents={dataWorkspaceProps.onAppendStudents}
        onReplaceStudents={dataWorkspaceProps.onReplaceStudents}
        onUpdateStudent={dataWorkspaceProps.onUpdateStudent}
        onToggleStudentVisibility={dataWorkspaceProps.onToggleVisibility}
        onDeleteStudent={dataWorkspaceProps.onDeleteStudent}
        onSetStudentsVisibility={dataWorkspaceProps.onSetStudentsVisibility}
        provinces={provinceNames}
        onApplyFont={applyFont}
        onUploadFont={uploadUserFont}
        onDeleteUserFont={deleteUserFont}
        workflowProgress={workflowProgress}
        workflowActiveStep={activeWorkflowStep}
        templates={(["original", "cartoon", "grain", "q", "scenery"] as const).map((templateId) => ({
          id: templateId,
          name: createSystemTemplate(templateId).name,
        }))}
        currentTemplateId={template}
        customTemplates={customTemplates.map(({ id, name, scope }) => ({ id, name, scope }))}
        onApplyTemplate={applySystemTemplate}
        onApplyCustomTemplate={(record) => {
          const full = customTemplates.find((item) => item.id === record.id);
          if (full) applyCustomTemplateRecord(full);
        }}
          onSaveTemplate={saveCurrentTemplate}
          onOpenGlobalData={openGlobalData}
          themeMode={themeMode}
          resolvedTheme={resolvedTheme}
          onThemeChange={setThemeMode}
          />
      </div>
    );
  }

  const editorContext: StageSlotsContext = {
    project,
    renderProject,
    selection,
    selectedStudentId,
    userAssets,
    userFonts,
    dataHealth,
    dataIssues,
    layoutIssues: contentLayoutIssues,
    resourceIssues,
    fontIssues,
    dataWorkspaceProps,
    assetPanelProps: mapStyleAssetPanelProps,
    posterExport,
    posterRef,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onSelect: handleSceneSelect,
    onSelectStudent: setSelectedStudentId,
    onPatchScene: patchScene,
    onResetScene: resetSceneTarget,
    onChangeDataView: changeDataView,
    onAddUserAsset: addUserAsset,
    onCreateDecoration: handleCreateDecoration,
    onCardPositionsResolved: captureCardPositions,
    onMoveProvinceTexture: moveProvinceTexture,
    onResizeMapImage: resizeMapImage,
    onRefreshDisplayFramePositions: refreshDisplayFramePositions,
    onLocateDeliveryIssue: locateDeliveryIssue,
    onBackToMapStage: () => {
      setActiveStage("map");
      setActivePanel("map");
    },
    onApplyFont: applyFont,
    onUploadFont: uploadUserFont,
    onDeleteUserFont: deleteUserFont,
    onMoveText: moveTextElement,
    onMoveAsset: moveAssetElement,
    onResizeAsset: resizeAssetElement,
    onMoveCard: moveCardPosition,
    onMoveGuests: moveGuestsPanel,
  };

  if (activeStage !== "content" || !legacyEditorEnabled) {
    return (
      <StudioStageScreen
        theme={resolvedTheme}
        skin={skin}
        stage={activeStage}
        ctx={editorContext}
        assistantEntry={assistantEntryButton}
        historyActions={historyActionsNode}
        projectActions={projectActionsNode}
        workflowNav={workflowNavNode}
        leftRail={studioAssistantRail}
        drawerOpen={assistantDrawerOpen}
        onDrawerClose={() => setAssistantDrawerOpen(false)}
      />
    );
  }

  return (
    <LegacyEditorChrome
      ctx={editorContext}
      chrome={chrome}
      activeStage={activeStage}
      activePanel={activePanel}
      workflowProgress={workflowProgress}
      projectId={projectId}
      summary={summary}
      syncState={syncState}
      statusMessage={statusMessage}
      customTemplates={customTemplates}
      showGrid={showGrid}
      gridSize={gridSize}
      renderIntervalMs={resolvedRenderInterval}
      assistantRail={studioAssistantRail}
      projectActions={projectExportActions}
      commitProject={commitProject}
      onStatusMessage={setStatusMessage}
      onActivePanelChange={setActivePanel}
      onStageChange={handleWorkflowStageChange}
      onSetActiveStage={setActiveStage}
      onSetActiveWorkflowStep={setActiveWorkflowStep}
      onOpenGlobalData={openGlobalData}
      onOpenGlobalSettings={setGlobalSettingsSection}
      onApplySystemTemplate={applySystemTemplate}
      onApplyCustomTemplate={applyCustomTemplateRecord}
      onSaveTemplate={saveCurrentTemplate}
      onSaveLocal={() => void overwriteBrowserStorage()}
      onBackToWorkbench={() => void handleBackToWorkbench()}
    />
  );
}

export function App({ projectId }: { projectId?: string }) {
  return <AssistantConversationProvider><StudioApp projectId={projectId} /></AssistantConversationProvider>;
}
