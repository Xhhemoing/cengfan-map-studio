import { createCardTextMeasurer, type CardTextMeasurer } from "./card-text-measurement";
import type { UserFont } from "./fonts";
import type { CardTextMeasure } from "./styled-card-text";

export interface SceneTextOptions {
  userFonts?: UserFont[];
  measureText?: CardTextMeasure;
  measurementStatus?: "estimated" | "measured";
  fontRevision?: number;
  /**
   * Returns the source of the widths produced by `measureText`.
   *
   * A callback alone cannot tell callers whether it used Canvas or the
   * deterministic fallback. Keeping this getter alongside the callback lets
   * diagnostics make that distinction without putting a non-serializable
   * measurer into a scene snapshot.
   */
  getMeasurementStatus?: () => "estimated" | "measured";
}

let sharedMeasurer: CardTextMeasurer | undefined;
/** One cache/listener set for the browser lifetime, shared by editor and export canvases. */
export function getSceneTextMeasurer(): CardTextMeasurer {
  return sharedMeasurer ??= createCardTextMeasurer();
}

export function createSceneTextMeasurement(userFonts?: UserFont[]) {
  const measurer = getSceneTextMeasurer();
  let status: "estimated" | "measured" = "measured";
  const measureText: CardTextMeasure = (text, font) => {
    const result = measurer.measure(text, font);
    if (result.status === "estimated") status = "estimated";
    return result.width;
  };
  const getStatus = () => status;
  return {
    options: { userFonts, measureText, getMeasurementStatus: getStatus },
    getStatus,
    fontRevision: measurer.getVersion(),
  };
}
