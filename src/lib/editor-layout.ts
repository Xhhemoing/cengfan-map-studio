export const EDITOR_PANEL_LAYOUT_STORAGE_KEY = "cengfan-map-studio:editor-panel-layout";
export const EDITOR_CENTER_MIN_WIDTH = 480;

export const PANEL_WIDTH_LIMITS = {
  sidebar: { min: 180, max: 360 },
  inspector: { min: 220, max: 420 },
} as const;

export const DEFAULT_EDITOR_PANEL_LAYOUT = {
  sidebarWidth: 220,
  inspectorWidth: 280,
} as const;

export type PanelSide = keyof typeof PANEL_WIDTH_LIMITS;

export type EditorPanelLayout = {
  sidebarWidth: number;
  inspectorWidth: number;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type PanelWidthBounds = {
  min: number;
  max: number;
};

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function roundWidth(value: number): number {
  return Math.round(value);
}

export function getPanelWidthBounds(
  side: PanelSide,
  viewportWidth: number,
  siblingWidth: number,
): PanelWidthBounds {
  const limits = PANEL_WIDTH_LIMITS[side];
  const safeViewportWidth = Math.max(0, finiteNumber(viewportWidth, 1440));
  const safeSiblingWidth = Math.max(0, finiteNumber(siblingWidth, limits.min));
  const availableMax = safeViewportWidth - EDITOR_CENTER_MIN_WIDTH - safeSiblingWidth;

  return {
    min: limits.min,
    max: Math.max(limits.min, Math.min(limits.max, roundWidth(availableMax))),
  };
}

function clamp(value: number, bounds: PanelWidthBounds): number {
  return Math.min(bounds.max, Math.max(bounds.min, roundWidth(value)));
}

export function normalizeEditorPanelLayout(
  layout: Partial<EditorPanelLayout> | null | undefined,
  viewportWidth = 1440,
): EditorPanelLayout {
  const sidebarLimits = PANEL_WIDTH_LIMITS.sidebar;
  const inspectorLimits = PANEL_WIDTH_LIMITS.inspector;
  const availableWidth = Math.max(
    sidebarLimits.min + inspectorLimits.min,
    finiteNumber(viewportWidth, 1440) - EDITOR_CENTER_MIN_WIDTH,
  );
  const inspectorWidth = clamp(
    finiteNumber(layout?.inspectorWidth, DEFAULT_EDITOR_PANEL_LAYOUT.inspectorWidth),
    inspectorLimits,
  );
  let sidebarWidth = clamp(
    finiteNumber(layout?.sidebarWidth, DEFAULT_EDITOR_PANEL_LAYOUT.sidebarWidth),
    sidebarLimits,
  );

  if (sidebarWidth + inspectorWidth > availableWidth) {
    sidebarWidth = clamp(availableWidth - inspectorWidth, sidebarLimits);
    if (sidebarWidth + inspectorWidth > availableWidth) {
      return {
        sidebarWidth: sidebarWidth,
        inspectorWidth: clamp(availableWidth - sidebarWidth, inspectorLimits),
      };
    }
  }

  return { sidebarWidth, inspectorWidth };
}

function defaultStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readEditorPanelLayout(
  storage: StorageLike | null | undefined = defaultStorage(),
  viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth,
): EditorPanelLayout {
  if (!storage) return normalizeEditorPanelLayout(undefined, viewportWidth);

  try {
    const raw = storage.getItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY);
    if (!raw) return normalizeEditorPanelLayout(undefined, viewportWidth);
    const parsed = JSON.parse(raw) as Partial<EditorPanelLayout>;
    return normalizeEditorPanelLayout(parsed, viewportWidth);
  } catch {
    return normalizeEditorPanelLayout(undefined, viewportWidth);
  }
}

export function writeEditorPanelLayout(
  storage: StorageLike | null | undefined,
  layout: Partial<EditorPanelLayout>,
  viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth,
): void {
  if (!storage) return;

  try {
    storage.setItem(
      EDITOR_PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify(normalizeEditorPanelLayout(layout, viewportWidth)),
    );
  } catch {
    // Layout persistence is a convenience and must not block the editor.
  }
}
