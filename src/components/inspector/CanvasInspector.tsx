import { ImageUp, RotateCcw, Trash2 } from "lucide-react";
import { CANVAS_SIZE_PRESETS, type CanvasSizePresetId } from "../../lib/grid";
import type { CanvasSettings } from "../../lib/scene-document";
import { FileDropzone } from "../FileDropzone";
import { DeferredInput } from "../DeferredInput";
import { CompactButton, IconButton, InspectorHeader } from "../StudioUi";

export function CanvasInspector({ canvas, onPatch, onReset }: {
  canvas: CanvasSettings;
  onPatch: (patch: Partial<CanvasSettings>) => void;
  onReset: () => void;
}) {
  const setBackgroundImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onPatch({ backgroundImageSrc: String(reader.result ?? "") || undefined });
    reader.readAsDataURL(file);
  };

  const number = (key: "width" | "height" | "safeMargin", value: number, min: number, max: number, label: string) => (
    <label htmlFor={`canvas-${key}`}>{label}
      <DeferredInput id={`canvas-${key}`} type="number" min={min} max={max} value={value} onCommit={(draft) => {
        const next = Number(draft);
        if (Number.isFinite(next) && next >= min && next <= max) onPatch({ [key]: next });
      }} />
    </label>
  );

  const matchedPreset = CANVAS_SIZE_PRESETS.find(
    (preset) => preset.width === canvas.width && preset.height === canvas.height,
  )?.id ?? "custom";

  return (
    <section className="property-panel">
      <InspectorHeader
        title="画布属性"
        actions={<IconButton label="重置画布" icon={<RotateCcw size={15} />} variant="ghost" onClick={onReset} />}
      />
      <label htmlFor="canvas-size-preset">尺寸预设
        <select
          id="canvas-size-preset"
          value={matchedPreset}
          onChange={(event) => {
            const value = event.target.value as CanvasSizePresetId | "custom";
            if (value === "custom") return;
            const preset = CANVAS_SIZE_PRESETS.find((item) => item.id === value);
            if (preset) onPatch({ width: preset.width, height: preset.height });
          }}
        >
          <option value="custom">自定义</option>
          {CANVAS_SIZE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          ))}
        </select>
      </label>
      {number("width", canvas.width, 320, 6000, "宽度")}
      {number("height", canvas.height, 320, 6000, "高度")}
      {number("safeMargin", canvas.safeMargin, 0, 3000, "安全边距")}
      <label htmlFor="canvas-background">背景色
        <DeferredInput
          id="canvas-background"
          type="color"
          value={canvas.backgroundColor}
          onCommit={(backgroundColor) => onPatch({ backgroundColor })}
        />
      </label>
      <div className="canvas-background-control">
        <span className="canvas-background-control__label">画布背景图</span>
        {canvas.backgroundImageSrc && (
          <img
            src={canvas.backgroundImageSrc}
            alt="当前画布背景"
            className="canvas-background-preview"
            data-canvas-background-preview
          />
        )}
        <FileDropzone
          id="canvas-background-image"
          label={canvas.backgroundImageSrc ? "替换背景" : "上传背景"}
          hint="PNG / JPG / WebP / SVG · 点击或拖拽"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          variant="compact"
          icon={<ImageUp size={16} aria-hidden />}
          onFile={setBackgroundImage}
        />
        {canvas.backgroundImageSrc && (
          <CompactButton
            className="canvas-background-remove"
            variant="danger"
            icon={<Trash2 size={14} aria-hidden />}
            onClick={() => onPatch({ backgroundImageSrc: undefined })}
          >移除背景</CompactButton>
        )}
      </div>
      <label htmlFor="canvas-background-opacity">背景透明度
        <DeferredInput
          id="canvas-background-opacity"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={canvas.backgroundOpacity}
          onCommit={(backgroundOpacity) => onPatch({ backgroundOpacity: Number(backgroundOpacity) })}
        />
      </label>
      <label htmlFor="canvas-background-fit">背景填充
        <select
          id="canvas-background-fit"
          value={canvas.backgroundFit}
          onChange={(event) => onPatch({ backgroundFit: event.target.value as CanvasSettings["backgroundFit"] })}
        >
          <option value="cover">铺满裁切</option>
          <option value="contain">完整显示</option>
          <option value="stretch">拉伸</option>
        </select>
      </label>
    </section>
  );
}
