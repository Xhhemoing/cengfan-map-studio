import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { UserAsset } from "./assets";
import type { UserFont } from "./fonts";
import { buildDataHealthSummary, listDataIssues } from "./data-health";
import type { LayoutHealthIssue } from "./layout-health";
import { fingerprintProject } from "./project-digest";
import type { ProjectDocument } from "./project-document";
import { listResourceHealthIssues } from "./resource-health";
import type { ResolvedProjectScene } from "./resolved-scene";
import { getSceneTextMeasurer } from "./scene-text-measurement";
import { computeWorkflowProgress, listStudentWarnings } from "./workflow-progress";

/** Layout checks consume the completed canvas result, never a synchronous second solver
 * on App's render path. An older scene is explicitly pending, rather than a false pass. */
export function useProjectDiagnostics(project: ProjectDocument, assets: UserAsset[], fonts: UserFont[]) {
  const [captured, setCaptured] = useState<ResolvedProjectScene | null>(null);
  const revision = fingerprintProject(project);
  const measurer = getSceneTextMeasurer();
  const fontRevision = useSyncExternalStore(measurer.subscribe, measurer.getVersion, measurer.getVersion);
  const scene = captured?.revision === revision && captured.fontRevision === fontRevision ? captured : null;
  const captureScene = useCallback((next: ResolvedProjectScene) => {
    if (next.revision !== revision) return;
    setCaptured((previous) => {
      if (previous?.revision === next.revision && previous.fontRevision === next.fontRevision
        && JSON.stringify(previous.cards.map((card) => card.placement)) === JSON.stringify(next.cards.map((card) => card.placement))
        && previous.measurementStatus === next.measurementStatus) return previous;
      return next;
    });
  }, [revision]);
  const contentLayoutIssues: LayoutHealthIssue[] = useMemo(() => scene?.diagnostics ?? [{
    id: "layout-pending", kind: "layout-pending", severity: "warning",
    detail: "画布排布或字体测量尚未完成；前往版式或交付查看最新检查。",
  }], [scene]);
  return {
    workflowProgress: useMemo(() => computeWorkflowProgress(project), [project]),
    dataHealth: useMemo(() => buildDataHealthSummary(project), [project]),
    dataIssues: useMemo(() => listDataIssues(project), [project]),
    exportWarnings: useMemo(() => listStudentWarnings(project), [project]),
    resourceHealthIssues: useMemo(() => listResourceHealthIssues(project, assets, fonts), [project, assets, fonts]),
    scene, captureScene, contentLayoutIssues,
  };
}
