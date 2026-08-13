/**
 * Detects the user's most recent local workspace so the workbench can offer a
 * "continue editing" entry for content that is not yet a stored project.
 * Priority: workspace mirror / durable IndexedDB snapshot, then the legacy
 * localStorage draft (converted into a full package on the fly).
 */
import { DRAFT_KEY, DRAFT_SAVED_AT_KEY } from "./app-constants";
import { loadUserAssets } from "./assets";
import { loadLatestBrowserWorkspace } from "./browser-workspace-store";
import { loadUserFonts } from "./fonts";
import { createProjectPackage, type ProjectPackage } from "./project-package";
import { restoreProjectDocument } from "./project-document";
import { DEFAULT_RENDER_SETTINGS } from "./render-settings";
import { loadCustomTemplates } from "./template-store";

export interface LocalWorkspaceEntry {
  pack: ProjectPackage;
  source: "mirror" | "draft";
}

function draftSavedAt(): Date | undefined {
  try {
    const raw = window.localStorage.getItem(DRAFT_SAVED_AT_KEY);
    if (!raw) return undefined;
    const time = Date.parse(raw);
    return Number.isFinite(time) ? new Date(time) : undefined;
  } catch {
    return undefined;
  }
}

export async function loadLocalWorkspaceEntry(): Promise<LocalWorkspaceEntry | null> {
  try {
    const pack = await loadLatestBrowserWorkspace();
    if (pack) return { pack, source: "mirror" };
  } catch {
    // Fall through to the legacy draft below.
  }
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const project = restoreProjectDocument(raw);
    const pack = createProjectPackage({
      project,
      assets: loadUserAssets(),
      fonts: loadUserFonts(),
      customTemplates: loadCustomTemplates(),
      renderSettings: DEFAULT_RENDER_SETTINGS,
      now: draftSavedAt(),
    });
    return { pack, source: "draft" };
  } catch {
    return null;
  }
}
