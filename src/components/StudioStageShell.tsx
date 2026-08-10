/**
 * Shared stage scaffolding for the legacy editor shell: an optional left rail
 * beside the central workspace. The studio shell refactor replaces this with
 * `StudioEditorShell`, so this component stays a thin presentational wrapper.
 */
import type { ReactNode } from "react";

export function StudioStageShell({
  leftRail,
  showRail,
  children,
}: {
  leftRail: ReactNode;
  showRail: boolean;
  children: ReactNode;
}) {
  if (!showRail) return <>{children}</>;

  return (
    <section className="studio-stage-shell">
      <aside className="studio-sidebar">
        <div className="studio-sidebar__rail">{leftRail}</div>
      </aside>
      <div className="studio-stage-shell__main">{children}</div>
    </section>
  );
}
