import type { MapFeature } from "../../lib/map-data";
import type { MapSettings } from "../../lib/scene-document";
import { mapImageElementPlacement, mapImageTransform } from "../../lib/map-alignment";

/** Base plane z-values for ordering the overlay image against map sub-layers. */
export const BORDER_Z = 50;
export const LABEL_Z = 100;

export function renderMapImage(
  settings: MapSettings,
  features: readonly MapFeature[],
  path: (feature: MapFeature) => string | null | undefined,
) {
  const source = settings.renderSource;
  if (source?.kind !== "image") return null;

  const clipId = "map-image-clip";
  const alignment = source.alignment;
  const clipToMap = source.clipToMap === true;

  const imageNode = alignment
    ? (() => {
        const placement = mapImageElementPlacement(alignment);
        const transform = mapImageTransform(alignment);
        return (
          <g data-map-image-aligned transform={transform || undefined}>
            <image
              data-map-image
              href={source.src}
              x={placement.x}
              y={placement.y}
              width={placement.width}
              height={placement.height}
              opacity={source.opacity}
              preserveAspectRatio="none"
              pointerEvents="none"
            />
          </g>
        );
      })()
    : (
      <image
        data-map-image
        href={source.src}
        width={settings.width}
        height={settings.height}
        opacity={source.opacity}
        preserveAspectRatio={
          source.fit === "stretch"
            ? "none"
            : source.fit === "contain"
              ? "xMidYMid meet"
              : "xMidYMid slice"
        }
        pointerEvents="none"
      />
    );

  if (!clipToMap) return imageNode;

  const clipPaths = features
    .map((feature) => path(feature))
    .filter((d): d is string => Boolean(d));

  return (
    <>
      <defs>
        <clipPath id={clipId} data-map-image-clip>
          {clipPaths.map((d, index) => (
            <path key={`map-clip-${index}`} d={d} />
          ))}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>{imageNode}</g>
    </>
  );
}
