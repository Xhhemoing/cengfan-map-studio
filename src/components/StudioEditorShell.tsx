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
import {
  getPanelWidthBounds,
  normalizeEditorPanelLayout,
  readEditorPanelLayout,
  writeEditorPanelLayout,
  type EditorPanelLayout,
  type PanelSide,
} from "../lib/editor-layout";
import { ResizablePanelDivider } from "./ResizablePanelDivider";

export type StudioEditorShellProps = {
  stage: WorkflowStageId;
  leftRail: ReactNode;
  rightRail?: ReactNode;
  rightRailLabel?: string;
  children: ReactNode;
};

/**
 * Desktop grid shell for the formal editing stages: stable left rail | center |
 * optional resizable right rail. Owns both `ResizablePanelDivider` resizers and
 * persists their widths through `editor-layout`. At <=760px the right rail is
 * presented as a labelled MUI `Drawer` (Escape + focus return handled by MUI's
 * Modal) while the left rail collapses to a horizontal scroll strip via CSS.
 */
export function StudioEditorShell({
  stage,
  leftRail,
  rightRail,
  rightRailLabel = "右侧栏",
  children,
}: StudioEditorShellProps) {
  const [panelLayout, setPanelLayout] = useState<EditorPanelLayout>(() => readEditorPanelLayout());
  const [resizingPanel, setResizingPanel] = useState<PanelSide | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerToggleRef = useRef<HTMLButtonElement>(null);

  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const sidebarBounds = getPanelWidthBounds("sidebar", viewportWidth, panelLayout.inspectorWidth);
  const inspectorBounds = getPanelWidthBounds("inspector", viewportWidth, panelLayout.sidebarWidth);
  const hasRightRail = Boolean(rightRail);

  useEffect(() => {
    try {
      writeEditorPanelLayout(window.localStorage, panelLayout, window.innerWidth);
    } catch {
      // Panel sizing remains usable when browser storage is unavailable.
    }
  }, [panelLayout]);

  const updatePanelWidth = (side: PanelSide, value: number) => {
    setPanelLayout((current) => normalizeEditorPanelLayout({
      ...current,
      [side === "sidebar" ? "sidebarWidth" : "inspectorWidth"]: value,
    }, viewportWidth));
  };

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
      data-editor-resizing={resizingPanel ? "true" : undefined}
      data-resizing-panel={resizingPanel ?? undefined}
    >
      <aside className="studio-sidebar studio-editor-shell__left">
        <div className="studio-sidebar__rail">{leftRail}</div>
      </aside>
      <div className="studio-stage-shell__main studio-editor-shell__main">{children}</div>
      {hasRightRail && (
        <>
          <aside className="studio-editor-shell__right" aria-label={rightRailLabel}>
            {rightRail}
          </aside>
          <button
            ref={drawerToggleRef}
            type="button"
            className="studio-editor-shell__rail-toggle"
            aria-label={`打开${rightRailLabel}`}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <PanelRight size={16} aria-hidden="true" />
          </button>
          <Drawer
            anchor="right"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          >
            <div className="studio-editor-shell__drawer" role="region" aria-label={rightRailLabel}>
              <div className="studio-editor-shell__drawer-head">
                <strong>{rightRailLabel}</strong>
                <button
                  type="button"
                  className="studio-editor-shell__drawer-close"
                  aria-label={`关闭${rightRailLabel}`}
                  onClick={() => {
                    setDrawerOpen(false);
                    drawerToggleRef.current?.focus();
                  }}
                >
                  ×
                </button>
              </div>
              {rightRail}
            </div>
          </Drawer>
        </>
      )}
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
      {hasRightRail && (
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
