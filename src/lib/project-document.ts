import type { CanvasText, CanvasTextInput } from "./canvas-data";
import type { DataViewId, MapTemplateId, Student } from "./project-data";
import type { CardPreset, VisibleField } from "./template-document";
import {
  createDefaultScene,
  normalizeScene,
  type AssetElement,
  type CanvasSettings,
  type CardSettings,
  type GuestPanelSettings,
  type MapSettings,
} from "./scene-document";
import { migrateProjectPayload } from "./project-migration";
import { createId } from "./ids";

export interface ProjectHistoryEntry {
  id: string;
  label: string;
  source: "manual" | "ai" | "import";
  historyGroup?: string;
  committedAt?: number;
  snapshot: ProjectSnapshot;
}

export interface ProjectHistory {
  past: ProjectHistoryEntry[];
  future: ProjectHistoryEntry[];
}

export interface ProjectStyleState {
  cardPreset: CardPreset;
  mapScale: number;
  backgroundColor?: string;
  visibleFields: VisibleField[];
  backgroundImageSrc?: string;
  regionalAssets: Record<string, Array<{
    id: string;
    label: string;
    src: string;
    mode: "clip" | "overlay" | "card-thumb";
    opacity: number;
    scale: number;
  }>>;
}

export interface ProjectSnapshot {
  schemaVersion: 2;
  students: Student[];
  templateId: MapTemplateId;
  dataView: DataViewId;
  canvas: CanvasSettings;
  map: MapSettings;
  cards: CardSettings;
  guests: GuestPanelSettings;
  textElements: CanvasText[];
  assetElements: AssetElement[];
  style: ProjectStyleState;
  version: number;
}

export interface ProjectDocument extends ProjectSnapshot {
  history: ProjectHistory;
}

export interface ProjectTransaction {
  id: string;
  label: string;
  source: "manual" | "ai" | "import";
  historyGroup?: string;
  apply: (project: ProjectDocument) => ProjectDocument;
}

export function groupingForDataView(dataView: DataViewId): CardSettings["grouping"] {
  if (dataView === "city" || dataView === "university") return dataView;
  return "province";
}

const MAX_HISTORY = 50;
const HISTORY_COALESCE_WINDOW_MS = 800;

export const defaultProjectStyle = (): ProjectStyleState => ({
  cardPreset: "standard",
  mapScale: 1,
  visibleFields: ["name", "university", "city"],
  regionalAssets: {},
});

function completeText(element: CanvasTextInput): CanvasText {
  return {
    role: "custom" as const,
    fontWeight: 500,
    textAlign: "left" as const,
    maxWidth: 320,
    visibility: true,
    ...element,
  };
}

function mergeSceneTexts(defaultTexts: CanvasText[], inputTexts: CanvasTextInput[] | undefined): CanvasText[] {
  if (!inputTexts) return defaultTexts.map(completeText);
  const byId = new Map(defaultTexts.map((element) => [element.id, completeText(element)]));
  for (const element of inputTexts) {
    byId.set(element.id, completeText({ ...byId.get(element.id), ...element }));
  }
  return Array.from(byId.values());
}

function cloneStyle(style: ProjectStyleState): ProjectStyleState {
  return {
    ...style,
    visibleFields: [...style.visibleFields],
    regionalAssets: structuredClone(style.regionalAssets),
  };
}

function cloneScene(project: Pick<ProjectSnapshot, "canvas" | "map" | "cards" | "guests" | "textElements" | "assetElements">) {
  const scene = normalizeScene({
    canvas: project.canvas,
    map: project.map,
    cards: project.cards,
    guests: project.guests,
    textElements: project.textElements.map(completeText),
    assetElements: project.assetElements,
  });
  return {
    canvas: scene.canvas,
    map: scene.map,
    cards: scene.cards,
    guests: scene.guests,
    textElements: scene.textElements as CanvasText[],
    assetElements: scene.assetElements,
  };
}

function cloneSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    schemaVersion: 2,
    students: snapshot.students.map((student) => ({ ...student })),
    templateId: snapshot.templateId,
    dataView: snapshot.dataView,
    ...cloneScene(snapshot),
    style: cloneStyle(snapshot.style),
    version: snapshot.version,
  };
}

function snapshotView(project: ProjectDocument): ProjectSnapshot {
  return {
    schemaVersion: 2,
    students: project.students,
    templateId: project.templateId,
    dataView: project.dataView,
    canvas: project.canvas,
    map: project.map,
    cards: project.cards,
    guests: project.guests,
    textElements: project.textElements,
    assetElements: project.assetElements,
    style: project.style,
    version: project.version,
  };
}

function fromSnapshot(snapshot: ProjectSnapshot, history: ProjectHistory): ProjectDocument {
  return { ...cloneSnapshot(snapshot), history };
}

export function createProjectDocument(input: {
  students: Student[];
  templateId: MapTemplateId;
  dataView: DataViewId;
  textElements?: CanvasTextInput[];
  style?: Partial<ProjectStyleState>;
}): ProjectDocument {
  const scene = createDefaultScene(input.templateId);
  const style: ProjectStyleState = {
    ...defaultProjectStyle(),
    ...(input.style ?? {}),
    visibleFields: input.style?.visibleFields ? [...input.style.visibleFields] : ["name", "university", "city"],
    regionalAssets: input.style?.regionalAssets ? structuredClone(input.style.regionalAssets) : {},
  };
  const sceneCanvas = {
    ...scene.canvas,
    backgroundColor: style.backgroundColor ?? scene.canvas.backgroundColor,
    ...(style.backgroundImageSrc ? { backgroundImageSrc: style.backgroundImageSrc } : {}),
  };
  const sceneMap = {
    ...scene.map,
    scale: style.mapScale,
  };
  const sceneCards = {
    ...scene.cards,
    preset: style.cardPreset,
    grouping: groupingForDataView(input.dataView),
    visibleFields: [...style.visibleFields],
  };
  return {
    schemaVersion: 2,
    students: input.students.map((student) => ({ ...student })),
    templateId: input.templateId,
    dataView: input.dataView,
    canvas: sceneCanvas,
    map: sceneMap,
    cards: sceneCards,
    guests: scene.guests,
    textElements: mergeSceneTexts(scene.textElements, input.textElements),
    assetElements: scene.assetElements,
    style,
    version: 0,
    history: { past: [], future: [] },
  };
}

function cloneProjectForTransaction(project: ProjectDocument): ProjectDocument {
  return {
    ...structuredClone(snapshotView(project)),
    // Transactions can inspect history, but writes must not corrupt snapshots
    // structurally shared by earlier ProjectDocument values.
    history: readonlyView(project.history),
  };
}

function readonlyView<T extends object>(value: T): T {
  const proxies = new WeakMap<object, object>();
  const wrap = <V>(candidate: V): V => {
    if (!candidate || typeof candidate !== "object") return candidate;
    const existing = proxies.get(candidate);
    if (existing) return existing as V;
    const proxy = new Proxy(candidate, {
      get: (target, property, receiver) => wrap(Reflect.get(target, property, receiver)),
      set: () => true,
      deleteProperty: () => true,
      defineProperty: () => true,
      setPrototypeOf: () => true,
    });
    proxies.set(candidate, proxy);
    return proxy as V;
  };
  return wrap(value);
}

export function applyTransaction(project: ProjectDocument, transaction: ProjectTransaction): ProjectDocument {
  const before = snapshotView(project);
  const applied = transaction.apply(cloneProjectForTransaction(project));
  const previousEntry = project.history.past[project.history.past.length - 1];
  const committedAt = Date.now();
  const shouldCoalesce = Boolean(
    transaction.historyGroup &&
    previousEntry?.historyGroup === transaction.historyGroup &&
    typeof previousEntry.committedAt === "number" &&
    committedAt - previousEntry.committedAt <= HISTORY_COALESCE_WINDOW_MS &&
    project.history.future.length === 0,
  );
  const nextEntry: ProjectHistoryEntry = {
    id: transaction.id,
    label: transaction.label,
    source: transaction.source,
    historyGroup: transaction.historyGroup,
    committedAt,
    snapshot: shouldCoalesce ? previousEntry.snapshot : before,
  };
  const retainedPast = shouldCoalesce ? project.history.past.slice(0, -1) : project.history.past;
  return {
    ...applied,
    schemaVersion: 2,
    version: project.version + 1,
    history: {
      past: [...retainedPast, nextEntry].slice(-MAX_HISTORY),
      future: [],
    },
  };
}

export function undoTransaction(project: ProjectDocument): ProjectDocument {
  const previous = project.history.past[project.history.past.length - 1];
  if (!previous) return project;
  return fromSnapshot(previous.snapshot, {
    past: project.history.past.slice(0, -1),
    future: [{
      id: previous.id,
      label: previous.label,
      source: previous.source,
      historyGroup: previous.historyGroup,
      committedAt: previous.committedAt,
      snapshot: cloneSnapshot(project),
    }, ...project.history.future],
  });
}

export function redoTransaction(project: ProjectDocument): ProjectDocument {
  const nextEntry = project.history.future[0];
  if (!nextEntry) return project;
  return fromSnapshot(nextEntry.snapshot, {
    past: [...project.history.past, {
      id: nextEntry.id,
      label: nextEntry.label,
      source: nextEntry.source,
      historyGroup: nextEntry.historyGroup,
      committedAt: nextEntry.committedAt,
      snapshot: cloneSnapshot(project),
    }].slice(-MAX_HISTORY),
    future: project.history.future.slice(1),
  });
}

export function serializeProjectDocument(project: ProjectDocument): string {
  return JSON.stringify({ ...project, schemaVersion: 2 });
}

type ProjectMigrationPayload = Parameters<typeof migrateProjectPayload>[0];

function restoreSnapshot(payload: unknown): ProjectSnapshot {
  return migrateProjectPayload(payload as ProjectMigrationPayload);
}

export function restoreProjectDocument(raw: string | null | undefined): ProjectDocument {
  if (!raw) return createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectDocument> & { template?: MapTemplateId };
    const snapshot = restoreSnapshot(parsed);
    const restoreHistory = (entries: unknown): ProjectHistoryEntry[] =>
      Array.isArray(entries)
        ? entries.flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const candidate = entry as Partial<ProjectHistoryEntry>;
            if (!candidate.snapshot || typeof candidate.snapshot !== "object") return [];
            return [{
              id: String(candidate.id ?? createId("history")),
              label: String(candidate.label ?? "历史操作"),
              source: candidate.source === "ai" || candidate.source === "import" ? candidate.source : "manual",
              historyGroup: typeof candidate.historyGroup === "string" ? candidate.historyGroup : undefined,
              committedAt: typeof candidate.committedAt === "number" ? candidate.committedAt : undefined,
              snapshot: restoreSnapshot(candidate.snapshot),
            }];
          })
        : [];
    return {
      ...snapshot,
      history: {
        past: restoreHistory(parsed.history?.past),
        future: restoreHistory(parsed.history?.future),
      },
    };
  } catch {
    return createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  }
}
