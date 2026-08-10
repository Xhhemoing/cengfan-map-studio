import { useMemo, useState } from "react";
import type { UserFont } from "../../lib/fonts";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame, switchDisplayFrameMode, type DisplayFrameDefinition, type DisplayFrameMode } from "../../lib/display-frame";
import type { CardSettings } from "../../lib/scene-document";
import { DeferredInput } from "../DeferredInput";
import { FixedFrameEditor } from "./FixedFrameEditor";
import { FlowFrameEditor } from "./FlowFrameEditor";

const FRAME_MODES: Array<{ id: DisplayFrameMode; label: string; ariaLabel: string; description: string }> = [
  { id: "fixed", label: "固定自由排布", ariaLabel: "固定自由排布", description: "字段、文字与装饰分别放置" },
  { id: "flow", label: "固定排版连续文字", ariaLabel: "固定排版连续文字", description: "连续文字按顺序流动排版" },
];

export interface DisplayFrameWorkspaceProps {
  cards: CardSettings;
  userFonts?: UserFont[];
  onPatch: (patch: Partial<CardSettings>) => void;
  onTransaction?: (frame: DisplayFrameDefinition) => void;
  onRefreshPositions: () => void;
}

/**
 * Props for the display-frame stage's right rail. The shell owns the rail
 * chrome (labelled aside + resizer + mobile drawer); this component supplies
 * the 公共样式 style-grid controls shared by both layout modes.
 */
export function DisplayFrameRail({
  frame,
  onPatchStyle,
}: {
  frame: DisplayFrameDefinition;
  onPatchStyle: (patch: Partial<DisplayFrameDefinition["style"]>) => void;
}) {
  return (
    <aside className="display-frame-workspace__controls" aria-label="展示框公共样式">
      <section className="display-frame-workspace__section" aria-label="公共字段与样式">
        <div className="display-frame-workspace__section-heading"><strong>公共样式</strong><small>两种模式共享</small></div>
        <div className="display-frame-style-grid">
          <label htmlFor="display-frame-font-size">字号<DeferredInput id="display-frame-font-size" type="number" min={8} max={240} value={frame.style.fontSize} onCommit={(value) => onPatchStyle({ fontSize: Number(value) })} /></label>
          <label htmlFor="display-frame-padding">边距<DeferredInput id="display-frame-padding" type="number" min={0} max={120} value={frame.style.padding} onCommit={(value) => onPatchStyle({ padding: Number(value) })} /></label>
          <label htmlFor="display-frame-margin">间隔<DeferredInput id="display-frame-margin" type="number" min={0} max={120} value={frame.style.margin} onCommit={(value) => onPatchStyle({ margin: Number(value) })} /></label>
          <label htmlFor="display-frame-align">对齐<select id="display-frame-align" value={frame.style.align} onChange={(event) => onPatchStyle({ align: event.target.value as DisplayFrameDefinition["style"]["align"] })}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
          <label htmlFor="display-frame-font-color">文字色<DeferredInput id="display-frame-font-color" type="color" value={frame.style.color} onCommit={(value) => onPatchStyle({ color: value })} /></label>
          <label htmlFor="display-frame-background">背景色<DeferredInput id="display-frame-background" type="color" value={frame.style.background} onCommit={(value) => onPatchStyle({ background: value })} /></label>
          <label htmlFor="display-frame-border-color">边框色<DeferredInput id="display-frame-border-color" type="color" value={frame.style.borderColor ?? frame.style.color} onCommit={(value) => onPatchStyle({ borderColor: value })} /></label>
          <label htmlFor="display-frame-border-width">边框宽<DeferredInput id="display-frame-border-width" type="number" min={0} max={24} value={frame.style.borderWidth ?? 1} onCommit={(value) => onPatchStyle({ borderWidth: Number(value) })} /></label>
          <label htmlFor="display-frame-border-radius">圆角<DeferredInput id="display-frame-border-radius" type="number" min={0} max={120} value={frame.style.borderRadius ?? 6} onCommit={(value) => onPatchStyle({ borderRadius: Number(value) })} /></label>
        </div>
      </section>
    </aside>
  );
}

/**
 * Center content of the display-frame stage: the layout-mode switch, the
 * variant impact note, the shared field order and the mode-specific editor.
 * The 公共样式 style-grid controls live in the unified right rail
 * (`DisplayFrameRail`), and the position-refresh action lives in the topbar's
 * stage-actions slot.
 */
export function DisplayFrameWorkspace({
  cards,
  onPatch,
}: DisplayFrameWorkspaceProps) {
  const externalFrame = useMemo(
    () => cards.displayFrame === undefined
      ? deriveFixedDisplayFrameFromCardSettings(cards)
      : normalizeDisplayFrame(cards.displayFrame),
    [cards],
  );
  const [draft, setDraft] = useState<{ source: DisplayFrameDefinition; frame: DisplayFrameDefinition }>(() => ({
    source: externalFrame,
    frame: externalFrame,
  }));
  const frame = draft.source === externalFrame ? draft.frame : externalFrame;
  const patchFrame = (next: DisplayFrameDefinition) => {
    const normalized = normalizeDisplayFrame(next);
    setDraft({ source: externalFrame, frame: normalized });
    onPatch({ displayFrame: normalized });
  };
  const setMode = (mode: DisplayFrameMode) => patchFrame(switchDisplayFrameMode(frame, mode));
  const currentMode = FRAME_MODES.find((mode) => mode.id === frame.mode) ?? FRAME_MODES[0]!;

  return (
    <main className="display-frame-workspace" aria-label="展示框样式">
      <div className="display-frame-workspace__body">
        <section className="display-frame-workspace__section" aria-label="展示框模式">
          <div className="display-frame-workspace__section-heading"><strong>排版模式</strong><small>两种模式互斥，变体会分别保留</small></div>
          <div className="display-frame-mode-switch" role="group" aria-label="展示框排版模式">
            {FRAME_MODES.map((mode) => (
              <button key={mode.id} type="button" aria-label={mode.ariaLabel} aria-pressed={frame.mode === mode.id} className={frame.mode === mode.id ? "is-active" : undefined} onClick={() => setMode(mode.id)}>
                <strong>{mode.label}</strong><small>{mode.description}</small>
              </button>
            ))}
          </div>
          <p className="display-frame-workspace__impact" aria-live="polite">
            {frame.mode === "fixed" ? "固定自由排布：局部 X/Y/宽高只影响展示框内部。" : "流式排版：固定自由排布中的局部坐标将暂时保留，切回后恢复。"}
          </p>
          <label htmlFor="display-frame-field-order">字段顺序<DeferredInput id="display-frame-field-order" value={frame.fieldOrder.join(",")} onCommit={(value) => patchFrame({ ...frame, fieldOrder: value.split(",").map((item) => item.trim()).filter(Boolean) as DisplayFrameDefinition["fieldOrder"] })} /></label>
        </section>

        <section className="display-frame-workspace__editor" aria-label={currentMode.description}>
          <div className="display-frame-workspace__editor-heading"><strong>{currentMode.label}</strong><span>{frame.mode === "fixed" ? "编辑字段的局部位置与尺寸" : "预览连续文字的顺序、间距与行高"}</span></div>
          {frame.mode === "fixed" ? <FixedFrameEditor frame={frame} onChange={patchFrame} /> : <FlowFrameEditor frame={frame} onChange={patchFrame} />}
        </section>
      </div>
    </main>
  );
}
