import type { DataViewId } from "../../lib/project-data";
import { findProvinceFeature, type MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";
import { resolveFontFamily, type UserFont } from "../../lib/fonts";
import type { FeatureProjection } from "./map-data-projection";
import type { MapLayerThemeColors, StudentPin } from "./MapLayer";

export function StudentPins({
  settings,
  pins,
  features,
  mainlandFeatures,
  projection,
  dataView,
  theme,
  selectedStudentId,
  onSelectStudent,
}: {
  settings: MapSettings;
  pins: readonly StudentPin[];
  features: readonly MapFeature[];
  mainlandFeatures: readonly MapFeature[];
  projection: FeatureProjection;
  dataView: DataViewId;
  theme?: MapLayerThemeColors;
  selectedStudentId: string | null;
  onSelectStudent?: (id: string) => void;
}) {
  return pins.flatMap((pin, index) => {
    const feature = findProvinceFeature(mainlandFeatures, pin.province)
      ?? findProvinceFeature(features, pin.province);
    if (!feature) return [];
    const point = projection.project(feature.center);
    if (!point) return [];
    const angle = index * 2.4;
    const radius = (index % 3) * 10;
    const x = point[0] + Math.cos(angle) * radius;
    const y = point[1] + Math.sin(angle) * radius;
    const pinsView = dataView === "pins";
    return (
      <g
        key={pin.id}
        data-student-pin={pin.id}
        data-selected={selectedStudentId === pin.id || undefined}
        transform={`translate(${x} ${y})`}
        role={onSelectStudent ? "button" : undefined}
        tabIndex={onSelectStudent ? 0 : undefined}
        aria-label={onSelectStudent ? `选择 ${pin.label}` : undefined}
        aria-current={onSelectStudent && selectedStudentId === pin.id ? "true" : undefined}
        onClick={onSelectStudent ? (event) => { event.stopPropagation(); onSelectStudent(pin.id); } : undefined}
        onKeyDown={onSelectStudent ? (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onSelectStudent(pin.id);
          }
        } : undefined}
      >
        <circle
          r={pinsView ? (selectedStudentId === pin.id ? 9 : 6) : 4}
          fill={settings.activeColor}
          stroke="#fff"
          strokeWidth={pinsView ? 2 : 1.5}
        />
        {pinsView && <text x={9} y={4} fill={theme?.ink ?? settings.edgeColor} fontSize={10} fontWeight={700}>{pin.label}</text>}
      </g>
    );
  });
}

export function ProvinceLabels({
  settings,
  features,
  counts,
  projection,
  theme,
  userFonts,
}: {
  settings: MapSettings;
  features: readonly MapFeature[];
  counts: ReadonlyMap<string, number>;
  projection: FeatureProjection;
  theme?: MapLayerThemeColors;
  userFonts: UserFont[];
}) {
  return features.map((feature) => {
    const administrativeCenter = projection.project(feature.center);
    const centroid = projection.centroid(feature);
    const usesAdministrativeCenter = Boolean(administrativeCenter
      && Number.isFinite(administrativeCenter[0])
      && Number.isFinite(administrativeCenter[1]));
    const point = usesAdministrativeCenter ? administrativeCenter : centroid;
    const hasData = (counts.get(feature.name) ?? 0) > 0;
    return point ? (
      <text
        key={`${feature.id}-label`}
        data-province-label={feature.id}
        data-label-anchor={usesAdministrativeCenter ? "administrative-center" : "geometry-centroid"}
        x={point[0]}
        y={point[1]}
        fill={settings.provinceLabelTypography?.color ?? theme?.ink ?? settings.edgeColor}
        textAnchor="middle"
        fontSize={settings.provinceLabelTypography?.fontSize ?? 10}
        fontFamily={resolveFontFamily(
          settings.provinceStyles?.[feature.name]?.labelFontId ?? settings.provinceLabelFontId,
          userFonts,
        )}
      >
        {feature.shortName}{hasData ? "*" : ""}
      </text>
    ) : null;
  });
}

/** Transparent, focusable province hit areas layered above the visuals. */
export function ProvinceHitAreas({
  features,
  projection,
  selectedProvince,
  onSelectProvince,
}: {
  features: readonly MapFeature[];
  projection: FeatureProjection;
  selectedProvince: string | null;
  onSelectProvince: (province: string) => void;
}) {
  return features.map((feature) => (
    <path
      key={`province-hit-${feature.id}`}
      data-province-hit={feature.id}
      d={projection.path(feature) ?? ""}
      fill="transparent"
      stroke="transparent"
      strokeWidth={8}
      role="button"
      tabIndex={0}
      aria-label={`选择${feature.name}`}
      aria-current={selectedProvince === feature.name ? "true" : undefined}
      onClick={(event) => { event.stopPropagation(); onSelectProvince(feature.name); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onSelectProvince(feature.name);
        }
      }}
    />
  ));
}
