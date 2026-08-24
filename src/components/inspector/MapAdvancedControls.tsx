import { RotateCcw } from "lucide-react";
import { useState } from "react";
import type { MapSettings } from "../../lib/scene-document";
import { getProvinceNames } from "../../lib/map-data";
import { heatPreviewSteps, normalizeHeatScale } from "../../lib/heat-scale";
import { DeferredInput } from "../DeferredInput";
import { CompactButton } from "../StudioUi";

/**
 * Low-frequency global map settings: heat scale, per-province color override,
 * and the South China Sea inset toggle. Rendered either inline or inside the
 * inspector's advanced <details> fold.
 */
export function MapAdvancedControls({ map, onPatch }: {
  map: MapSettings;
  onPatch: (patch: Partial<MapSettings>) => void;
}) {
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

  return (
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
        {/* role="group" makes the aria-label effective; each step also carries
            its depth as text so the mapping is not conveyed by color alone. */}
        <div className="heat-scale-control__preview" role="group" aria-label="热力色阶预览">
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
      <label htmlFor="map-collapse-south-sea" className="boolean-control checkbox-row">
        <input
          id="map-collapse-south-sea"
          type="checkbox"
          checked={map.collapseSouthChinaSea === true}
          onChange={(event) => onPatch({ collapseSouthChinaSea: event.target.checked })}
        />
        <span>南海诸岛折叠成框</span>
      </label>
    </>
  );
}
