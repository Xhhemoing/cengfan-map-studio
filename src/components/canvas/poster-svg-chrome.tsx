import { buildFontFaceCss, type UserFont } from "../../lib/fonts";
import { clampGridSize } from "../../lib/grid";
import type { ProjectDocument } from "../../lib/project-document";

/** Static chrome painted under the layer stack: user font defs, the canvas
 *  background fill / image and the editor-only alignment grid. */
export function PosterSvgChrome({ canvas, userFonts, showEditorGrid, gridSize }: {
  canvas: ProjectDocument["canvas"];
  userFonts: UserFont[];
  showEditorGrid: boolean;
  gridSize: number;
}) {
  const resolvedGridSize = clampGridSize(gridSize);
  return (
    <>
      {userFonts.length > 0 && (
        <defs data-font-faces>
          <style>{buildFontFaceCss(userFonts)}</style>
        </defs>
      )}
      <rect
        width={canvas.width}
        height={canvas.height}
        fill={canvas.backgroundColor}
        opacity={canvas.backgroundOpacity}
        data-canvas-background
      />
      {canvas.backgroundImageSrc && (
        <image
          href={canvas.backgroundImageSrc}
          x={0}
          y={0}
          width={canvas.width}
          height={canvas.height}
          opacity={canvas.backgroundOpacity}
          preserveAspectRatio={canvas.backgroundFit === "stretch" ? "none" : canvas.backgroundFit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}
          data-background-image
        />
      )}

      {showEditorGrid && (
        <g data-editor-grid data-grid-size={resolvedGridSize} pointerEvents="none">
          <defs>
            <pattern
              id="editor-grid-pattern"
              width={resolvedGridSize}
              height={resolvedGridSize}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${resolvedGridSize} 0 L 0 0 0 ${resolvedGridSize}`}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={0.5}
                opacity={0.55}
              />
            </pattern>
          </defs>
          <rect
            width={canvas.width}
            height={canvas.height}
            fill="url(#editor-grid-pattern)"
          />
        </g>
      )}
    </>
  );
}
