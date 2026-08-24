import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Maximize2, RotateCcw } from "lucide-react";
import { createId } from "../../lib/ids";
import { autoFitAlignment } from "../../lib/map-alignment";
import type { MapImageAlignment, MapSettings, MapRenderSource } from "../../lib/scene-document";
import { CANVAS_LAYER_Z, CANVAS_LAYER_Z_RANGE } from "../../lib/scene-document";
import { FileDropzone } from "../FileDropzone";
import { DeferredInput } from "../DeferredInput";
import { ActionGroup, CompactButton, IconButton, InspectorHeader } from "../StudioUi";
import { MapAdvancedControls } from "./MapAdvancedControls";
import { MapEdgeStyleControls } from "./MapEdgeStyleControls";

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
  const number = (key: "x" | "y" | "width" | "height" | "scale" | "edgeWidth" | "mapBoundaryMargin", value: number, min: number, max: number, step: number, label: string) => (
    <label htmlFor={`map-${key}`}>{label}
      <DeferredInput id={`map-${key}`} type="number" min={min} max={max} step={step} value={value} onCommit={(draft) => {
        const next = Number(draft);
        if (Number.isFinite(next) && next >= min && next <= max) onPatch({ [key]: next });
      }} />
    </label>
  );
  const renderSource = map.renderSource ?? { kind: "vector" as const };

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

  return (
    <section className="property-panel" aria-label={mode === "placement" ? "地图位置与尺寸" : "地图属性"}>
      <InspectorHeader
        title={mode === "placement" ? "地图位置与尺寸" : "地图属性"}
        actions={showGlobal ? <IconButton label="重置地图" icon={<RotateCcw size={15} />} variant="ghost" onClick={onReset} /> : undefined}
      />
      {showPlacement && <>
        <div className="property-panel__pair" data-property-pair="map-position" role="group" aria-label="地图位置">
          {number("x", map.x, 0, 6000, 1, "X")}
          {number("y", map.y, 0, 6000, 1, "Y")}
        </div>
        <div className="property-panel__pair" data-property-pair="map-size" role="group" aria-label="地图尺寸">
          {number("width", map.width, 1, 6000, 1, "宽度")}
          {number("height", map.height, 1, 6000, 1, "高度")}
        </div>
        {number("scale", map.scale, 0.1, 3, 0.01, "缩放")}
        {number("mapBoundaryMargin", map.mapBoundaryMargin ?? 16, 0, 200, 1, "地图边界安全距离")}
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
        <label htmlFor="map-data-palette">数据省份配色
          <select id="map-data-palette" value={map.dataPalette ?? "single"} onChange={(event) => onPatch({ dataPalette: event.target.value as MapSettings["dataPalette"] })}>
            <option value="single">单色</option>
            <option value="playful">活泼多色</option>
            <option value="pastel">柔和粉彩</option>
            <option value="muted">低饱和纸感</option>
          </select>
        </label>
        <label htmlFor="map-shadow" className="boolean-control checkbox-row">
          <input id="map-shadow" type="checkbox" checked={map.shadow === true} onChange={(event) => onPatch({ shadow: event.target.checked })} />
          <span>地图投影</span>
        </label>
        <MapEdgeStyleControls map={map} onPatch={onPatch} />
      </>}

      {showGlobal && <>
        {collapsible
          ? <details className="property-panel__advanced"><summary>高级设置：热力变色、单独省份颜色、南海诸岛</summary><div className="property-panel__advanced-title">高级设置<small>热力变色 · 单独省份颜色 · 南海诸岛折叠</small></div><MapAdvancedControls map={map} onPatch={onPatch} /></details>
          : <MapAdvancedControls map={map} onPatch={onPatch} />}
        <label htmlFor="map-land-color">底图色
        <DeferredInput id="map-land-color" type="color" value={map.landColor} onCommit={(landColor) => onPatch({ landColor })} />
      </label>
      <label htmlFor="map-active-color">强调色
        <DeferredInput id="map-active-color" type="color" value={map.activeColor} onCommit={(activeColor) => onPatch({ activeColor })} />
      </label>
      <label htmlFor="map-labels" className="boolean-control checkbox-row">
        <input id="map-labels" type="checkbox" checked={map.showProvinceLabels} onChange={(event) => onPatch({ showProvinceLabels: event.target.checked })} />
        <span>省份标签</span>
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
          <label htmlFor="map-image-clip" className="boolean-control checkbox-row">
            <input
              id="map-image-clip"
              type="checkbox"
              checked={renderSource.clipToMap === true}
              onChange={(event) => patchImage({ clipToMap: event.target.checked })}
            />
            <span>裁剪到省界</span>
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
              <div className="property-panel__pair" data-property-pair="map-image-position" role="group" aria-label="图片对齐位置">
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
              </div>
              <div className="property-panel__pair" data-property-pair="map-image-size" role="group" aria-label="图片对齐尺寸">
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
              </div>
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
