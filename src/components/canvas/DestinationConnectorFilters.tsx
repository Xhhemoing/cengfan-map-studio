import type { ResolvedEdgeStyle } from "../../lib/edge-styles";

export function DestinationConnectorFilters({ connectorEdge, connectorWidth }: { connectorEdge: ResolvedEdgeStyle; connectorWidth: number }) {
  return <>
      {connectorEdge.filters.length > 0 && (
        <defs data-connector-edge-filters>
          {connectorEdge.filters.map((filter) => (
            filter.markupKey === "soft-glow" ? (
              <filter key={filter.id} id={filter.id} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation={Math.max(1.2, connectorWidth)} result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ) : filter.markupKey === "ink" ? (
              <filter key={filter.id} id={filter.id} x="-20%" y="-20%" width="140%" height="140%">
                {/* Fixed seed: an unseeded turbulence is renderer-defined, so exports would
                    not match the editor preview pixel for pixel. */}
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="1" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale={Math.max(0.6, connectorWidth * 0.35)} />
              </filter>
            ) : null
          ))}
        </defs>
      )}
  </>;
}
