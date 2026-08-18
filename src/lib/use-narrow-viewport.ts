import { useEffect, useState } from "react";

/** Matches `.studio-editor-shell` compact chrome in `src/styles.css`. */
export const NARROW_EDITOR_MEDIA_QUERY = "(max-width: 760px)";

export function isNarrowEditorViewport(
  width = typeof window === "undefined" ? 1440 : window.innerWidth,
): boolean {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia(NARROW_EDITOR_MEDIA_QUERY).matches;
  }
  return width <= 760;
}

/**
 * Tracks the editor's compact-chrome breakpoint so React only mounts one copy
 * of each rail (desktop aside vs narrow drawer).
 */
export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(isNarrowEditorViewport);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      const onResize = () => setNarrow(isNarrowEditorViewport(window.innerWidth));
      onResize();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
    const media = window.matchMedia(NARROW_EDITOR_MEDIA_QUERY);
    const onChange = () => setNarrow(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return narrow;
}
