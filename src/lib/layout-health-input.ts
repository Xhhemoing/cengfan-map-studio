import type { LayoutHealthInput } from "./layout-health";
import type { ProjectDocument } from "./project-document";
import { fingerprintProject } from "./project-digest";
import { resolveProjectScene, type ResolvedProjectScene } from "./resolved-scene";

/** A settled canvas snapshot avoids synchronous solver work while editing. */
export function buildProjectLayoutHealthInput(project: ProjectDocument, snapshot?: ResolvedProjectScene): LayoutHealthInput {
  return snapshot?.revision === fingerprintProject(project) ? snapshot.healthInput : resolveProjectScene(project).healthInput;
}
