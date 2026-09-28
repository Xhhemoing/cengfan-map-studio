import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Ellipsis, MapPinned } from "lucide-react";
import "../styles/studio-topbar.css";

export type StudioTopbarProps = {
  assistantEntry?: ReactNode;
  historyActions?: ReactNode;
  stageActions?: ReactNode;
  projectActions: ReactNode;
  workflowNav?: ReactNode;
};

/**
 * The only editing header: brand, workflow, then actions in DOM and desktop order.
 * Narrow screens wrap navigation within this same header. Page-specific tools
 * stay in one disclosure so they cannot displace the centred workflow.
 */
export function StudioTopbar({
  assistantEntry,
  historyActions,
  stageActions,
  projectActions,
  workflowNav,
}: StudioTopbarProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia?.("(min-width: 1121px)");
    const closeOnResize = () => setToolsOpen(false);
    media?.addEventListener?.("change", closeOnResize);
    return () => media?.removeEventListener?.("change", closeOnResize);
  }, []);

  useEffect(() => {
    if (!toolsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        setToolsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setToolsOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [toolsOpen]);

  return (
    <header
      ref={headerRef}
      className="topbar studio-topbar"
      aria-label="编辑器顶栏"
      data-has-workflow={Boolean(workflowNav)}
      data-tools-open={toolsOpen}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
          setToolsOpen(false);
        }
      }}
    >
      <div className="brand">
        <MapPinned size={24} aria-hidden="true" />
        <span className="studio-topbar__brand-copy">
          <span className="brand-label brand-label__full">蹭饭地图工作室</span>
          <span className="brand-label brand-label__compact">蹭饭图</span>
        </span>
      </div>
      {workflowNav && (
        <div className="topbar-workflow" onClick={() => setToolsOpen(false)}>{workflowNav}</div>
      )}
      <div className="topbar-actions">
        {(assistantEntry || historyActions) && (
          <div className="studio-topbar__leading">
            <div className="studio-topbar__assistant">{assistantEntry}</div>
            {historyActions}
          </div>
        )}
        <button
          ref={toggleRef}
          type="button"
          className="icon-button studio-topbar__more"
          aria-label="更多操作"
          aria-expanded={toolsOpen}
          aria-controls={toolsId}
          onClick={() => setToolsOpen((open) => !open)}
        >
          <Ellipsis size={20} aria-hidden="true" />
        </button>
        <div id={toolsId} className="studio-topbar__tools" role="group" aria-label="页面与项目操作">
          {stageActions && <div className="studio-topbar__stage-actions">{stageActions}</div>}
          <div className="studio-topbar__project-actions">{projectActions}</div>
        </div>
      </div>
    </header>
  );
}
