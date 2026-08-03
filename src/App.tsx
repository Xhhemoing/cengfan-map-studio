
import {
  Download,
  FolderOpen,
  ImageDown,
  MapPinned,
  PanelRight,
  PanelRightClose,
  Plus,
  Redo2,
  Save,
  Share2,
  Copy,
  LogOut,
  Undo2,

  PackageOpen,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createNoteElement, createTextElement } from "./lib/canvas-data";
import { CHINA_PROVINCE_ADJACENCY, getProvinceNames } from "./lib/map-data";
import {
  buildProvinceSummary,
  sampleStudents,
  type DataViewId,
  type MapTemplateId,
} from "./lib/project-data";
import { createId } from "./lib/ids";

import { AiAssistant } from "./components/AiAssistant";

import { AssetPanel } from "./components/AssetPanel";
import { DataWorkspace } from "./components/DataWorkspace";
import { GlobalDataScreen, type GlobalDataView } from "./components/GlobalDataScreen";
import "./components/workflow-workspaces.css";
import { GlobalSettingsScreen, type GlobalSettingsSection } from "./components/GlobalSettingsScreen";

import { ActionGroup, CompactButton, ControlCluster, SegmentedControl, ToolbarButton, ToolbarGroup } from "./components/StudioUi";
import { WorkflowGuide } from "./components/WorkflowGuide";
import { WorkflowStepper, type WorkflowPanelId } from "./components/WorkflowStepper";
import { ThemeToggle } from "./components/ThemeToggle";
import { ResizablePanelDivider } from "./components/ResizablePanelDivider";
import { buildDataHealthSummary, listDataIssues } from "./lib/data-health";
import { computeWorkflowProgress, listStudentWarnings, type WorkflowStepId } from "./lib/workflow-progress";
import {
  applyEditorCommands,
  previewEditorCommands,
  type EditorCommand,
} from "./lib/editor-commands";
import {
  applyTransaction,
  createProjectDocument,
  redoTransaction,
  restoreProjectDocument,
  serializeProjectDocument,
  undoTransaction,
  type ProjectDocument,
  type ProjectTransaction,
} from "./lib/project-document";
import {
  applyDataViewChange,
  findAssetUsage,

  isAssetInUse,

  removeUserAsset,
  removeUserFont,
  STYLE_LAYER_TARGETS,
} from "./lib/catalog-usage";

import { createSystemTemplate, mergeTemplateDocuments } from "./lib/template-document";
import {
  applyCustomTemplateToProject,
  createCustomTemplateFromProject,
  loadCustomTemplates,
  type CustomTemplateRecord,
} from "./lib/template-store";
import {
  downloadDataUrl,
  downloadText,
  serializePosterSvg,
  svgToPngDataUrl,
} from "./lib/export-poster";
import {
  createDecorationElement,
  createLandmarkElement,
  duplicateAssetElement,
} from "./lib/asset-elements";
import { PosterCanvas } from "./components/canvas/PosterCanvas";
import { createDefaultScene, type ProvinceAppearance, type SceneSelection } from "./lib/scene-document";
import { createProvinceThemeTransaction, createSceneTransaction, deleteAsset, deleteText } from "./lib/inspector-operations";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
import { MapInspector } from "./components/inspector/MapInspector";
import {
  buildFontFaceCss,
  ensureUserFontsLoaded,
  loadUserFonts,
  type UserFont,
} from "./lib/fonts";
import {
  loadUserAssets,
  type UserAsset,
} from "./lib/assets";
import {
  createResourcePack,
  downloadResourcePack,
  mergeResourcePack,
  parseResourcePack,
} from "./lib/resource-pack";
import {
  createProjectPackage,
  createProjectPackageEnvelope,
  downloadProjectPackage,
  parseProjectPackage,
  restoreProjectPackage,
  type ProjectPackage,
} from "./lib/project-package";
import { applyTypographyFont, type TypographyTarget } from "./lib/typography";
import type { ImageThemeResult } from "./lib/image-color";
import { loadThemeMode, resolveTheme, saveThemeMode, type ThemeMode } from "./lib/theme";
import {
  getPanelWidthBounds,
  normalizeEditorPanelLayout,
  readEditorPanelLayout,
  writeEditorPanelLayout,
  type EditorPanelLayout,
  type PanelSide,
} from "./lib/editor-layout";

import {
  clampGridSize,
  DEFAULT_GRID_SIZE,
  fitZoomPercent,
  snapPoint,
} from "./lib/grid";
import {
  DEFAULT_RENDER_SETTINGS,
  normalizeRenderSettings,
  renderIntervalMs,
  type RenderSettings,
} from "./lib/render-settings";
import {
  createBrowserWorkspaceStores,
  loadBrowserWorkspaceMirror,
  saveBrowserWorkspaceSnapshot,
} from "./lib/browser-workspace-store";
import {
  LocalWorkspaceOverwrite,
  type LocalWorkspaceOverwriteState,
} from "./lib/incremental-workspace-sync";
import {
  CollaborationClientError,
  createRoom,
  fetchRoom,
  retryInitializingRoom,
  submitRoomOperations,
  submitRoomSnapshot,
  subscribeRoom,
  type CollaborationRoom,
} from "./lib/collaboration-client";
import { applyCollaborationOperations, diffCollaborationDocument, rebaseRemoteCollaborationOperations } from "./lib/collaboration-operations";


const DRAFT_KEY = "cengfan-map-studio:draft";
const DRAFT_SAVED_AT_KEY = "cengfan-map-studio:draft-saved-at";
const RENDER_SETTINGS_KEY = "cengfan-map-studio:render-settings";
const COLLABORATION_SEND_DELAY_MS = 600;

type ActivePanel = "roster" | "map" | "layout" | "content" | "assets" | "deliver";

const provinceNames = getProvinceNames();

const dataViews: Array<{ id: DataViewId; name: string; description: string }> = [
  { id: "province", name: "省份卡片", description: "按省份聚合，同校合并展示" },
  { id: "city", name: "城市卡片", description: "按城市聚合，同校合并展示" },
  { id: "university", name: "院校卡片", description: "按就读院校聚合名单" },
  { id: "pins", name: "地图图钉", description: "在地图内定位" },
  { id: "heat", name: "人数热力", description: "颜色表达数量" },
];


function loadInitialProject(): ProjectDocument {
  if (typeof window === "undefined") {
    return createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "province",
      textElements: [
        {
          id: "text-wish",
          content: "山高水长，来日再聚",
          x: 745,
          y: 905,
          fontSize: 20,
          color: "#c85d4b",
        },
      ],
    });
  }
  const raw = window.localStorage.getItem(DRAFT_KEY);
  if (!raw) {
    return createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "province",
      textElements: [
        {
          id: "text-wish",
          content: "山高水长，来日再聚",
          x: 745,
          y: 905,
          fontSize: 20,
          color: "#c85d4b",
        },
      ],
    });
  }
  const restored = restoreProjectDocument(raw);
  if (restored.students.length === 0) {
    restored.students = sampleStudents;
  }
  return restored;
}

export function App() {
  const [browserStores] = useState(() => createBrowserWorkspaceStores());
  const [initialWorkspace] = useState(() => loadBrowserWorkspaceMirror(browserStores.mirror));
  const [project, setProject] = useState<ProjectDocument>(() => initialWorkspace?.project ?? loadInitialProject());
  const [previewCommands, setPreviewCommands] = useState<EditorCommand[]>([]);
  const [selection, setSelection] = useState<SceneSelection>({ type: "text", id: "text-note" });
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<LocalWorkspaceOverwriteState>({
    status: initialWorkspace ? "saved" : "idle",
    savedAt: initialWorkspace?.exportedAt ?? null,
  });
  const [exportingPng, setExportingPng] = useState(false);
  const [pngScale, setPngScale] = useState(1);
  const [transparentExport, setTransparentExport] = useState(false);
  const [showProjectExportDialog, setShowProjectExportDialog] = useState(false);


  const [includeResourcesInProjectExport, setIncludeResourcesInProjectExport] = useState(true);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateRecord[]>(() =>
    initialWorkspace?.customTemplates ?? (typeof window === "undefined" ? [] : loadCustomTemplates()),
  );
  const [statusMessage, setStatusMessage] = useState(initialWorkspace ? "已从本地完整镜像恢复工作区" : "仅在点击强制保存时写入本地");
  const [userFonts, setUserFonts] = useState<UserFont[]>(() =>
    initialWorkspace?.fonts ?? (typeof window === "undefined" ? [] : loadUserFonts()),
  );
  const [userAssets, setUserAssets] = useState<UserAsset[]>(() =>
    initialWorkspace?.assets ?? (typeof window === "undefined" ? [] : loadUserAssets()),
  );
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
  const [renderSettings, setRenderSettings] = useState<RenderSettings>(() => {
    if (initialWorkspace) return initialWorkspace.renderSettings;
    if (typeof window === "undefined") return { ...DEFAULT_RENDER_SETTINGS };
    try {
      return normalizeRenderSettings(JSON.parse(window.localStorage.getItem(RENDER_SETTINGS_KEY) ?? "null"));
    } catch {
      return { ...DEFAULT_RENDER_SETTINGS };
    }
  });
  const [zoomPercent, setZoomPercent] = useState(100);
  const [collaborationOpen, setCollaborationOpen] = useState(false);
  const [roomInput, setRoomInput] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomVersion, setRoomVersion] = useState(0);
  const [collaborationStatus, setCollaborationStatus] = useState<"idle" | "connecting" | "connected" | "syncing" | "conflict" | "error">("idle");
  const [collaborationMessage, setCollaborationMessage] = useState("未连接时不会上传或覆盖工程");
  const [collaborationClientId] = useState(() => createId("collab-client"));

  const [workspaceSync] = useState(() => new LocalWorkspaceOverwrite({
    saveLocal: async (pack) => {
      try {
        localStorage.setItem(DRAFT_KEY, serializeProjectDocument(pack.project));
        localStorage.setItem(DRAFT_SAVED_AT_KEY, pack.exportedAt);
      } catch {
        // The complete mirror or IndexedDB copy can still preserve the workspace.
      }
      const result = await saveBrowserWorkspaceSnapshot(pack, browserStores);
      if (result.durable === "failed" && result.mirror === "failed") throw new Error("浏览器本地存储不可写");
    },
    onStateChange: setSyncState,
  }));
  const latestWorkspaceRef = useRef({ project, assets: userAssets, fonts: userFonts, customTemplates, renderSettings });
  const workspaceStateInitializedRef = useRef(false);
  const collaborationBaselineRef = useRef<ProjectPackage | null>(null);
  const collaborationVersionRef = useRef(0);
  const collaborationRoomRef = useRef<string | null>(null);
  const suppressCollaborationSendRef = useRef(false);
  const receiveRoomUpdateRef = useRef<(room: CollaborationRoom<ProjectPackage>) => void>(() => undefined);


  const posterRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>("roster");
  const [contentView, setContentView] = useState<"layers" | "assistant">("layers");
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<WorkflowStepId>("roster");
  const [globalSettingsSection, setGlobalSettingsSection] = useState<GlobalSettingsSection | null>(null);
  const [globalDataOpen, setGlobalDataOpen] = useState(false);
  const [globalDataInitialView, setGlobalDataInitialView] = useState<GlobalDataView>("overview");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => typeof window === "undefined" ? "system" : loadThemeMode());
  const [prefersDark, setPrefersDark] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true);
  const [panelLayout, setPanelLayout] = useState<EditorPanelLayout>(() => readEditorPanelLayout());
  const [resizingPanel, setResizingPanel] = useState<PanelSide | null>(null);

  const resolvedRenderInterval = renderIntervalMs(renderSettings);
  const workflowProgress = useMemo(() => computeWorkflowProgress(project), [project]);
  const dataHealth = useMemo(() => buildDataHealthSummary(project), [project]);
  const dataIssues = useMemo(() => listDataIssues(project), [project]);
  const exportWarnings = useMemo(() => listStudentWarnings(project), [project]);
  const resolvedTheme = resolveTheme(themeMode, prefersDark);
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const sidebarBounds = getPanelWidthBounds("sidebar", viewportWidth, panelLayout.inspectorWidth);
  const inspectorBounds = getPanelWidthBounds("inspector", viewportWidth, panelLayout.sidebarWidth);
  const workspaceStyle = {
    "--sidebar-width": `${panelLayout.sidebarWidth}px`,
    "--inspector-width": `${panelLayout.inspectorWidth}px`,
  } as CSSProperties;
  const selectionDescription = (() => {
    switch (selection.type) {
      case "canvas":
        return "当前选中：画布。";
      case "map":
        return "当前选中：地图展示框。";
      case "province":
        return `当前选中：${selection.province}。`;
      case "cards":
        return "当前选中：数据板块。";
      case "guests":
        return "当前选中：嘉宾板块。";
      case "text": {
        const text = project.textElements.find((item) => item.id === selection.id);
        return text ? `当前选中：文字“${text.content}”。` : "";
      }
      case "asset": {
        const asset = project.assetElements.find((item) => item.id === selection.id);
        return asset ? `当前选中：素材“${asset.label}”。` : "";
      }
    }
  })();


  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    saveThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    writeEditorPanelLayout(window.localStorage, panelLayout, window.innerWidth);
  }, [panelLayout]);

  useEffect(() => {
    const onResize = () => {
      setPanelLayout((current) => normalizeEditorPanelLayout(current, window.innerWidth));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const updatePanelWidth = (side: PanelSide, value: number) => {
    setPanelLayout((current) => normalizeEditorPanelLayout({
      ...current,
      [side === "sidebar" ? "sidebarWidth" : "inspectorWidth"]: value,
    }, viewportWidth));
  };

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

  const renderProject = useMemo(() => {
    if (previewCommands.length === 0) return project;
    try {
      return previewEditorCommands(project, previewCommands);
    } catch {
      return project;
    }
  }, [project, previewCommands]);

  const template = renderProject.templateId;
  const dataView = renderProject.dataView;
  const dataViewLabel = dataViews.find((view) => view.id === dataView)?.name ?? dataView;
  const students = renderProject.students;

  const style = renderProject.style;
  const selectedTextId = selection.type === "text" ? selection.id : null;
  const summary = buildProvinceSummary(students);
  const isPreviewing = previewCommands.length > 0;
  const resolvedTemplate = useMemo(() => {
    const base = createSystemTemplate(template);
    return mergeTemplateDocuments(base, {
      background: {
        ...base.background,
        color: renderProject.canvas.backgroundColor || base.background.color,
        imageSrc: renderProject.canvas.backgroundImageSrc,
        type: renderProject.canvas.backgroundImageSrc ? "image" : "color",
      },
      map: {
        ...base.map,
        scale: renderProject.map.scale,
        edgeColor: renderProject.map.edgeColor,
        edgeStyle: renderProject.map.edgeStyle ?? "solid",
        edgeWidth: renderProject.map.edgeWidth ?? 1,
        landColor: renderProject.map.landColor,
        activeColor: renderProject.map.activeColor,
        showProvinceLabels: renderProject.map.showProvinceLabels,
        provinceStyles: renderProject.map.provinceStyles ?? {},
      },
      cards: {
        ...base.cards,
        preset: renderProject.cards.preset,
      },
      visibleFields: renderProject.cards.visibleFields,
      regionalAssets: style.regionalAssets,
    });
  }, [renderProject, style, template]);

  useEffect(() => {
    latestWorkspaceRef.current = { project, assets: userAssets, fonts: userFonts, customTemplates, renderSettings };
    if (!workspaceStateInitializedRef.current) {
      workspaceStateInitializedRef.current = true;
      return;
    }
    workspaceSync.markPending();
  }, [customTemplates, project, renderSettings, userAssets, userFonts, workspaceSync]);

  const currentCollaborationPackage = (exportedAt = new Date().toISOString()): ProjectPackage => {
    const pack = createProjectPackageEnvelope(latestWorkspaceRef.current);
    return { ...pack, exportedAt, project: { ...pack.project, history: { past: [], future: [] } } };
  };

  const applySharedPackage = (pack: ProjectPackage, version: number) => {
    const restored = restoreProjectPackage(pack);
    suppressCollaborationSendRef.current = true;
    collaborationBaselineRef.current = restored;
    collaborationVersionRef.current = version;
    setRoomVersion(version);
    setProject((current) => ({ ...restored.project, history: current.history, version: current.version + 1 }));
    setUserAssets(restored.assets);
    setUserFonts(restored.fonts);
    setCustomTemplates(restored.customTemplates);
    setRenderSettings(restored.renderSettings);
    setPreviewCommands([]);
    workspaceSync.markPending();
  };

  const receiveRoomUpdate = (room: CollaborationRoom<ProjectPackage>) => {
    if (room.version <= collaborationVersionRef.current) return;
    if (room.operations && collaborationBaselineRef.current) {
      const current = currentCollaborationPackage(collaborationBaselineRef.current.exportedAt);
      const rebased = rebaseRemoteCollaborationOperations(collaborationBaselineRef.current, current, room.operations);
      collaborationBaselineRef.current = rebased.baseline;
      applySharedPackage(rebased.current, room.version);
      collaborationBaselineRef.current = rebased.baseline;
    } else if (room.snapshot) {
      applySharedPackage(room.snapshot, room.version);
    } else {
      collaborationVersionRef.current = room.version;
      setRoomVersion(room.version);
    }
    setCollaborationStatus("connected");
    setCollaborationMessage(room.rebasedFromVersion === undefined ? "增量同步已完成" : "已自动合并互不冲突的并发修改");
  };

  useEffect(() => {
    receiveRoomUpdateRef.current = receiveRoomUpdate;
  });

  useEffect(() => {
    if (!roomId) return;
    collaborationRoomRef.current = roomId;
    return subscribeRoom<ProjectPackage>(roomId, (room) => receiveRoomUpdateRef.current(room), () => {
      setCollaborationStatus("error");
      setCollaborationMessage("连接中断，浏览器会自动尝试重连");
    }, { clientId: collaborationClientId, version: collaborationVersionRef.current });
  }, [collaborationClientId, roomId]);

  useEffect(() => {
    if (!roomId || !collaborationBaselineRef.current) return;
    if (suppressCollaborationSendRef.current) {
      suppressCollaborationSendRef.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      const baseline = collaborationBaselineRef.current;
      if (!baseline || collaborationRoomRef.current !== roomId) return;
      const currentEnvelope = createProjectPackageEnvelope(latestWorkspaceRef.current);
      const current: ProjectPackage = {
        ...currentEnvelope,
        exportedAt: baseline.exportedAt,
        project: { ...currentEnvelope.project, history: { past: [], future: [] } },
      };
      const operations = diffCollaborationDocument(baseline, current);
      if (operations.length === 0) return;
      const txId = createId("collab-op");
      setCollaborationStatus("syncing");
      setCollaborationMessage(`正在同步 ${operations.length} 项增量修改`);
      try {
        const acknowledged = await submitRoomOperations<ProjectPackage>(roomId, {
          txId,
          clientId: collaborationClientId,
          baseVersion: collaborationVersionRef.current,
          operations,
        });
        collaborationBaselineRef.current = applyCollaborationOperations(baseline, operations);
        collaborationVersionRef.current = acknowledged.version;
        setRoomVersion(acknowledged.version);
        setCollaborationStatus("connected");
        setCollaborationMessage(acknowledged.rebasedFromVersion === undefined ? "增量同步已完成" : "已自动合并互不冲突的并发修改");
      } catch (error) {
        if (error instanceof CollaborationClientError && error.code === "VERSION_CONFLICT") {
          setCollaborationStatus("conflict");
          setCollaborationMessage("同一内容被其他成员修改；已暂停上传，请重新加入房间确认最新版本");
        } else {
          setCollaborationStatus("error");
          setCollaborationMessage(error instanceof Error ? error.message : "增量同步失败");
        }
      }
    }, COLLABORATION_SEND_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [collaborationClientId, customTemplates, project, renderSettings, roomId, userAssets, userFonts]);

  const startCollaborationRoom = async () => {
    setCollaborationStatus("connecting");
    setCollaborationMessage("正在创建房间");
    try {
      const allocated = await createRoom<ProjectPackage>({ clientId: collaborationClientId });
      setRoomId(allocated.id);
      setRoomInput(allocated.id);
      collaborationRoomRef.current = allocated.id;
      collaborationVersionRef.current = allocated.version;
      const initial = currentCollaborationPackage();
      collaborationBaselineRef.current = initial;
      const ready = await submitRoomSnapshot(allocated.id, {
        txId: createId("collab-init"),
        clientId: collaborationClientId,
        baseVersion: allocated.version,
        snapshot: initial,
      });
      collaborationVersionRef.current = ready.version;
      setRoomVersion(ready.version);
      setCollaborationStatus("connected");
      setCollaborationMessage("房间已创建，后续仅同步增量修改");
    } catch (error) {
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "创建协作房间失败");
    }
  };

  const joinCollaborationRoom = async () => {
    const normalizedRoomId = roomInput.trim().toUpperCase();
    if (!normalizedRoomId) return;
    setCollaborationStatus("connecting");
    setCollaborationMessage("正在读取房间当前版本");
    try {
      const room = await retryInitializingRoom(() => fetchRoom<ProjectPackage>(normalizedRoomId));
      if (!room.snapshot) throw new Error("房间工程数据不完整");
      setRoomId(normalizedRoomId);
      collaborationRoomRef.current = normalizedRoomId;
      applySharedPackage(room.snapshot, room.version);
      setCollaborationStatus("connected");
      setCollaborationMessage("已加入房间，后续仅同步增量修改");
    } catch (error) {
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "加入协作房间失败");
    }
  };

  const leaveCollaborationRoom = () => {
    setRoomId(null);
    collaborationRoomRef.current = null;
    collaborationBaselineRef.current = null;
    collaborationVersionRef.current = 0;
    setRoomVersion(0);
    setCollaborationStatus("idle");
    setCollaborationMessage("已断开；未连接时不会上传或覆盖工程");
  };

  const commitProject = (next: ProjectDocument) => {
    setProject(next);
    setPreviewCommands([]);
    workspaceSync.markPending();
  };

  const commitProjectTransaction = (transaction: ProjectTransaction) => {
    setProject((current) => {
      const next = applyTransaction(current, transaction);
      return next;
    });
    setPreviewCommands([]);
    workspaceSync.markPending();
  };

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

  const fitCanvasToStage = () => {
    const stage = stageRef.current;
    if (!stage) {
      setZoomPercent(100);
      return;
    }
    const next = fitZoomPercent({
      stageWidth: stage.clientWidth,
      stageHeight: stage.clientHeight,
      canvasWidth: project.canvas.width,
      canvasHeight: project.canvas.height,
    });
    setZoomPercent(next);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia?.("(max-width: 1120px)").matches) return;
    const timer = window.setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;
      setZoomPercent(fitZoomPercent({
        stageWidth: stage.clientWidth,
        stageHeight: stage.clientHeight,
        canvasWidth: project.canvas.width,
        canvasHeight: project.canvas.height,
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [project.canvas.height, project.canvas.width]);

  const maybeSnap = (x: number, y: number) => {
    if (!showGrid || !snapToGridEnabled) return { x: Math.round(x), y: Math.round(y) };
    return snapPoint({ x, y }, gridSize);
  };

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

  const arrangeCards = () => {
    commitProjectTransaction({
      id: createId("tx-smart-card-layout"),
      label: "一键智能排版数据框",
      source: "manual",
      apply: (current) => ({
        ...current,
        cards: { ...current.cards, positions: {} },
      }),
    });
    setStatusMessage("已按地图位置重新智能排版");
  };

  const patchScene = (target: SceneSelection, patch: Record<string, unknown>) => {
    commitProjectTransaction(createSceneTransaction(target, patch));
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

  const exportSvg = () => {
    const svg = posterRef.current;
    if (!svg) return;
    const source = serializePosterSvg(svg, { transparentBackground: transparentExport });
    downloadText(source, "我的毕业去向图.svg", "image/svg+xml;charset=utf-8");
  };

  const openProjectExportDialog = () => {
    setIncludeResourcesInProjectExport(true);
    setShowProjectExportDialog(true);
  };

  const exportProjectPackage = () => {
    const exportedAssets = includeResourcesInProjectExport ? userAssets : [];
    const exportedFonts = includeResourcesInProjectExport ? userFonts : [];
    downloadProjectPackage(createProjectPackage({
      project,
      assets: exportedAssets,
      fonts: exportedFonts,
      customTemplates,
      renderSettings,
    }));
    setShowProjectExportDialog(false);
    setStatusMessage(includeResourcesInProjectExport
      ? `完整工程包已导出：${project.students.length} 条名单、${exportedAssets.length} 个素材、${exportedFonts.length} 个字体、${customTemplates.length} 个模板`
      : `工程已导出（未包含资源包）：${project.students.length} 条名单、${customTemplates.length} 个模板`);
  };

  const overwriteBrowserStorage = async () => {
    const pack = createProjectPackageEnvelope(latestWorkspaceRef.current);
    await workspaceSync.overwrite(pack);
    const result = workspaceSync.getState();
    const localSaved = result.status === "saved";
    setStatusMessage(localSaved
      ? "强制保存完成：全部数据已覆盖到浏览器本地"
      : "强制保存失败：浏览器本地存储不可写，请立即导出工程包");
  };

  const importProjectPackage = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const pack = parseProjectPackage(String(reader.result ?? ""));
        if (!window.confirm(`导入工程将替换当前画布和 ${project.students.length} 条名单，是否继续？`)) return;
        setUserAssets(pack.assets);
        setUserFonts(pack.fonts);
        setCustomTemplates(pack.customTemplates);
        setRenderSettings(pack.renderSettings);
        commitProject(pack.project);
        setSelection({ type: "canvas" });
        setStatusMessage(`完整工程包已导入：${pack.project.students.length} 条名单、${pack.assets.length} 个素材、${pack.fonts.length} 个字体、${pack.customTemplates.length} 个模板`);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "工程包导入失败");
      }
    };
    reader.readAsText(file);
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

  const assetUsageById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const asset of userAssets) {
      if (!isAssetInUse(project, asset.id, asset) && asset.src !== project.canvas.backgroundImageSrc) continue;
      const usage = findAssetUsage(project, asset.id);
      const parts: string[] = [];
      if (usage.provinces.length) parts.push(usage.provinces.map((name) => name.replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/, "")).join("/"));
      if (usage.instances.length) parts.push(`${usage.instances.length} 个实例`);
      if (asset.src === project.canvas.backgroundImageSrc) parts.push("背景");
      map[asset.id] = parts.length ? `使用中 · ${parts.join(" · ")}` : "使用中";
    }
    return map;
  }, [project, userAssets]);


  const selectStyleLayer = (target: (typeof STYLE_LAYER_TARGETS)[number]) => {
    if (target.type === "text") {
      setSelection({ type: "text", id: target.id });
      return;
    }
    if (target.type === "map") {
      setSelection({ type: "map" });
      return;
    }
    if (target.type === "canvas") {
      setSelection({ type: "canvas" });
      return;
    }
    if (target.type === "guests") {
      setSelection({ type: "guests" });
      return;
    }
    setSelection({ type: "cards" });
  };

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
    if (next.type === "province") setActivePanel("assets");
  };

  const exportPng = async () => {
    const svg = posterRef.current;
    if (!svg) return;
    setExportingPng(true);
    try {
      await ensureUserFontsLoaded(userFonts);
      const source = serializePosterSvg(svg, { transparentBackground: transparentExport, blockFontDisplay: true });
      const dataUrl = await svgToPngDataUrl(source, {
        width: project.canvas.width * pngScale,
        height: project.canvas.height * pngScale,
        transparentBackground: transparentExport,
      });
      downloadDataUrl(dataUrl, "我的毕业去向图.png");
      setStatusMessage("PNG 已导出");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "PNG 导出失败");
    } finally {
      setExportingPng(false);
    }
  };

  const addText = () => {
    const element = createTextElement("给未来的一封信", 720, 870);
    commitProject(
      applyTransaction(project, {
        id: createId("tx-text"),
        label: "添加文本框",
        source: "manual",
        apply: (current) => ({
          ...current,
          textElements: [...current.textElements, element],
        }),
      }),
    );
    setSelection({ type: "text", id: element.id });
  };

  const addNote = () => {
    const element = createNoteElement("山高水长，来日再聚", 745, 905);
    commitProject(applyTransaction(project, {
      id: createId("tx-note"),
      label: "添加特别备注",
      source: "manual",
      apply: (current) => ({ ...current, textElements: [...current.textElements, element] }),
    }));
    setSelection({ type: "text", id: element.id });
  };

  const removeText = (id: string) => {
    commitProject(applyTransaction(project, {
      id: `tx-text-delete-${id}`,
      label: "删除文本",
      source: "manual",
      apply: (current) => deleteText(current, id),
    }));
    setSelection({ type: "canvas" });
  };

  const removeAsset = (id: string) => {
    commitProject(applyTransaction(project, {
      id: `tx-asset-delete-${id}`,
      label: "删除素材实例",
      source: "manual",
      apply: (current) => deleteAsset(current, id),
    }));
    setSelection({ type: "canvas" });
  };

  const duplicateAsset = (id: string) => {
    const source = project.assetElements.find((asset) => asset.id === id);
    if (!source) return;
    const copy = duplicateAssetElement(source);
    commitProject(applyTransaction(project, {
      id: `tx-asset-duplicate-${id}`,
      label: "复制素材实例",
      source: "manual",
      apply: (current) => ({ ...current, assetElements: [...current.assetElements, copy] }),
    }));
    setSelection({ type: "asset", id: copy.id });
  };

  const changeAssetLayer = (id: string, delta: -1 | 1) => {
    const asset = project.assetElements.find((item) => item.id === id);
    if (!asset) return;
    patchScene({ type: "asset", id }, { zIndex: asset.zIndex + delta });
  };

  const applySystemTemplate = (templateId: MapTemplateId) => {
    const scene = createDefaultScene(templateId);
    commitProject(applyTransaction(project, {
      id: createId(`tx-template-${templateId}`),
      label: `应用内置模板：${createSystemTemplate(templateId).name}`,
      source: "manual",
      apply: (current) => ({
        ...current,
        templateId,
        canvas: scene.canvas,
        map: scene.map,
        cards: scene.cards,
        textElements: scene.textElements,
        assetElements: scene.assetElements,
        style: {
          ...current.style,
          cardPreset: scene.cards.preset,
          mapScale: scene.map.scale,
          backgroundColor: scene.canvas.backgroundColor,
          visibleFields: [...scene.cards.visibleFields],
        },
      }),
    }));
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
    const record = createCustomTemplateFromProject({
      name: name.trim(),
      baseTemplateId: project.templateId,
      scope,
      overrides: {
        background: {
          type: project.canvas.backgroundImageSrc ? "image" : "color",
          color: project.canvas.backgroundColor || createSystemTemplate(project.templateId).background.color,
          imageSrc: project.canvas.backgroundImageSrc,
          opacity: project.canvas.backgroundOpacity,
          blur: 0,
          layer: "behind-map",
        },
        map: {
          ...createSystemTemplate(project.templateId).map,
          scale: project.map.scale,
          offsetX: project.map.x,
          offsetY: project.map.y,
          landColor: project.map.landColor,
          activeColor: project.map.activeColor,
          edgeColor: project.map.edgeColor,
          edgeStyle: project.map.edgeStyle ?? "solid",
          edgeWidth: project.map.edgeWidth ?? 1,
          showProvinceLabels: project.map.showProvinceLabels,
          provinceStyles: project.map.provinceStyles ?? {},
        },
        cards: {
          ...createSystemTemplate(project.templateId).cards,
          preset: project.cards.preset,
          grouping: project.cards.grouping,
          maxWidth: project.cards.maxWidth,
          padding: project.cards.padding,
          background: project.cards.background,
          textColor: project.cards.textColor,
        },
        visibleFields: project.cards.visibleFields,
        regionalAssets: project.style.regionalAssets,
      },
      scene: {
        canvas: project.canvas,
        map: project.map,
        cards: project.cards,
        guests: project.guests,
        textElements: project.textElements,
        assetElements: project.assetElements,
      },
      students: project.students,
    });
    const next = [record, ...customTemplates].slice(0, 20);
    setCustomTemplates(next);
    setStatusMessage(`已保存模板：${record.name}`);
  };

  const createNewProject = () => {
    if (!window.confirm("新建项目会清空当前未保存修改，是否继续？")) return;
    const next = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    setProject(next);
    setPreviewCommands([]);
    setSelection({ type: "canvas" });
    setSelectedStudentId(null);
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setStatusMessage("已新建空项目");
  };

  const restoreLocalProject = () => {
    const next = loadInitialProject();
    setProject(next);
    setPreviewCommands([]);
    setSelection({ type: "canvas" });
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setStatusMessage("已恢复本机最近项目");
  };

  const openGlobalData = (initialView: GlobalDataView = "overview") => {
    setGlobalDataInitialView(initialView);
    setGlobalDataOpen(true);
    setGlobalSettingsSection(null);
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
  };

  const dataWorkspaceProps = {
    students: project.students,
    dataView: project.dataView,
    onChangeDataView: (view: DataViewId) => commitProjectTransaction({
      id: createId(`tx-data-view-${view}`),
      label: `切换数据呈现：${view}`,
      source: "manual" as const,
      apply: (current: ProjectDocument) => applyDataViewChange(current, view),
    }),
    onAppendStudents: (records: typeof project.students) => commitProjectTransaction({
      id: createId("tx-append"),
      label: `追加 ${records.length} 名学生`,
      source: "import" as const,
      apply: (current: ProjectDocument) => ({ ...current, students: [...current.students, ...records] }),
    }),
    onReplaceStudents: (records: typeof project.students) => commitProjectTransaction({
      id: createId("tx-replace"),
      label: `替换为 ${records.length} 名学生`,
      source: "import" as const,
      apply: (current: ProjectDocument) => ({ ...current, students: records }),
    }),
    onUpdateStudent: (id: string, patch: Partial<Pick<typeof project.students[number], "name" | "university" | "city" | "province" | "locationScope">>) => commitProjectTransaction({
      id: createId(`tx-student-update-${id}`),
      label: "编辑学生记录",
      source: "manual" as const,
      apply: (current: ProjectDocument) => ({
        ...current,
        students: current.students.map((student) => {
          if (student.id !== id) return student;
          const next = { ...student, ...patch };
          if (!("province" in patch) || patch.province) return next;
          const { province: _cleared, ...rest } = next;
          return rest;
        }),
      }),
    }),
    onToggleVisibility: (id: string) => commitProjectTransaction({
      id: createId(`tx-student-visibility-${id}`),
      label: "切换学生显示状态",
      source: "manual" as const,
      apply: (current: ProjectDocument) => ({
        ...current,
        students: current.students.map((student) => student.id === id ? { ...student, visibility: student.visibility === false } : student),
      }),
    }),
    onDeleteStudent: (id: string) => commitProjectTransaction({
      id: createId(`tx-student-delete-${id}`),
      label: "删除学生记录",
      source: "manual" as const,
      apply: (current: ProjectDocument) => ({ ...current, students: current.students.filter((student) => student.id !== id) }),
    }),
    onSetStudentsVisibility: (visibility: boolean) => commitProjectTransaction({
      id: createId(`tx-students-visibility-${visibility}`),
      label: visibility ? "全部显示学生" : "全部隐藏学生",
      source: "manual" as const,
      apply: (current: ProjectDocument) => ({ ...current, students: current.students.map((student) => ({ ...student, visibility })) }),
    }),
    selectedStudentId,
    onSelectStudent: setSelectedStudentId,
  };

  const handleWorkflowStepChange = (id: WorkflowPanelId) => {
    if (id === "roster") {
      openGlobalData("overview");
      return;
    }
    setActivePanel(id);
    const workflowId: WorkflowStepId = id === "map"
      ? "presentation"
      : id === "layout"
        ? "layout"
        : id === "deliver"
          ? "export"
          : "local";
    setActiveWorkflowStep(workflowId);
  };

  if (globalDataOpen) {
    return (
      <div className="app-shell" data-editor-theme={resolvedTheme}>
        <GlobalDataScreen
          project={project}
          initialView={globalDataInitialView}
          summary={dataHealth}
          issues={dataIssues}
          dataViewLabel={dataViewLabel}
          selectedStudentId={selectedStudentId}
          onSelectStudent={setSelectedStudentId}
          onClose={() => setGlobalDataOpen(false)}
          onChangeDataView={dataWorkspaceProps.onChangeDataView}
          templates={( ["original", "cartoon", "grain", "q", "scenery"] as const).map((templateId) => ({
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
          onOpenGlobalSettings={() => {
            setGlobalDataOpen(false);
            setActiveWorkflowStep("layout");
            setGlobalSettingsSection("canvas");
          }}
          dataWorkspaceProps={dataWorkspaceProps}
        />
      </div>
    );
  }

  if (globalSettingsSection) {
    return (
      <div className="app-shell" data-editor-theme={resolvedTheme}>
        <header className="topbar">
          <div className="brand">
            <MapPinned size={24} />
            <span className="brand-label brand-label__full">蹭饭地图工作室</span>
            <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
            <em>Beta</em>
          </div>
          <div className="topbar-workflow" aria-hidden="false">
            <WorkflowStepper activeId={activePanel} progress={workflowProgress} onChange={handleWorkflowStepChange} />
          </div>
          <div className="topbar-actions" />
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
        onArrangeCards={arrangeCards}
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
        onUploadFont={(font) => {
          setUserFonts((current) => [...current, font]);
          setStatusMessage(`已上传字体：${font.label}`);
        }}
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
          onOpenGlobalData={() => openGlobalData("roster")}
          themeMode={themeMode}
          resolvedTheme={resolvedTheme}
          onThemeChange={setThemeMode}
        />
      </div>
    );
  }

  return (
    <main className="app-shell" data-editor-theme={resolvedTheme}>
      <header className="topbar">
        <div className="brand">
          <MapPinned size={24} />
          <span className="brand-label brand-label__full">蹭饭地图工作室</span>
          <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
          <em>Beta</em>
        </div>
        <div className="topbar-workflow" aria-hidden="false">
          <WorkflowStepper activeId={activePanel} progress={workflowProgress} onChange={handleWorkflowStepChange} />
          <div className="topbar-workflow__legacy" aria-hidden="true">
          <ToolbarGroup label="制作流程">
            <WorkflowGuide
              progress={workflowProgress}
              activeStep={activeWorkflowStep}
              dataView={dataView}
              dataViewLabel={dataViewLabel}
              selectionDescription={selectionDescription}
              templates={(["original", "cartoon", "grain", "q", "scenery"] as const).map((templateId) => ({
                id: templateId,
                name: createSystemTemplate(templateId).name,
              }))}
              currentTemplateId={template}
              customTemplates={customTemplates.map(({ id, name, scope }) => ({ id, name, scope }))}
              exportWarnings={exportWarnings}
              onSelectStep={setActiveWorkflowStep}
              onChangeDataView={(view) => {
                commitProjectTransaction({
                  id: createId(`tx-data-view-${view}`),
                  label: `切换数据呈现：${view}`,
                  source: "manual",
                  apply: (current) => applyDataViewChange(current, view),
                });
              }}
              onOpenGlobalSettings={setGlobalSettingsSection}
              onArrangeCards={arrangeCards}
              onApplyTemplate={applySystemTemplate}
              onApplyCustomTemplate={(record) => {
                const full = customTemplates.find((item) => item.id === record.id);
                if (full) applyCustomTemplateRecord(full);
              }}
              onSaveTemplate={saveCurrentTemplate}
              onFocusStudent={(id) => {
                setSelectedStudentId(id);
                setGlobalSettingsSection("cards");
              }}
              onExportPng={() => void exportPng()}
              onExportSvg={exportSvg}
              onExportProject={openProjectExportDialog}
              onSaveLocal={() => void overwriteBrowserStorage()}
              onOpenAssets={() => setActivePanel("assets")}
            />
          </ToolbarGroup>
          </div>
        </div>
        <div className="topbar-actions">
          <ToolbarGroup label="项目设置">
            <button
              type="button"
              className="secondary-button global-settings-entry"
              aria-label="打开全局设置"
              onClick={() => {
                setActiveWorkflowStep("layout");
                setGlobalSettingsSection("canvas");
              }}
            >
              <SlidersHorizontal size={16} aria-hidden />
              <span>全局设置</span>
            </button>
          </ToolbarGroup>
          <ToolbarGroup label="历史与缩放">
            <ToolbarButton
              label={undoLabel}
              icon={<Undo2 size={18} />}
              disabled={!canUndo}
              onClick={handleUndo}
            />
            <ToolbarButton
              label={redoLabel}
              icon={<Redo2 size={18} />}
              disabled={!canRedo}
              onClick={handleRedo}
            />
            <span className="zoom-label" aria-label="当前缩放">{zoomPercent}%</span>
            <ToolbarButton
              label="缩小画布"
              icon={<ZoomOut size={17} />}
              onClick={() => setZoomPercent((value) => Math.max(25, value - 10))}
            />
            <ToolbarButton
              label="放大画布"
              icon={<ZoomIn size={17} />}
              onClick={() => setZoomPercent((value) => Math.min(300, value + 10))}
            />
          </ToolbarGroup>

          <ToolbarGroup label="属性面板" className="inspector-toggle-group">
            <ToolbarButton
              className="inspector-toggle"
              label={mobileInspectorOpen ? "关闭属性面板" : "打开属性面板"}
              icon={mobileInspectorOpen ? <PanelRightClose size={17} /> : <PanelRight size={17} />}
              aria-expanded={mobileInspectorOpen}
              aria-controls="editor-inspector"
              onClick={() => setMobileInspectorOpen((open) => !open)}
            />
          </ToolbarGroup>

          <ToolbarGroup label="界面主题">
            <ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={setThemeMode} />
          </ToolbarGroup>

          <ToolbarGroup label="导出与工程">
            <button className="primary-button" onClick={exportPng} disabled={exportingPng}>
              <ImageDown size={16} /> {exportingPng ? "导出中..." : "导出 PNG"}
            </button>
            <details className="project-menu">
              <summary className="secondary-button" aria-label="打开项目菜单">
                <FolderOpen size={16} /> <span>项目</span>
              </summary>
              <div className="project-menu__popover">
                <section>
                  <strong>项目管理</strong>
                  <button type="button" aria-label="新建项目" onClick={createNewProject}><Plus size={16} /> 新建项目</button>
                  <button type="button" aria-label="恢复本机最近项目" onClick={restoreLocalProject}><FolderOpen size={16} /> 恢复最近项目</button>
                  <button type="button" aria-label="保存项目到本机" onClick={() => void overwriteBrowserStorage()}><Save size={16} /> 保存到本机</button>
                </section>
                <section>
                  <strong>导出海报</strong>
                  <label>PNG 倍率
                    <select aria-label="PNG 导出倍率" value={pngScale} onChange={(event) => setPngScale(Number(event.target.value))}>
                      <option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option>
                    </select>
                  </label>
                  <label className="project-menu__check"><input type="checkbox" checked={transparentExport} onChange={(event) => setTransparentExport(event.target.checked)} />透明背景</label>
                  <button type="button" onClick={exportSvg}><Download size={16} /> 导出 SVG</button>
                </section>
                <section>
                  <strong>在线协作</strong>
                  <div className="collaboration-control project-menu__collaboration">
                    <button
                      type="button"
                      className={`secondary-button collaboration-button ${roomId ? "is-connected" : ""}`}
                      aria-label="增量在线协作"
                      aria-expanded={collaborationOpen}
                      onClick={() => setCollaborationOpen((open) => !open)}
                    >
                      <Share2 size={16} /> <span>{roomId ? roomId : "增量协作"}</span>
                    </button>
                    {collaborationOpen && (
                      <section className="collaboration-popover" aria-label="增量协作设置">
                        <header>
                          <strong>在线协作</strong>
                          <span>v{roomVersion} · 增量同步</span>
                        </header>
                        {roomId ? (
                          <>
                            <div className="collaboration-room-code">
                              <b>{roomId}</b>
                              <button type="button" aria-label="复制房间码" onClick={() => void navigator.clipboard?.writeText(roomId)}><Copy size={15} /></button>
                            </div>
                            <small data-collaboration-status={collaborationStatus}>{collaborationMessage}</small>
                            <button type="button" className="collaboration-leave" onClick={leaveCollaborationRoom}><LogOut size={14} /> 断开房间</button>
                          </>
                        ) : (
                          <>
                            <p>未连接时不会上传或覆盖工程。创建或加入后，仅发送变化字段；同一路径冲突会暂停上传。</p>
                            <button type="button" className="collaboration-create" disabled={collaborationStatus === "connecting"} onClick={() => void startCollaborationRoom()}><Share2 size={14} /> 创建房间</button>
                            <div className="collaboration-join">
                              <input aria-label="协作房间码" value={roomInput} maxLength={12} placeholder="输入房间码" onChange={(event) => setRoomInput(event.target.value.toUpperCase())} />
                              <button type="button" disabled={!roomInput.trim() || collaborationStatus === "connecting"} onClick={() => void joinCollaborationRoom()}>加入</button>
                            </div>
                            <small data-collaboration-status={collaborationStatus}>{collaborationMessage}</small>
                          </>
                        )}
                      </section>
                    )}
                  </div>
                </section>
                <section>
                  <strong>工程文件</strong>
                  <button
                    type="button"
                    aria-label="强制保存到浏览器本地"
                    title="立即将当前工程、素材、字体、模板和渲染设置覆盖到浏览器本地存储"
                    disabled={syncState.status === "saving"}
                    onClick={() => void overwriteBrowserStorage()}
                  >
                    <Save size={16} /> {syncState.status === "saving" ? "保存中" : "保存到本机"}
                  </button>
                  <button type="button" onClick={openProjectExportDialog}><PackageOpen size={16} /> 导出工程</button>
                  <label className="project-menu__file"><PackageOpen size={16} /> 导入工程
                    <input type="file" accept="application/json,.json" aria-label="导入完整工程包" onChange={(event) => importProjectPackage(event.target.files?.[0] ?? null)} />
                  </label>
                </section>
              </div>
            </details>
          </ToolbarGroup>
        </div>
      </header>


      {showProjectExportDialog && (
        <div className="dialog-backdrop" onMouseDown={() => setShowProjectExportDialog(false)}>
          <section
            className="export-project-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="导出工程确认"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>确认导出工程</h2>
                <p>工程文件会保存当前画布、名单、模板和渲染设置。</p>
              </div>
              <button type="button" aria-label="关闭导出工程确认" onClick={() => setShowProjectExportDialog(false)}>×</button>
            </header>
            <label className="export-resource-option">
              <input
                type="checkbox"
                aria-label="导出时包含资源包"
                checked={includeResourcesInProjectExport}
                onChange={(event) => setIncludeResourcesInProjectExport(event.target.checked)}
              />
              <span>
                <strong>包含资源包</strong>
                <small>一并打包地图背景、地图贴图、素材和字体；导入后会立刻同步到画布与素材库。</small>
              </span>
            </label>
            {!includeResourcesInProjectExport && (
              <p className="export-resource-warning">未包含资源包时，其他设备可能缺少素材库条目和自定义字体。</p>
            )}
            <footer>
              <button type="button" className="secondary-button" onClick={() => setShowProjectExportDialog(false)}>取消</button>
              <button type="button" className="primary-button" aria-label="确认导出工程" onClick={exportProjectPackage}>确认导出</button>
            </footer>
          </section>
        </div>
      )}

      <section
        className="workspace"
        style={workspaceStyle}
        data-editor-resizing={resizingPanel ? "true" : undefined}
        data-resizing-panel={resizingPanel ?? undefined}
      >
        <aside className="sidebar">
          {activePanel === "roster" && (
            <div className="panel-content workflow-panel workflow-panel--roster">
              <div className="panel-heading"><span>名单检查</span><small>{project.students.length} 条记录</small></div>
              <DataWorkspace {...dataWorkspaceProps} />
            </div>
          )}

          {activePanel === "map" && (
            <div className="panel-content workflow-panel workflow-panel--map">
              <div className="panel-heading"><span>地图表达</span><small>选择读图方式</small></div>
              <SegmentedControl
                label="地图表达"
                activeId={dataView}
                items={dataViews.map((view) => ({ id: view.id, label: view.name.replace("卡片", ""), ariaLabel: `${view.name}：${view.description}` }))}
                onChange={(view) => commitProjectTransaction({ id: createId(`tx-data-view-${view}`), label: `切换数据呈现：${view}`, source: "manual", apply: (current) => applyDataViewChange(current, view) })}
                className="workflow-data-views"
              />
              <MapInspector map={project.map} mode="global" collapsible onPatch={(patch) => patchScene({ type: "map" }, patch)} onReset={() => resetSceneTarget({ type: "map" })} />
            </div>
          )}

          {activePanel === "layout" && (
            <div className="panel-content">
              <div className="panel-heading">
                <span>内置模板</span>
                <small>应用整套地图元素</small>
              </div>
              <div className="template-grid" aria-label="内置整体模板">
                {(["original", "cartoon", "grain", "q", "scenery"] as const).map((templateId) => {
                  const template = createSystemTemplate(templateId);
                  return <button
                    key={templateId}
                    type="button"
                    className={`template-card ${project.templateId === templateId ? "selected" : ""}`}
                    onClick={() => applySystemTemplate(templateId)}
                  >
                    <span className={`template-card__preview template-card__preview--${templateId}`} />
                    <strong>{template.name}</strong>
                  </button>;
                })}
              </div>
              <button className="wide-button" type="button" onClick={saveCurrentTemplate}><Save size={16} /> 保存当前整体模板</button>

              {customTemplates.length > 0 && (
                <>
                  <div className="panel-heading data-heading">
                    <span>我的模板</span>
                    <small>{customTemplates.length}</small>
                  </div>
                  <div className="view-list">
                    {customTemplates.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => applyCustomTemplateRecord(item)}
                      >
                        <strong>{item.name}</strong>
                        <span>
                          {item.scope === "visual" ? "视觉样式" : "布局倾向"} ·{" "}
                          {item.baseTemplateId}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}


          {activePanel === "assets" && (
            <div className="panel-content">
              <AssetPanel
                instances={project.assetElements
                  .filter((element) => element.kind !== "province-texture")
                  .map((element) => ({
                    id: element.id,
                    assetId: element.assetId,
                    label: element.label,
                    kind: element.kind,
                  }))}
                provinces={provinceNames}
                dataProvinces={summary.map((item) => item.province)}
                selectedProvince={selection.type === "province" ? selection.province : ""}
                selectedProvinceStyle={selection.type === "province" ? project.map.provinceStyles?.[selection.province] : undefined}
                provinceStyles={project.map.provinceStyles}
                provinceAdjacency={CHINA_PROVINCE_ADJACENCY}
                mapBaseColor={project.map.landColor}
                posterBackground={project.canvas.backgroundColor}
                provinceTextureUniformSize={project.map.provinceTextureUniformSize}
                userAssets={userAssets}
                assetUsageById={assetUsageById}
                onPatchProvinceTextureUniformSize={(provinceTextureUniformSize) => {
                  patchScene({ type: "map" }, { provinceTextureUniformSize });
                }}

                onSelectProvince={(province) => {
                  if (province) {
                    setSelection({ type: "province", province });
                    setActivePanel("assets");
                  }
                }}
                onSelectInstance={(id) => setSelection({ type: "asset", id })}
                onApplyBackground={(asset) => {
                  commitProject(
                    applyTransaction(project, {
                      id: createId("tx-bg"),
                      label: `应用背景：${asset.label}`,
                      source: "manual",
                      apply: (current) => ({
                        ...current,
                        canvas: {
                          ...current.canvas,
                          backgroundImageSrc: asset.src,
                        },
                        style: {
                          ...current.style,
                          backgroundImageSrc: asset.src,
                        },
                      }),
                    }),
                  );
                }}
                onCreateLandmark={(asset) => {
                  const selectedProvince = selection.type === "province" ? selection.province : "";
                  const element = createLandmarkElement(asset, selectedProvince || "全国", {
                    x: project.map.x + project.map.width / 2 - 60,
                    y: project.map.y + project.map.height / 2 - 60,
                  });
                  commitProject(
                    applyTransaction(project, {
                      id: createId("tx-landmark"),
                      label: `添加地标：${asset.label}`,
                      source: "manual",
                      apply: (current) => ({
                        ...current,
                        assetElements: [...current.assetElements, element],
                      }),
                    }),
                  );
                  setSelection({ type: "asset", id: element.id });
                }}
                onCreateDecoration={(asset) => {
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
                }}
                onApplyProvinceAppearance={(province, appearance: ProvinceAppearance, fill?: string) => {
                  try {
                    setSelection({ type: "province", province });
                    setActivePanel("assets");
                    commitProjectTransaction(
                      createSceneTransaction(
                        { type: "province", province },
                        { appearance, ...(fill ? { fill } : {}) },
                      ),
                    );
                    setStatusMessage(`已应用到地图：${province}`);
                  } catch (error) {
                    setStatusMessage(error instanceof Error ? error.message : "应用省份贴图失败");
                  }
                }}
                onApplyProvinceThemes={(themeResults: Record<string, ImageThemeResult>) => {
                  const entries = Object.entries(themeResults);
                  if (entries.length === 0) return;
                  commitProjectTransaction(createProvinceThemeTransaction(themeResults));
                  setStatusMessage(`已应用 ${entries.length} 个省份智能底色`);
                }}
                onResetProvinceAppearance={(province) => {
                  try {
                    setSelection({ type: "province", province });
                    setActivePanel("assets");
                    commitProjectTransaction(
                      createSceneTransaction(
                        { type: "province", province },
                        { appearance: undefined, fill: undefined, textureSrc: undefined },
                      ),
                    );
                    setStatusMessage(`已恢复系统默认：${province}`);
                  } catch (error) {
                    setStatusMessage(error instanceof Error ? error.message : "恢复省份外观失败");
                  }
                }}
                onAddUserAsset={addUserAsset}
                onReplaceUserAsset={replaceUserAsset}
                onDeleteUserAsset={deleteUserAsset}
                onExportResourcePack={exportResourcePack}
                onImportResourcePack={importResourcePack}
              />
            </div>
          )}

          {activePanel === "deliver" && (
            <div className="panel-content workflow-panel workflow-panel--deliver">
              <div className="panel-heading"><span>交付检查</span><small>{exportWarnings.unresolvedStudents.length || exportWarnings.hiddenStudents.length ? "需检查" : "可以导出"}</small></div>
              <div className="workflow-delivery-checks">
                <div><strong>{project.students.length}</strong><span>名单记录</span></div>
                <div><strong>{summary.length}</strong><span>目的省市</span></div>
              </div>
              {exportWarnings.unresolvedStudents.length > 0 && <p className="panel-note">{exportWarnings.unresolvedStudents.length} 个城市未匹配，可返回「名单」修正。</p>}
              {exportWarnings.hiddenStudents.length > 0 && <p className="panel-note">{exportWarnings.hiddenStudents.length} 条记录已隐藏，不会出现在海报中。</p>}
              <ActionGroup label="交付操作" className="workflow-delivery-actions">
                <button className="wide-button workflow-export-button" type="button" onClick={() => void exportPng()} disabled={exportingPng}><ImageDown size={16} />{exportingPng ? "导出中..." : "导出 PNG"}</button>
                <CompactButton icon={<Download size={14} aria-hidden />} onClick={exportSvg}>导出 SVG</CompactButton>
                <CompactButton icon={<Save size={14} aria-hidden />} onClick={() => void overwriteBrowserStorage()} disabled={syncState.status === "saving"}>保存到本机</CompactButton>
                <CompactButton icon={<PackageOpen size={14} aria-hidden />} onClick={openProjectExportDialog}>导出工程</CompactButton>
              </ActionGroup>
            </div>
          )}

          {activePanel === "content" && (
            <div className="panel-content workflow-panel workflow-panel--content">
              <SegmentedControl
                label="内容工具"
                activeId={contentView}
                items={[{ id: "layers", label: "画布图层" }, { id: "assistant", label: "AI 助手" }]}
                onChange={setContentView}
                className="content-tool-tabs"
              />
              {contentView === "layers" ? (
                <>
                  <div className="panel-heading">
                    <span>画布元素</span>
                    <small>可编辑图层</small>
                  </div>
                  <ActionGroup label="添加画布元素" className="content-add-actions">
                    <CompactButton icon={<Plus size={14} aria-hidden />} onClick={addText}>添加文本框</CompactButton>
                    <CompactButton icon={<Plus size={14} aria-hidden />} onClick={addNote}>添加特别备注</CompactButton>
                  </ActionGroup>

                  <div className="element-list" role="list" aria-label="画布图层">
                    {STYLE_LAYER_TARGETS.map((target) => {
                      const selected = target.type === "text"
                        ? selection.type === "text" && selection.id === target.id
                        : selection.type === target.type;
                      const dotClass = target.type === "text"
                        ? (target.id === "text-title" ? "title-dot" : "subtitle-dot")
                        : target.type === "map"
                          ? "map-dot"
                          : target.type === "cards"
                            ? "cards-dot"
                            : target.type === "guests"
                              ? "guests-dot"
                              : "canvas-dot";
                      return (
                        <button
                          key={target.label}
                          type="button"
                          role="listitem"
                          className={selected ? "is-active" : undefined}
                          aria-pressed={selected}
                          onClick={() => selectStyleLayer(target)}
                        >
                          <span className={`layer-dot ${dotClass}`} />
                          {target.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="panel-note">点击图层可在右侧打开对应属性面板；数据卡片会同时切换到「板块」页。可管理画布、标题、地图、卡片与特邀嘉宾。</p>
                  <p className="panel-note">
                    当前模板参数：scale {resolvedTemplate.map.scale.toFixed(2)} ·{" "}
                    {resolvedTemplate.cards.preset} · 字段{" "}
                    {resolvedTemplate.visibleFields.join("/")}
                  </p>
                </>
              ) : (
                <>
                  <div className="panel-heading"><span>AI 助手</span><small>可预览后应用</small></div>
                  <AiAssistant
                    studentCount={project.students.length}
                    templateId={project.templateId}
                    dataView={project.dataView}
                    onPreview={setPreviewCommands}
                    onApply={(commands, label) => {
                      commitProject(applyEditorCommands(project, commands, label));
                    }}
                  />
                  {isPreviewing && (
                    <p className="panel-note">
                      正在预览 {previewCommands.length} 条 AI 命令，尚未写入项目。
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </aside>

        <section className="editor-area">
          <div className="editor-toolbar">
            <span>
              <b>毕业去向图</b>
              <small>
                {" "}
                · {isPreviewing ? "AI 预览中" : "手动保存模式"} · 同源 API
              </small>
            </span>
            <div className="editor-toolbar-actions">
              <ControlCluster label="视图">
              <button type="button" aria-label="适应画布" onClick={fitCanvasToStage}>适应画布</button>
              <button
                type="button"
                aria-label={showGrid ? "关闭网格" : "打开网格"}
                aria-pressed={showGrid}
                className={showGrid ? "is-active" : undefined}
                onClick={() => setShowGrid((value) => !value)}
              >
                网格
              </button>
              <button
                type="button"
                aria-label={snapToGridEnabled ? "关闭吸附" : "打开吸附"}
                aria-pressed={snapToGridEnabled}
                className={snapToGridEnabled ? "is-active" : undefined}
                disabled={!showGrid}
                onClick={() => setSnapToGridEnabled((value) => !value)}
              >
                吸附
              </button>
              <label className="grid-size-control" htmlFor="editor-grid-size">
                间距
                <input
                  id="editor-grid-size"
                  type="number"
                  min={4}
                  max={200}
                  value={gridSize}
                  disabled={!showGrid}
                  onChange={(event) => setGridSize(clampGridSize(event.target.value))}
                />
              </label>
              </ControlCluster>
              <ControlCluster label="预览设置">
              <label className="render-mode-control" htmlFor="editor-render-mode">
                预览
                <select
                  id="editor-render-mode"
                  aria-label="预览帧率模式"
                  value={renderSettings.mode}
                  onChange={(event) => setRenderSettings((current) => normalizeRenderSettings({ ...current, mode: event.target.value }))}
                >
                  <option value="high">高帧</option>
                  <option value="normal">标准</option>
                  <option value="low">省电</option>
                  <option value="fixed">自定义</option>
                </select>
              </label>
              {renderSettings.mode === "fixed" && (
                <label className="render-mode-control" htmlFor="editor-render-fps">
                  FPS
                  <input
                    id="editor-render-fps"
                    aria-label="自定义预览帧率"
                    type="number"
                    min={0.2}
                    max={30}
                    step={0.1}
                    value={renderSettings.fixedFps}
                    onChange={(event) => setRenderSettings((current) => normalizeRenderSettings({ ...current, fixedFps: event.target.value }))}
                  />
                </label>
              )}
              </ControlCluster>
            </div>
          </div>
          <div className="canvas-stage" ref={stageRef}>
            <div
              className="canvas-zoom-shell"
              style={{
                width: Math.round(project.canvas.width * zoomPercent / 100),
                height: Math.round(project.canvas.height * zoomPercent / 100),
              }}
            >
              <div
                className="canvas-zoom-inner"
                style={{
                  width: project.canvas.width,
                  height: project.canvas.height,
                  transform: `scale(${zoomPercent / 100})`,
                  transformOrigin: "top left",
                }}
              >
                <PosterCanvas
                  project={renderProject}
                  posterRef={posterRef}
                  selectedTextId={selectedTextId}
                  selectedAssetId={selection.type === "asset" ? selection.id : null}
                  selectedProvince={selection.type === "province" ? selection.province : null}
                  userFonts={userFonts}
                  showGrid={showGrid}
                  gridSize={gridSize}
                  renderIntervalMs={resolvedRenderInterval}
                  onSelect={handleSceneSelect}
                  onMoveText={(id, x, y) => {
                    const point = maybeSnap(x, y);
                    commitProject(
                      applyTransaction(project, createSceneTransaction({ type: "text", id }, point)),
                    );
                  }}
                  onMoveAsset={(id, x, y) => {
                    const point = maybeSnap(x, y);
                    const current = project.assetElements.find((asset) => asset.id === id);
                    if (!current || (current.x === point.x && current.y === point.y)) return;
                    commitProject(
                      applyTransaction(project, createSceneTransaction({ type: "asset", id }, point)),
                    );
                  }}
                  onResizeAsset={(id, x, y, width, height) => {
                    const point = maybeSnap(x, y);
                    const current = project.assetElements.find((asset) => asset.id === id);
                    if (!current || (current.x === point.x && current.y === point.y && current.width === width && current.height === height)) return;
                    commitProject(
                      applyTransaction(project, createSceneTransaction({ type: "asset", id }, { x: point.x, y: point.y, width, height })),
                    );
                  }}
                  mapSelected={selection.type === "map"}
                  onMoveProvinceTexture={(province, offsetX, offsetY) => {
                    const appearance = project.map.provinceStyles?.[province]?.appearance;
                    if (!appearance || appearance.kind === "manual-color") return;
                    commitProject(
                      applyTransaction(project, createSceneTransaction(
                        { type: "province", province },
                        { appearance: { ...appearance, offsetX, offsetY } },
                      )),
                    );
                  }}
                  onResizeMapImage={(alignment) => {
                    const rs = project.map.renderSource;
                    if (rs?.kind !== "image" || !rs.alignment) return;
                    commitProject(
                      applyTransaction(project, createSceneTransaction({ type: "map" }, {
                        renderSource: { ...rs, alignment: { ...rs.alignment, ...alignment } },
                      })),
                    );
                  }}
                  selectedStudentId={selectedStudentId}
                  onSelectStudent={setSelectedStudentId}
                  onMoveCard={(id, x, y) => {
                    const point = maybeSnap(x, y);
                    commitProject(
                      applyTransaction(project, {
                        id: createId(`tx-card-position-${id}`),
                        label: "调整数据框位置",
                        source: "manual",
                        apply: (current) => ({
                          ...current,
                          cards: { ...current.cards, positions: { ...current.cards.positions, [id]: point } },
                        }),
                      }),
                    );
                  }}
                  onMoveGuests={(x, y) => {
                    const point = maybeSnap(x, y);
                    commitProject(
                      applyTransaction(project, createSceneTransaction({ type: "guests" }, point)),
                    );
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <aside id="editor-inspector" className={`inspector${mobileInspectorOpen ? " is-open" : ""}`}>
          <InspectorPanel
            project={renderProject}
            selection={selection}
            userFonts={userFonts}
            onPatch={patchScene}
            onReset={resetSceneTarget}
            onDeleteText={removeText}
            onDeleteAsset={removeAsset}
            onDuplicateAsset={duplicateAsset}
            onLayerChange={changeAssetLayer}
            onAddUserAsset={addUserAsset}
            provinces={provinceNames}
            onOpenGlobalSettings={setGlobalSettingsSection}
            onArrangeCards={arrangeCards}
            onApplyFont={applyFont}
            onUploadFont={(font) => {
              setUserFonts((current) => [...current, font]);
              setStatusMessage(`已上传字体：${font.label}`);
            }}
            onDeleteUserFont={deleteUserFont}

          />
          <details className="project-summary">
            <summary>项目摘要</summary>
            <div className="summary-number"><strong>{students.length}</strong><span>学生</span></div>
            <div className="summary-number"><strong>{summary.length}</strong><span>目的省市</span></div>
            <p>{dataViews.find((view) => view.id === dataView)?.description}</p>
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

        <ResizablePanelDivider
          side="sidebar"
          value={panelLayout.sidebarWidth}
          min={sidebarBounds.min}
          max={sidebarBounds.max}
          ariaLabel="调整左侧栏宽度"
          onChange={(value) => updatePanelWidth("sidebar", value)}
          onResizeStart={() => setResizingPanel("sidebar")}
          onResizeEnd={() => setResizingPanel(null)}
        />
        <ResizablePanelDivider
          side="inspector"
          value={panelLayout.inspectorWidth}
          min={inspectorBounds.min}
          max={inspectorBounds.max}
          ariaLabel="调整右侧栏宽度"
          onChange={(value) => updatePanelWidth("inspector", value)}
          onResizeStart={() => setResizingPanel("inspector")}
          onResizeEnd={() => setResizingPanel(null)}
        />
      </section>
    </main>
  );
}
