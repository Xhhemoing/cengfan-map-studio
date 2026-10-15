import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { PosterCanvas } from "../components/canvas/PosterCanvas";
import type { ProjectDocument } from "./project-document";
import type { UserFont } from "./fonts";
import { fingerprintProject } from "./project-digest";
import { getSceneTextMeasurer } from "./scene-text-measurement";

export interface FrozenPosterMarkup {
  markup: string;
  svg: SVGSVGElement;
  width: number;
  height: number;
  sceneRevision: string;
  fontRevision: number;
  measurementStatus: "estimated" | "measured";
}

function waitForCommit(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const limit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (predicate()) {
        if (timer !== undefined) clearTimeout(timer);
        resolve();
      } else if (Date.now() - started >= limit) {
        if (timer !== undefined) clearTimeout(timer);
        reject(new Error("冻结海报排布尚未完成，请稍后重试"));
      } else {
        timer = setTimeout(check, 16);
      }
    };
    check();
  });
}

/**
 * Render a detached, synchronous export-mode PosterCanvas from a cloned project.
 * No live editor node is read after this function starts; callers own cleanup.
 */
export async function renderFrozenPoster(input: {
  project: ProjectDocument;
  userFonts: UserFont[];
  timeoutMs?: number;
}): Promise<FrozenPosterMarkup> {
  if (typeof document === "undefined") throw new Error("冻结海报需要浏览器渲染环境");
  const project = structuredClone(input.project);
  const userFonts = structuredClone(input.userFonts);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-100000px;top:-100000px;width:0;height:0;overflow:hidden;pointer-events:none";
  document.body.append(host);
  let root: Root | undefined;
  try {
    root = createRoot(host);
    flushSync(() => root!.render(<PosterCanvas project={project} exportMode userFonts={userFonts} />));
    const sceneRevision = fingerprintProject(project);
    await waitForCommit(() => {
      const svg = host.querySelector<SVGSVGElement>("svg[data-scene-revision]");
      return Boolean(svg
        && svg.getAttribute("data-scene-revision") === sceneRevision
        && svg.getAttribute("data-font-revision") === String(getSceneTextMeasurer().getVersion())
        && svg.getAttribute("data-layout-pending") === "false");
    }, input.timeoutMs);
    const svg = host.querySelector<SVGSVGElement>("svg[data-scene-revision]");
    if (!svg) throw new Error("冻结海报尚未生成");
    const fontRevision = Number(svg.getAttribute("data-font-revision"));
    return {
      markup: new XMLSerializer().serializeToString(svg.cloneNode(true) as SVGSVGElement),
      svg: svg.cloneNode(true) as SVGSVGElement,
      width: project.canvas.width,
      height: project.canvas.height,
      sceneRevision,
      fontRevision,
      measurementStatus: svg.getAttribute("data-measurement-status") === "measured" ? "measured" : "estimated",
    };
  } finally {
    root?.unmount();
    host.remove();
  }
}
