/**
 * Poster export pipeline hook: PNG/SVG/project-package export state and
 * handlers, plus project package import. Extracted from App.tsx (2026-08-12)
 * without behaviour changes; workspace mutations flow back through the
 * `applyImportedPackage` and `reportStatus` callbacks.
 *
 * PNG 走 `svgToPngBlob` + `downloadBlob`（不再经过 base64 data URL），并用
 * `exportGenerationRef` 保证只有最后一次导出能改状态。回滚方案见
 * `export-poster.ts` 顶部注释；本文件只需把 `exportPng` 换回
 * `svgToPngDataUrl` + `downloadDataUrl` 并删掉 generation 判断。
 */
import { useRef, useState, type RefObject } from "react";
import { buildExportFileName } from "./export-filename";
import { downloadBlob, downloadText, serializePosterSvg, svgToPngBlob } from "./export-poster";
import { ensureUserFontsLoaded, type UserFont } from "./fonts";
import { assertProjectPackageSize, createProjectPackage, downloadProjectPackage, parseProjectPackage, type ProjectPackage } from "./project-package";
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
  /** Reads the latest project name when an export starts. */
  getProjectName?: () => string | null;
}

export interface UsePosterExportResult {
  exportingPng: boolean;
  exportState: DeliveryExportState;
  exportError: string | undefined;
  /** File name written by the most recent successful export; undefined once a new export starts. */
  lastExportFileName: string | undefined;
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
  const {
    posterRef,
    project,
    userAssets,
    userFonts,
    customTemplates,
    renderSettings,
    applyImportedPackage,
    reportStatus,
    getProjectName,
  } = options;
  const [exportingPng, setExportingPng] = useState(false);
  const [exportState, setExportState] = useState<DeliveryExportState>("idle");
  const [exportError, setExportError] = useState<string>();
  const [lastExportFileName, setLastExportFileName] = useState<string>();
  const lastExportRef = useRef<"png" | "svg" | "project">("png");
  // PNG 导出是异步的：连点两次、或失败后立刻重试时，先发起的那次落地后不能再
  // 改状态，否则用户看到的是上一轮的结果（旧错误覆盖新成功，或反过来）。
  const exportGenerationRef = useRef(0);
  // 「谁是最后一次 PNG」和「谁是最后一次导出」是两个问题：前者决定这份 PNG 还要不要落盘
  // （只有更晚的一次 PNG 才让它成为多余的文件），后者决定它还能不能改导出状态。
  const latestPngGenerationRef = useRef(0);
  // 「正在导出 PNG」问的是有没有 PNG 在途，与代次无关：被 SVG / 工程包顶掉代次的
  // 那一轮同样要交还自己的占用，否则这个标记永远回不到 false。
  const pngExportsInFlightRef = useRef(0);
  const [pngScale, setPngScale] = useState(1);
  const [transparentExport, setTransparentExport] = useState(false);
  const [showProjectExportDialog, setShowProjectExportDialog] = useState(false);
  const [includeResourcesInProjectExport, setIncludeResourcesInProjectExport] = useState(true);

  const exportSvg = () => {
    lastExportRef.current = "svg";
    exportGenerationRef.current += 1;
    setExportState("exporting");
    setExportError(undefined);
    setLastExportFileName(undefined);
    try {
      const svg = posterRef.current;
      if (!svg) throw new Error("海报预览尚未准备好");
      const source = serializePosterSvg(svg, { transparentBackground: transparentExport });
      const fileName = buildExportFileName({ projectName: getProjectName?.(), kind: "svg" });
      downloadText(source, fileName, "image/svg+xml;charset=utf-8");
      setLastExportFileName(fileName);
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
    exportGenerationRef.current += 1;
    setExportState("exporting");
    setExportError(undefined);
    setLastExportFileName(undefined);
    try {
      const exportedAssets = includeResourcesInProjectExport ? userAssets : [];
      const exportedFonts = includeResourcesInProjectExport ? userFonts : [];
      const pack = createProjectPackage({
        project,
        assets: exportedAssets,
        fonts: exportedFonts,
        customTemplates,
        renderSettings,
      });
      const fileName = buildExportFileName({
        projectName: getProjectName?.(),
        kind: "project",
        date: pack.exportedAt.slice(0, 10),
      });
      downloadProjectPackage(pack, fileName);
      setShowProjectExportDialog(false);
      setLastExportFileName(fileName);
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
    try {
      // 先用 File.size 挡掉超限工程包：readAsText 会把整份文本读进内存。
      assertProjectPackageSize(file.size);
    } catch (error) {
      reportStatus(error instanceof Error ? error.message : "工程包导入失败");
      return;
    }
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
    const generation = (exportGenerationRef.current += 1);
    const isCurrent = () => exportGenerationRef.current === generation;
    latestPngGenerationRef.current = generation;
    const isLatestPng = () => latestPngGenerationRef.current === generation;
    pngExportsInFlightRef.current += 1;
    setExportingPng(true);
    setExportState("exporting");
    setExportError(undefined);
    setLastExportFileName(undefined);
    try {
      const svg = posterRef.current;
      if (!svg) throw new Error("海报预览尚未准备好");
      await ensureUserFontsLoaded(userFonts);
      const source = serializePosterSvg(svg, { transparentBackground: transparentExport, blockFontDisplay: true });
      const blob = await svgToPngBlob(source, {
        width: project.canvas.width * pngScale,
        height: project.canvas.height * pngScale,
        transparentBackground: transparentExport,
      });
      const fileName = buildExportFileName({ projectName: getProjectName?.(), kind: "png", scale: pngScale });
      // 只有更晚的一次 PNG 才让这份成为多余的文件。SVG / 工程包是另一份东西，它顶掉的
      // 是状态而不是产物——把用户点过的 PNG 一起吞掉，等来的会是「SVG 已导出」加一个
      // 从未出现的 PNG。
      if (isLatestPng()) downloadBlob(blob, fileName);
      if (!isCurrent()) return;
      setLastExportFileName(fileName);
      setExportState("success");
      reportStatus("PNG 已导出");
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : "PNG 导出失败";
      setExportState("error");
      setExportError(message);
      reportStatus(message);
    } finally {
      pngExportsInFlightRef.current -= 1;
      if (pngExportsInFlightRef.current === 0) setExportingPng(false);
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
    lastExportFileName,
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
