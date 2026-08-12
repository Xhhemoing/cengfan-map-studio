/**
 * Poster export pipeline hook: PNG/SVG/project-package export state and
 * handlers, plus project package import. Extracted from App.tsx (2026-08-12)
 * without behaviour changes; workspace mutations flow back through the
 * `applyImportedPackage` and `reportStatus` callbacks.
 */
import { useRef, useState, type RefObject } from "react";
import { downloadDataUrl, downloadText, serializePosterSvg, svgToPngDataUrl } from "./export-poster";
import { ensureUserFontsLoaded, type UserFont } from "./fonts";
import { createProjectPackage, downloadProjectPackage, parseProjectPackage, type ProjectPackage } from "./project-package";
import type { CustomTemplateRecord } from "./template-store";
import type { UserAsset } from "./assets";
import type { ProjectDocument } from "./project-document";
import type { RenderSettings } from "./render-settings";
import type { DeliveryExportState } from "../components/workspaces/DeliveryWorkspace";

export interface UsePosterExportOptions {
  posterRef: RefObject<SVGSVGElement | null>;
  project: ProjectDocument;
  userAssets: UserAsset[];
  userFonts: UserFont[];
  customTemplates: CustomTemplateRecord[];
  renderSettings: RenderSettings;
  /** Applies an imported package to the workspace (assets/fonts/templates/render settings/project). */
  applyImportedPackage: (pack: ProjectPackage) => void;
  /** Reports user-facing status messages. */
  reportStatus: (message: string) => void;
}

export interface UsePosterExportResult {
  exportingPng: boolean;
  exportState: DeliveryExportState;
  exportError: string | undefined;
  pngScale: number;
  transparentExport: boolean;
  showProjectExportDialog: boolean;
  includeResourcesInProjectExport: boolean;
  setPngScale: (scale: number) => void;
  setTransparentExport: (checked: boolean) => void;
  setShowProjectExportDialog: (open: boolean) => void;
  setIncludeResourcesInProjectExport: (checked: boolean) => void;
  openProjectExportDialog: () => void;
  exportSvg: () => void;
  exportPng: () => Promise<void>;
  exportProjectPackage: () => void;
  retryLastExport: () => void;
  importProjectPackage: (file: File | null) => void;
}

export function usePosterExport(options: UsePosterExportOptions): UsePosterExportResult {
  const { posterRef, project, userAssets, userFonts, customTemplates, renderSettings, applyImportedPackage, reportStatus } = options;
  const [exportingPng, setExportingPng] = useState(false);
  const [exportState, setExportState] = useState<DeliveryExportState>("idle");
  const [exportError, setExportError] = useState<string>();
  const lastExportRef = useRef<"png" | "svg" | "project">("png");
  const [pngScale, setPngScale] = useState(1);
  const [transparentExport, setTransparentExport] = useState(false);
  const [showProjectExportDialog, setShowProjectExportDialog] = useState(false);
  const [includeResourcesInProjectExport, setIncludeResourcesInProjectExport] = useState(true);

  const exportSvg = () => {
    lastExportRef.current = "svg";
    setExportState("exporting");
    setExportError(undefined);
    try {
      const svg = posterRef.current;
      if (!svg) throw new Error("海报预览尚未准备好");
      const source = serializePosterSvg(svg, { transparentBackground: transparentExport });
      downloadText(source, "我的毕业去向图.svg", "image/svg+xml;charset=utf-8");
      setExportState("success");
      reportStatus("SVG 已导出");
    } catch (error) {
      const message = error instanceof Error ? error.message : "SVG 导出失败";
      setExportState("error");
      setExportError(message);
      reportStatus(message);
    }
  };

  const openProjectExportDialog = () => {
    setIncludeResourcesInProjectExport(true);
    setShowProjectExportDialog(true);
  };

  const exportProjectPackage = () => {
    lastExportRef.current = "project";
    setExportState("exporting");
    setExportError(undefined);
    try {
      const exportedAssets = includeResourcesInProjectExport ? userAssets : [];
      const exportedFonts = includeResourcesInProjectExport ? userFonts : [];
      downloadProjectPackage(createProjectPackage({
        project,
        assets: exportedAssets,
        fonts: exportedFonts,
        customTemplates,
        renderSettings,
      }));
      setShowProjectExportDialog(false);
      setExportState("success");
      reportStatus(includeResourcesInProjectExport
        ? `完整工程包已导出：${project.students.length} 条名单、${exportedAssets.length} 个素材、${exportedFonts.length} 个字体、${customTemplates.length} 个模板`
        : `工程已导出（未包含资源包）：${project.students.length} 条名单、${customTemplates.length} 个模板`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "工程包导出失败";
      setExportState("error");
      setExportError(message);
      reportStatus(message);
    }
  };

  const importProjectPackage = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const pack = parseProjectPackage(String(reader.result ?? ""));
        if (!window.confirm(`导入工程将替换当前画布和 ${project.students.length} 条名单，是否继续？`)) return;
        applyImportedPackage(pack);
        reportStatus(`完整工程包已导入：${pack.project.students.length} 条名单、${pack.assets.length} 个素材、${pack.fonts.length} 个字体、${pack.customTemplates.length} 个模板`);
      } catch (error) {
        reportStatus(error instanceof Error ? error.message : "工程包导入失败");
      }
    };
    reader.onerror = () => {
      reportStatus("工程包导入失败");
    };
    reader.readAsText(file);
  };

  const exportPng = async () => {
    lastExportRef.current = "png";
    setExportingPng(true);
    setExportState("exporting");
    setExportError(undefined);
    try {
      const svg = posterRef.current;
      if (!svg) throw new Error("海报预览尚未准备好");
      await ensureUserFontsLoaded(userFonts);
      const source = serializePosterSvg(svg, { transparentBackground: transparentExport, blockFontDisplay: true });
      const dataUrl = await svgToPngDataUrl(source, {
        width: project.canvas.width * pngScale,
        height: project.canvas.height * pngScale,
        transparentBackground: transparentExport,
      });
      downloadDataUrl(dataUrl, "我的毕业去向图.png");
      setExportState("success");
      reportStatus("PNG 已导出");
    } catch (error) {
      const message = error instanceof Error ? error.message : "PNG 导出失败";
      setExportState("error");
      setExportError(message);
      reportStatus(message);
    } finally {
      setExportingPng(false);
    }
  };

  const retryLastExport = () => {
    if (lastExportRef.current === "svg") exportSvg();
    else if (lastExportRef.current === "project") exportProjectPackage();
    else void exportPng();
  };

  return {
    exportingPng,
    exportState,
    exportError,
    pngScale,
    transparentExport,
    showProjectExportDialog,
    includeResourcesInProjectExport,
    setPngScale,
    setTransparentExport,
    setShowProjectExportDialog,
    setIncludeResourcesInProjectExport,
    openProjectExportDialog,
    exportSvg,
    exportPng,
    exportProjectPackage,
    retryLastExport,
    importProjectPackage,
  };
}
