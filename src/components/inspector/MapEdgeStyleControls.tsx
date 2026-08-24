import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { MapSettings } from "../../lib/scene-document";
import { EDGE_STYLE_OPTIONS, type EdgeStyle } from "../../lib/edge-styles";
import { DeferredInput } from "../DeferredInput";

export function EdgeStylePreview({ style, className }: { style: EdgeStyle; className?: string }) {
  return (
    <svg viewBox="0 0 72 18" aria-hidden="true" className={className}>
      {style === "solid" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />}
      {style === "dashed" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.2" fill="none" strokeDasharray="8 5" strokeLinecap="round" />}
      {style === "dotted" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.6" fill="none" strokeDasharray="0.1 5" strokeLinecap="round" />}
      {style === "double" && <><path d="M4 9 H68" stroke="currentColor" strokeWidth="5" fill="none" opacity="0.28" strokeLinecap="round" /><path d="M4 9 H68" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></>}
      {style === "soft-glow" && <><path d="M4 9 H68" stroke="currentColor" strokeWidth="6" fill="none" opacity="0.25" strokeLinecap="round" /><path d="M4 9 H68" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></>}
      {style === "stitch" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.1" fill="none" strokeDasharray="3 4 1 4" strokeLinecap="round" />}
      {style === "rail" && <><path d="M4 9 H68" stroke="currentColor" strokeWidth="5" fill="none" opacity="0.3" /><path d="M4 9 H68" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="7 4" /></>}
      {style === "wave" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.1" fill="none" strokeDasharray="4 2 1 2" strokeLinecap="round" />}
      {style === "ornament" && <><path d="M4 9 H68" stroke="currentColor" strokeWidth="4.5" fill="none" opacity="0.22" strokeLinecap="round" /><path d="M4 9 H68" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="10 3 2 3" strokeLinecap="round" /></>}
      {style === "ink" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.4" fill="none" strokeDasharray="12 1.5 4 1.5" strokeLinecap="round" />}
    </svg>
  );
}

/**
 * Edge (province border) style section: dial-style listbox picker plus width
 * and color inputs. The trigger's aria-label and the dial's listbox/option
 * roles are pinned by existing tests and call sites — keep them stable.
 */
export function MapEdgeStyleControls({ map, onPatch }: {
  map: Pick<MapSettings, "edgeStyle" | "edgeWidth" | "edgeColor">;
  onPatch: (patch: Partial<MapSettings>) => void;
}) {
  const edgeStyle = (map.edgeStyle ?? "solid") as EdgeStyle;
  const selectedEdge = EDGE_STYLE_OPTIONS.find((option) => option.id === edgeStyle) ?? EDGE_STYLE_OPTIONS[0]!;
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // Roving tabindex: exactly one dial option stays in the Tab order. Focus
  // tracking runs through onFocus so DOM-driven focus (arrow keys, tests,
  // screen-reader navigation) keeps the tabindex in sync.
  const [focusedStyle, setFocusedStyle] = useState<EdgeStyle | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialRef = useRef<HTMLDivElement | null>(null);

  // When the dial opens, move focus to the selected option so keyboard users
  // land inside the popup instead of having to Tab into it (APG listbox popup).
  useLayoutEffect(() => {
    if (!isPickerOpen) return;
    const dial = dialRef.current;
    const target = dial?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?? dial?.querySelector<HTMLButtonElement>("button")
      ?? null;
    target?.focus();
  }, [isPickerOpen]);

  const closePicker = () => {
    // Return focus to the trigger so keyboard users are not dropped when the
    // dial's options unmount.
    setIsPickerOpen(false);
    setFocusedStyle(null);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isPickerOpen) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      closePicker();
      return;
    }
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const options = Array.from(dialRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (options.length === 0) return;
    event.preventDefault();
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? options.length - 1
      : event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (current < 0 ? 0 : (current + 1) % options.length)
        : (current <= 0 ? options.length - 1 : current - 1);
    options[next]?.focus();
  };

  const rovingStyle = focusedStyle ?? selectedEdge.id;

  return (
    <div className="map-edge-styles" role="group" aria-label="省界线纹理">
      <div className="asset-section__heading"><strong>省界线纹理</strong><small>{selectedEdge.description}</small></div>
      <div className="map-edge-style-control map-edge-style-control--style" onKeyDown={handleKeyDown}>
        <span className="map-edge-style-control__label">边界风格</span>
        <div className="map-edge-style-control__value">
          <button
            ref={triggerRef}
            type="button"
            className="map-edge-style-trigger"
            aria-label="打开边界风格选择器"
            aria-haspopup="listbox"
            aria-expanded={isPickerOpen}
            aria-controls="map-edge-style-dial"
            aria-describedby="map-edge-style-current"
            title={selectedEdge.description}
            onClick={() => setIsPickerOpen((open) => !open)}
          >
            <EdgeStylePreview style={edgeStyle} className="map-edge-style-trigger__preview" />
          </button>
          <span id="map-edge-style-current" className="map-edge-style-control__name">{selectedEdge.label}</span>
        </div>
        {isPickerOpen && <div ref={dialRef} id="map-edge-style-dial" className="map-edge-style-dial" role="listbox" aria-label="边界风格圆盘">
          {EDGE_STYLE_OPTIONS.map((option, index) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-label={`选择${option.label}边界风格`}
              aria-selected={edgeStyle === option.id}
              tabIndex={rovingStyle === option.id ? 0 : -1}
              className={edgeStyle === option.id ? "map-edge-style-dial__option is-active" : "map-edge-style-dial__option"}
              data-edge-style-index={index}
              style={{ "--edge-style-index": index, "--edge-style-count": EDGE_STYLE_OPTIONS.length } as CSSProperties}
              title={option.description}
              onFocus={() => setFocusedStyle(option.id)}
              onClick={() => {
                onPatch({ edgeStyle: option.id });
                closePicker();
              }}
            >
              <EdgeStylePreview style={option.id} className="map-edge-style-dial__preview" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>}
      </div>
      <label htmlFor="map-edgeWidth" className="map-edge-style-control">
        <span className="map-edge-style-control__label">边界粗细</span>
        <DeferredInput
          id="map-edgeWidth"
          type="number"
          min={0}
          max={20}
          step={0.5}
          value={map.edgeWidth ?? 1}
          onCommit={(draft) => {
            const next = Number(draft);
            if (Number.isFinite(next) && next >= 0 && next <= 20) onPatch({ edgeWidth: next });
          }}
        />
      </label>
      <label htmlFor="map-edge-color" className="map-edge-style-control">
        <span className="map-edge-style-control__label">边界色</span>
        <DeferredInput id="map-edge-color" type="color" value={map.edgeColor} onCommit={(edgeColor) => onPatch({ edgeColor })} />
      </label>
    </div>
  );
}
