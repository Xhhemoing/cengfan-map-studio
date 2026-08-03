import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Maximize2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { createId } from "../../lib/ids";
import { autoFitAlignment } from "../../lib/map-alignment";
import type { MapImageAlignment, MapSettings, MapRenderSource } from "../../lib/scene-document";
import { CANVAS_LAYER_Z, CANVAS_LAYER_Z_RANGE } from "../../lib/scene-document";
import { getProvinceNames } from "../../lib/map-data";
import { heatPreviewSteps, normalizeHeatScale } from "../../lib/heat-scale";
import { EDGE_STYLE_OPTIONS, type EdgeStyle } from "../../lib/edge-styles";
import { FileDropzone } from "../FileDropzone";
import { DeferredInput } from "../DeferredInput";
import { ActionGroup, CompactButton, IconButton, InspectorHeader } from "../StudioUi";

function isImageSource(source: MapRenderSource | undefined): source is Extract<MapRenderSource, { kind: "image" }> {
  return source?.kind === "image";
}

function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({
      width: Math.max(1, image.naturalWidth || image.width || 1),
      height: Math.max(1, image.naturalHeight || image.height || 1),
    });
    image.onerror = () => resolve({ width: 1, height: 1 });
    image.src = src;
  });
}

export function MapInspector({ map, onPatch, onReset, mode = "all", collapsible = false }: {
  map: MapSettings;
  onPatch: (patch: Partial<MapSettings>) => void;
  onReset: () => void;
  mode?: "all" | "global" | "placement";
  /** 折叠低频设置（热力色阶、单省颜色、南海诸岛折叠开关）。 */
  collapsible?: boolean;
}) {
  const showGlobal = mode !== "placement";
  const showPlacement = mode !== "global";
  const number = (key: "x" | "y" | "width" | "height" | "scale" | "edgeWidth", value: number, min: number, max: number, step: number, label: string) => (
    <label htmlFor={`map-${key}`}>{label}
      <DeferredInput id={`map-${key}`} type="number" min={min} max={max} step={step} value={value} onCommit={(draft) => {
        const next = Number(draft);
        if (Number.isFinite(next) && next >= min && next <= max) onPatch({ [key]: next });
      }} />
    </label>
  );
  const renderSource = map.renderSource ?? { kind: "vector" as const };
  const edgeStyle = (map.edgeStyle ?? "solid") as EdgeStyle;
  const selectedEdge = EDGE_STYLE_OPTIONS.find((option) => option.id === edgeStyle) ?? EDGE_STYLE_OPTIONS[0]!;
  const provinceNames = getProvinceNames();
  const [selectedProvince, setSelectedProvince] = useState("");
  const heatScale = normalizeHeatScale(map.heatScale);
  const heatPreview = heatPreviewSteps(heatScale);
  const patchHeatScale = (patch: Partial<typeof heatScale>) => {
    onPatch({ heatScale: normalizeHeatScale({ ...heatScale, ...patch }) });
  };
  const selectedProvinceStyle = selectedProvince ? map.provinceStyles?.[selectedProvince] : undefined;
  const selectedProvinceColor = selectedProvinceStyle?.appearance?.kind === "manual-color"
    ? selectedProvinceStyle.appearance.color
    : selectedProvinceStyle?.fill ?? map.activeColor;
  const patchProvinceColor = (color: string) => {
    if (!selectedProvince) return;
    onPatch({
      provinceStyles: {
        ...map.provinceStyles,
        [selectedProvince]: {
          ...selectedProvinceStyle,
          appearance: { kind: "manual-color", color },
        },
      },
    });
  };
  const clearProvinceColor = () => {
    if (!selectedProvince) return;
    onPatch({
      provinceStyles: {
        ...map.provinceStyles,
        [selectedProvince]: {
          ...selectedProvinceStyle,
          appearance: undefined,
          fill: undefined,
        },
      },
    });
  };

  const patchImage = (patch: Partial<Extract<MapRenderSource, { kind: "image" }>>) => {
    if (!isImageSource(renderSource)) return;
    onPatch({ renderSource: { ...renderSource, ...patch } });
  };

  const patchAlignment = (patch: Partial<MapImageAlignment>) => {
    if (!isImageSource(renderSource) || !renderSource.alignment) return;
    patchImage({ alignment: { ...renderSource.alignment, ...patch } });
  };

  const uploadMapImage = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const src = String(reader.result ?? "");
      if (!src) return;
      const size = await loadImageSize(src);
      const alignment = autoFitAlignment({
        mapWidth: map.width,
        mapHeight: map.height,
        sourceWidth: size.width,
        sourceHeight: size.height,
        mode: "contain",
      });
      onPatch({
        renderSource: {
          kind: "image",
          assetId: createId("map-image"),
          src,
          fit: "contain",
          opacity: 1,
          composition: "replace",
          clipToMap: false,
          alignment,
        },
      });
    };
    reader.readAsDataURL(file);
  };

  const autoFitCurrent = async () => {
    if (!isImageSource(renderSource)) return;
    const size = renderSource.alignment
      ? { width: renderSource.alignment.sourceWidth, height: renderSource.alignment.sourceHeight }
      : await loadImageSize(renderSource.src);
    const alignment = autoFitAlignment({
      mapWidth: map.width,
      mapHeight: map.height,
      sourceWidth: size.width,
      sourceHeight: size.height,
      sourceBounds: renderSource.alignment?.sourceBounds,
      mode: renderSource.fit === "cover" || renderSource.fit === "stretch" ? renderSource.fit : "contain",
    });
    patchImage({ alignment });
  };

  const advancedGlobalControls = (
    <>
      <fieldset className="heat-scale-control">
        <legend>省份背景热力变色</legend>
        <div className="heat-scale-control__fields">
          <label htmlFor="map-heat-min-depth">最低人数
            <DeferredInput
              id="map-heat-min-depth"
              type="number"
              min="0"
              max="999"
              step="1"
              value={heatScale.minDepth}
              onCommit={(draft) => patchHeatScale({ minDepth: Number(draft) })}
            />
          </label>
          <label htmlFor="map-heat-max-depth">最高人数
            <DeferredInput
              id="map-heat-max-depth"
              type="number"
              min="0"
              max="999"
              step="1"
              value={heatScale.maxDepth}
              onCommit={(draft) => patchHeatScale({ maxDepth: Number(draft) })}
            />
          </label>
          <label htmlFor="map-heat-low-color">低值颜色
            <DeferredInput
              id="map-heat-low-color"
              type="color"
              value={heatScale.lowColor}
              onCommit={(lowColor) => patchHeatScale({ lowColor })}
            />
          </label>
          <label htmlFor="map-heat-high-color">高值颜色
            <DeferredInput
              id="map-heat-high-color"
              type="color"
              value={heatScale.highColor}
              onCommit={(highColor) => patchHeatScale({ highColor })}
            />
          </label>
        </div>
        <div className="heat-scale-control__preview" aria-label="热力色阶预览">
          {heatPreview.map((step, index) => (
            <span key={`${step.depth}-${index}`} data-heat-preview-step style={{ backgroundColor: step.color }}>
              {step.depth} 人
            </span>
          ))}
        </div>
        <p className="property-panel__hint">低于最低人数使用低值颜色，高于最高人数使用高值颜色；中间人数按色阶连续变化。</p>
      </fieldset>
      <fieldset className="province-color-control">
        <legend>单独设置省份颜色</legend>
        <label htmlFor="map-province-override">省份
          <select
            id="map-province-override"
            value={selectedProvince}
            onChange={(event) => setSelectedProvince(event.target.value)}
          >
            <option value="">选择省份</option>
            {provinceNames.map((province) => <option key={province} value={province}>{province}</option>)}
          </select>
        </label>
        {selectedProvince && <div className="province-color-control__actions">
          <label htmlFor="map-province-override-color">颜色
            <DeferredInput
              id="map-province-override-color"
              type="color"
              value={selectedProvinceColor}
              onCommit={patchProvinceColor}
            />
          </label>
          <CompactButton variant="ghost" icon={<RotateCcw size={14} aria-hidden />} onClick={clearProvinceColor}>恢复跟随整体</CompactButton>
        </div>}
        <p className="property-panel__hint">单独颜色优先于热力变色；也可直接点击画布省份进入更完整的贴图设置。</p>
      </fieldset>
      <label htmlFor="map-collapse-south-sea">南海诸岛折叠成框
        <input
          id="map-collapse-south-sea"
          type="checkbox"
          checked={map.collapseSouthChinaSea === true}
          onChange={(event) => onPatch({ collapseSouthChinaSea: event.target.checked })}
        />
      </label>
    </>
  );

  return (
    <section className="property-panel">
      <InspectorHeader
        title={mode === "placement" ? "地图位置与尺寸" : "地图属性"}
        actions={showGlobal ? <IconButton label="重置地图" icon={<RotateCcw size={15} />} variant="ghost" onClick={onReset} /> : undefined}
      />
      {showPlacement && <>
        {number("x", map.x, 0, 6000, 1, "X")}
        {number("y", map.y, 0, 6000, 1, "Y")}
        {number("width", map.width, 1, 6000, 1, "宽度")}
        {number("height", map.height, 1, 6000, 1, "高度")}
        {number("scale", map.scale, 0.1, 3, 0.01, "缩放")}
        <label htmlFor="map-zindex">层级
          <DeferredInput
            id="map-zindex"
            type="number"
            min={CANVAS_LAYER_Z_RANGE.min}
            max={CANVAS_LAYER_Z_RANGE.max}
            step={1}
            value={map.zIndex ?? CANVAS_LAYER_Z.map}
            onCommit={(draft) => {
              const next = Number(draft);
              if (Number.isFinite(next)) onPatch({ zIndex: Math.floor(next) });
            }}
          />
        </label>
        <ActionGroup label="地图层级" className="inspector-actions">
          <IconButton label="地图上移" text="上移" icon={<ArrowUp size={14} />} onClick={() => onPatch({ zIndex: Math.min(CANVAS_LAYER_Z_RANGE.max, (map.zIndex ?? CANVAS_LAYER_Z.map) + 1) })} />
          <IconButton label="地图下移" text="下移" icon={<ArrowDown size={14} />} onClick={() => onPatch({ zIndex: Math.max(CANVAS_LAYER_Z_RANGE.min, (map.zIndex ?? CANVAS_LAYER_Z.map) - 1) })} />
          <IconButton label="地图置顶" text="置顶" icon={<ChevronsUp size={14} />} onClick={() => onPatch({ zIndex: CANVAS_LAYER_Z_RANGE.max })} />
          <IconButton label="地图置底" text="置底" icon={<ChevronsDown size={14} />} onClick={() => onPatch({ zIndex: CANVAS_LAYER_Z_RANGE.min })} />
        </ActionGroup>
        <p className="property-panel__hint">数值越大越靠上。参照：数据框 10 · 嘉宾面板 20 · 装饰素材 30 · 文本 40。置顶/置底即相对全部画布层。</p>
      </>}

      {showGlobal && <>
        <label htmlFor="map-opacity">地图透明度
          <input
            id="map-opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={map.opacity ?? 1}
            onChange={(event) => onPatch({ opacity: Number(event.target.value) })}
          />
          <output htmlFor="map-opacity">{Math.round((map.opacity ?? 1) * 100)}%</output>
        </label>
        <div className="map-edge-styles" aria-label="省界线纹理">
        <div className="asset-section__heading"><strong>省界线纹理</strong><small>{selectedEdge.description}</small></div>
        <label htmlFor="map-edge-style">边界风格
          <select
            id="map-edge-style"
            value={edgeStyle}
            onChange={(event) => onPatch({ edgeStyle: event.target.value as EdgeStyle })}
          >
            {EDGE_STYLE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="map-edge-style-grid" role="listbox" aria-label="快速选择省界纹理">
          {EDGE_STYLE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={edgeStyle === option.id}
              className={edgeStyle === option.id ? "map-edge-style-chip is-active" : "map-edge-style-chip"}
              title={option.description}
              onClick={() => onPatch({ edgeStyle: option.id })}
            >
              <svg viewBox="0 0 72 18" aria-hidden="true" className="map-edge-style-chip__preview">
                {option.id === "solid" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />}
                {option.id === "dashed" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.2" fill="none" strokeDasharray="8 5" strokeLinecap="round" />}
                {option.id === "dotted" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.6" fill="none" strokeDasharray="0.1 5" strokeLinecap="round" />}
                {option.id === "double" && (
                  <>
                    <path d="M4 9 H68" stroke="currentColor" strokeWidth="5" fill="none" opacity="0.28" strokeLinecap="round" />
                    <path d="M4 9 H68" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                  </>
                )}
                {option.id === "soft-glow" && (
                  <>
                    <path d="M4 9 H68" stroke="currentColor" strokeWidth="6" fill="none" opacity="0.25" strokeLinecap="round" />
                    <path d="M4 9 H68" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                  </>
                )}
                {option.id === "stitch" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.1" fill="none" strokeDasharray="3 4 1 4" strokeLinecap="round" />}
                {option.id === "rail" && (
                  <>
                    <path d="M4 9 H68" stroke="currentColor" strokeWidth="5" fill="none" opacity="0.3" />
                    <path d="M4 9 H68" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="7 4" />
                  </>
                )}
                {option.id === "wave" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.1" fill="none" strokeDasharray="4 2 1 2" strokeLinecap="round" />}
                {option.id === "ornament" && (
                  <>
                    <path d="M4 9 H68" stroke="currentColor" strokeWidth="4.5" fill="none" opacity="0.22" strokeLinecap="round" />
                    <path d="M4 9 H68" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="10 3 2 3" strokeLinecap="round" />
                  </>
                )}
                {option.id === "ink" && <path d="M4 9 H68" stroke="currentColor" strokeWidth="2.4" fill="none" strokeDasharray="12 1.5 4 1.5" strokeLinecap="round" />}
              </svg>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        {number("edgeWidth", map.edgeWidth ?? 1, 0, 20, 0.5, "边界粗细")}
        <label htmlFor="map-edge-color">边界色
          <DeferredInput id="map-edge-color" type="color" value={map.edgeColor} onCommit={(edgeColor) => onPatch({ edgeColor })} />
        </label>
      </div></>}

      {showGlobal && <>
        {collapsible
          ? <details className="property-panel__advanced"><summary>高级设置</summary>{advancedGlobalControls}</details>
          : advancedGlobalControls}
        <label htmlFor="map-land-color">底图色
        <DeferredInput id="map-land-color" type="color" value={map.landColor} onCommit={(landColor) => onPatch({ landColor })} />
      </label>
      <label htmlFor="map-active-color">强调色
        <DeferredInput id="map-active-color" type="color" value={map.activeColor} onCommit={(activeColor) => onPatch({ activeColor })} />
      </label>
      <label htmlFor="map-labels">省份标签
        <input id="map-labels" type="checkbox" checked={map.showProvinceLabels} onChange={(event) => onPatch({ showProvinceLabels: event.target.checked })} />
      </label>
      <label htmlFor="map-render-source">地图显示
        <select id="map-render-source" value={renderSource.kind} onChange={(event) => {
          if (event.target.value === "vector") onPatch({ renderSource: { kind: "vector" } });
          else if (renderSource.kind !== "image") onPatch({ renderSource: { kind: "vector" } });
        }}>
          <option value="vector">原始矢量地图</option>
          <option value="image">上传图片地图</option>
        </select>
      </label>
      <FileDropzone
        id="map-image-upload"
        label="上传 / 替换地图图片"
        hint="PNG / JPG · 点击或拖拽"
        accept="image/*"
        onFile={(file) => uploadMapImage(file)}
      />
      </>}
      {isImageSource(renderSource) && (
        <>
          {showGlobal && <>
            <div className="asset-section__heading"><strong>覆盖适配</strong><small>以原 SVG 省界为基准校准图片</small></div>
          <label htmlFor="map-image-composition">图层模式
            <select
              id="map-image-composition"
              value={renderSource.composition === "overlay" ? "overlay" : "replace"}
              onChange={(event) => patchImage({ composition: event.target.value === "overlay" ? "overlay" : "replace" })}
            >
              <option value="replace">替换底色</option>
              <option value="overlay">覆盖叠加</option>
            </select>
          </label>
          <label htmlFor="map-image-clip">裁剪到省界
            <input
              id="map-image-clip"
              type="checkbox"
              checked={renderSource.clipToMap === true}
              onChange={(event) => patchImage({ clipToMap: event.target.checked })}
            />
          </label>
          <label htmlFor="map-image-fit">图片填充
            <select
              id="map-image-fit"
              value={renderSource.fit}
              onChange={(event) => patchImage({ fit: event.target.value as typeof renderSource.fit })}
            >
              <option value="contain">完整显示</option>
              <option value="cover">铺满裁切</option>
              <option value="stretch">拉伸</option>
            </select>
          </label>
          <label htmlFor="map-image-opacity">图片透明度
            <DeferredInput
              id="map-image-opacity"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={renderSource.opacity}
              onCommit={(opacity) => patchImage({ opacity: Number(opacity) })}
            />
          </label>
          </>}
          {showPlacement && renderSource.alignment && (
            <>
              <label htmlFor="map-align-x">对齐 X
                <DeferredInput
                  id="map-align-x"
                  type="number"
                  step={1}
                  value={renderSource.alignment.x}
                  onCommit={(draft) => {
                    const next = Number(draft);
                    if (Number.isFinite(next)) patchAlignment({ x: next });
                  }}
                />
              </label>
              <label htmlFor="map-align-y">对齐 Y
                <DeferredInput
                  id="map-align-y"
                  type="number"
                  step={1}
                  value={renderSource.alignment.y}
                  onCommit={(draft) => {
                    const next = Number(draft);
                    if (Number.isFinite(next)) patchAlignment({ y: next });
                  }}
                />
              </label>
              <label htmlFor="map-align-width">对齐宽度
                <DeferredInput
                  id="map-align-width"
                  type="number"
                  min={1}
                  step={1}
                  value={renderSource.alignment.width}
                  onCommit={(draft) => {
                    const next = Number(draft);
                    if (Number.isFinite(next) && next > 0) patchAlignment({ width: next });
                  }}
                />
              </label>
              <label htmlFor="map-align-height">对齐高度
                <DeferredInput
                  id="map-align-height"
                  type="number"
                  min={1}
                  step={1}
                  value={renderSource.alignment.height}
                  onCommit={(draft) => {
                    const next = Number(draft);
                    if (Number.isFinite(next) && next > 0) patchAlignment({ height: next });
                  }}
                />
              </label>
              <label htmlFor="map-align-rotation">旋转°
                <DeferredInput
                  id="map-align-rotation"
                  type="number"
                  min={-180}
                  max={180}
                  step={0.5}
                  value={renderSource.alignment.rotation}
                  onCommit={(draft) => {
                    const next = Number(draft);
                    if (Number.isFinite(next)) patchAlignment({ rotation: next });
                  }}
                />
              </label>
            </>
          )}
          {showPlacement && <>
          <label htmlFor="map-image-zindex">覆盖层级
            <DeferredInput
              id="map-image-zindex"
              type="number"
              step={1}
              value={renderSource.zIndex ?? 25}
              onCommit={(draft) => {
                const next = Number(draft);
                if (Number.isFinite(next)) patchImage({ zIndex: Math.floor(next) });
              }}
            />
          </label>
          <ActionGroup label="地图覆盖层级" className="inspector-actions">
            <CompactButton onClick={() => patchImage({ zIndex: 25 })}>省界下</CompactButton>
            <CompactButton onClick={() => patchImage({ zIndex: 60 })}>省界上</CompactButton>
            <CompactButton onClick={() => patchImage({ zIndex: 110 })}>标签上</CompactButton>
          </ActionGroup>
          <CompactButton icon={<Maximize2 size={14} aria-hidden />} onClick={() => { void autoFitCurrent(); }}>自动适配</CompactButton>
          <p className="property-panel__hint">可在画布上直接拖拽角点/边线拉伸覆盖图宽高，或用对齐 X/Y/宽高/旋转微调。覆盖层级决定特色地图相对省界(50)/标签(100)的显示顺序，默认 25 在省界之下。</p>
          </>}
          {showGlobal && <CompactButton variant="ghost" icon={<RotateCcw size={14} aria-hidden />} onClick={() => onPatch({ renderSource: { kind: "vector" } })}>恢复原始地图</CompactButton>}
        </>
      )}
      {showGlobal && <p className="property-panel__hint">点击画布中的省份，可在右侧调整该省贴图；省界线纹理会立即应用到整张地图。</p>}
    </section>
  );
}
