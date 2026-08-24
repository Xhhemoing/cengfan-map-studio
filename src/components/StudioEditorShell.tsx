import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { PanelRight } from "lucide-react";
import Drawer from "@mui/material/Drawer";
import type { WorkflowStageId } from "../lib/workflow-stages";
import { useEditorPanelLayout } from "../lib/use-studio-preferences";
import { ResizablePanelDivider } from "./ResizablePanelDivider";
import { StageGuideLine } from "./StageGuideLine";

export type StudioEditorShellProps = {
  stage: WorkflowStageId;
  leftRail?: ReactNode;
  rightRail?: ReactNode;
  rightRailLabel?: string;
  children: ReactNode;
};

/** Mirrors the `@media (max-width: 760px)` shell rules in `src/styles.css`. */
const NARROW_VIEWPORT_QUERY = "(max-width: 760px)";

function matchesQuery(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches === true;
}

/**
 * Tracks a media query so the shell can mount the right rail exactly once.
 * Falls back to the desktop branch when `matchMedia` is missing (SSR, older
 * test environments); the effect re-reads on mount so a hydrated client that
 * started on the fallback still settles on the real viewport.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchesQuery(query));

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [query]);

  return matches;
}

/**
 * Narrow-screen presentation of the right rail: a floating toggle plus a
 * labelled MUI `Drawer`. Mounted only below the breakpoint, so the open state
 * resets with it and the rail markup never coexists with the docked aside.
 */
function RightRailDrawer({
  stage,
  label,
  children,
}: {
  stage: WorkflowStageId;
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="studio-editor-shell__rail-toggle"
        aria-label={`打开${label}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <PanelRight size={16} aria-hidden="true" />
      </button>
      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <div className="studio-editor-shell__drawer" role="region" aria-label={label}>
          <div className="studio-editor-shell__drawer-head">
            <strong>{label}</strong>
            <button
              type="button"
              className="studio-editor-shell__drawer-close"
              aria-label={`关闭${label}`}
              onClick={() => {
                setOpen(false);
                toggleRef.current?.focus();
              }}
            >
              ×
            </button>
          </div>
          <StageGuideLine stage={stage} />
          {children}
        </div>
      </Drawer>
    </>
  );
}

/**
 * Desktop grid shell for the formal editing stages: optional left rail |
 * center | optional resizable right rail. Renders both `ResizablePanelDivider`
 * resizers against the shared `useEditorPanelLayout` state, which is the single
 * owner of width persistence and viewport normalization. The workflow
 * guidance lives in the topbar (old-style), so most stages render without a
 * left rail; when one is omitted the shell collapses to canvas + right rail.
 * At <=760px the right rail is presented as a labelled MUI `Drawer` (Escape +
 * focus return handled by MUI's Modal). Only one of the two presentations is
 * mounted at a time, so `useId`, `htmlFor` and `aria-controls` inside the rail
 * stay unique and always point at the visible copy.
 */
export function StudioEditorShell({
  stage,
  leftRail,
  rightRail,
  rightRailLabel = "右侧栏",
  children,
}: StudioEditorShellProps) {
  const {
    panelLayout,
    resizingPanel,
    setResizingPanel,
    sidebarBounds,
    inspectorBounds,
    updatePanelWidth,
  } = useEditorPanelLayout();
  const isNarrow = useMediaQuery(NARROW_VIEWPORT_QUERY);

  const hasRightRail = Boolean(rightRail);
  const hasLeftRail = Boolean(leftRail);

  const shellStyle = {
    "--studio-left-width": `${panelLayout.sidebarWidth}px`,
    "--studio-right-width": `${panelLayout.inspectorWidth}px`,
  } as CSSProperties;

  return (
    <section
      className="studio-stage-shell studio-editor-shell"
      style={shellStyle}
      data-stage={stage}
      data-has-right-rail={hasRightRail ? "true" : "false"}
      data-has-left-rail={hasLeftRail ? "true" : "false"}
      data-editor-resizing={resizingPanel ? "true" : undefined}
      data-resizing-panel={resizingPanel ?? undefined}
    >
      {hasLeftRail && (
        <aside className="studio-sidebar studio-editor-shell__left">
          <div className="studio-sidebar__rail">{leftRail}</div>
        </aside>
      )}
      <div className="studio-stage-shell__main studio-editor-shell__main">{children}</div>
      {hasRightRail && !isNarrow && (
        <aside className="studio-editor-shell__right" aria-label={rightRailLabel}>
          <div className="studio-editor-shell__right-inner">
            <StageGuideLine stage={stage} />
            {rightRail}
          </div>
        </aside>
      )}
      {hasRightRail && isNarrow && (
        <RightRailDrawer stage={stage} label={rightRailLabel}>
          {rightRail}
        </RightRailDrawer>
      )}
      {hasLeftRail && (
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
      )}
      {hasRightRail && !isNarrow && (
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
      )}
    </section>
  );
}
