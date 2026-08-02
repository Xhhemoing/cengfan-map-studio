import type { AssetElement } from "../../lib/scene-document";
import { DeferredInput } from "../DeferredInput";

function numberControl(
  asset: AssetElement,
  key: "x" | "y" | "width" | "height" | "rotation" | "opacity",
  label: string,
  min: number,
  max: number,
  onPatch: (patch: Partial<AssetElement>) => void,
) {
  const id = `asset-${key}`;
  return (
    <label htmlFor={id}>
      {label}
      <DeferredInput
        id={id}
        type="number"
        min={min}
        max={max}
        step={key === "opacity" ? 0.05 : 1}
        value={asset[key]}
        onCommit={(draft) => {
          const value = Number(draft);
          if (Number.isFinite(value) && value >= min && value <= max) onPatch({ [key]: value });
        }}
      />
    </label>
  );
}

export function AssetInspector({
  asset,
  onPatch,
  onDelete,
  onDuplicate,
  onLayerChange,
}: {
  asset: AssetElement;
  onPatch: (patch: Partial<AssetElement>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onLayerChange: (delta: -1 | 1) => void;
}) {
  const { id, kind, label, province, visibility } = asset;
  const isTexture = kind === "province-texture";
  const isLandmark = kind === "landmark";
  const kindLabel = isTexture ? "旧省份贴图实例" : isLandmark ? "地域地标" : "普通装饰";

  return (
    <section className="property-panel">
      <header>
        <div>
          <h2>素材属性</h2>
          <small>{kindLabel} · {label}</small>
        </div>
        <button type="button" aria-label="删除素材" onClick={() => onDelete(id)}>删除</button>
      </header>
      {isTexture && (
        <p className="panel-note">
          省份贴图已改为地图底纹（右侧省份属性 / 左侧素材库）。此旧实例可删除；请用「省份素材」重新应用。
        </p>
      )}
      {province && <p className="panel-note">绑定省份：{province}</p>}
      {!isTexture && <>{numberControl(asset, "x", "X", -6000, 6000, onPatch)}{numberControl(asset, "y", "Y", -6000, 6000, onPatch)}</>}
      {!isTexture && <>{numberControl(asset, "width", "宽度", 1, 6000, onPatch)}{numberControl(asset, "height", "高度", 1, 6000, onPatch)}</>}
      {isLandmark && numberControl(asset, "rotation", "旋转", -360, 360, onPatch)}
      {numberControl(asset, "opacity", "透明度", 0, 1, onPatch)}
      <label htmlFor="asset-zindex">
        层级
        <DeferredInput
          id="asset-zindex"
          type="number"
          step={1}
          value={asset.zIndex}
          onCommit={(draft) => {
            const value = Number(draft);
            if (Number.isFinite(value)) onPatch({ zIndex: Math.floor(value) });
          }}
        />
      </label>
      <label htmlFor="asset-visible">
        显示
        <input id="asset-visible" type="checkbox" checked={visibility} onChange={(event) => onPatch({ visibility: event.target.checked })} />
      </label>
      <div className="inspector-actions">
        <button type="button" aria-label="素材上移" onClick={() => onLayerChange(1)}>上移</button>
        <button type="button" aria-label="素材下移" onClick={() => onLayerChange(-1)}>下移</button>
        <button type="button" aria-label="复制素材" onClick={() => onDuplicate(id)}>复制</button>
      </div>
    </section>
  );
}
