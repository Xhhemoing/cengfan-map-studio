/**
 * Poster export pipeline hook: PNG/SVG/project-package export state and
 * handlers, plus project package import. Extracted from App.tsx (2026-08-12)
 * without behaviour changes; workspace mutations flow back through the
 * `applyImportedPackage` and `reportStatus` callbacks.
 */
import { useRef, useState, type RefObject } from "react";
import { availablePngScales, describePngScaleLimit, downloadBlob, downloadText, serializePosterSvg, svgToPngBlob } from "./export-poster";
import { ensureUserFontsLoaded, type UserFont } from "./fonts";
import { PROJECT_PACKAGE_IMPORT_LIMIT, checkImportFileSize } from "./import-file-limits";
import { createProjectPackage, downloadProjectPackage, parseProjectPackage, type ProjectPackage } from "./project-package";
import { hasExternalSvgImages, inlineSvgImages } from "./svg-image-inline";
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

/** 已解析但尚未落地的工程包，等调用方渲染的确认框给出答复。 */
export interface ProjectImportConfirmation {
  fileName: string;
  /** 会被覆盖的当前名单条数。 */
  currentStudentCount: number;
  /** 导入后的名单条数。 */
  nextStudentCount: number;
  assetCount: number;
  fontCount: number;
  templateCount: number;
  /** 解析时被剥离的超限字体/素材说明，非空时确认框要一并展示。 */
  warnings: string[];
}

/** 剥离说明只描述这一次解析结果，拼在状态文案末尾，空数组时不留痕迹。 */
function describeStripped(warnings: string[] | undefined): string {
  return warnings && warnings.length > 0 ? `；已剥离超限内容：${warnings.join("；")}` : "";
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
  exportSvg: () => Promise<void>;
  exportPng: () => Promise<void>;
  exportProjectPackage: () => void;
  retryLastExport: () => void;
  importProjectPackage: (file: File | null) => void;
  /** 非空时调用方必须挂出确认框；在用户表态前工程不会被替换。 */
  projectImportConfirmation: ProjectImportConfirmation | null;
  confirmProjectImport: () => void;
  cancelProjectImport: () => void;
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
  const [pendingProjectImport, setPendingProjectImport] = useState<{ pack: ProjectPackage; fileName: string } | null>(null);

  const exportSvg = async () => {
    lastExportRef.current = "svg";
    setExportState("exporting");
    setExportError(undefined);
    try {
      const svg = posterRef.current;
      if (!svg) throw new Error("海报预览尚未准备好");
      // 校徽是同源相对路径，导出的 .svg 换个环境打开就取不到，内联成 data URL 再落盘。
      // 没有外链时保持同步：不给「无校徽的海报」凭空加一次事件循环往返。
      const serialized = serializePosterSvg(svg, { transparentBackground: transparentExport });
      const source = hasExternalSvgImages(serialized) ? await inlineSvgImages(serialized) : serialized;
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
    // 先判体积再读盘：`readAsText` + `JSON.parse` 都要把整份工程装进内存，
    // 超限的文件读进来只会先卡死标签页，再抛一个用户看不懂的解析错误。
    const oversized = checkImportFileSize(file, PROJECT_PACKAGE_IMPORT_LIMIT);
    if (oversized) {
      reportStatus(oversized);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const pack = parseProjectPackage(String(reader.result ?? ""));
        // 替换整个工程是破坏性动作，交给调用方渲染的确认框决定，
        // 而不是在 FileReader 回调里阻塞式 `window.confirm`。
        setPendingProjectImport({ pack, fileName: file.name });
        // 剥离发生在解析期：用户要在按下「导入并替换」之前就知道这份包少了什么。
        if (pack.warnings?.length) reportStatus(`工程包「${file.name}」解析完成${describeStripped(pack.warnings)}`);
      } catch (error) {
        reportStatus(error instanceof Error ? error.message : "工程包导入失败");
      }
    };
    reader.onerror = () => {
      reportStatus("工程包导入失败");
    };
    reader.readAsText(file);
  };

  const confirmProjectImport = () => {
    if (!pendingProjectImport) return;
    const { pack } = pendingProjectImport;
    // warnings 只描述这一次解析，落到工作区就会被后续导出/镜像当成包内容带走。
    const { warnings, ...applied } = pack;
    setPendingProjectImport(null);
    applyImportedPackage(applied);
    reportStatus(`完整工程包已导入：${applied.project.students.length} 条名单、${applied.assets.length} 个素材、${applied.fonts.length} 个字体、${applied.customTemplates.length} 个模板${describeStripped(warnings)}`);
  };

  const cancelProjectImport = () => {
    if (!pendingProjectImport) return;
    setPendingProjectImport(null);
    reportStatus("已取消导入工程包，当前工程未改动");
  };

  const exportPng = async () => {
    lastExportRef.current = "png";
    setExportingPng(true);
    setExportState("exporting");
    setExportError(undefined);
    try {
      const svg = posterRef.current;
      if (!svg) throw new Error("海报预览尚未准备好");
      const { width, height } = project.canvas;
      // 先判倍率是否可栅格化：超限时连字体加载和序列化都不做，直接给可行动的说明，
      // 而不是等 canvas.toBlob 回 null 再报一句「PNG 编码失败」。
      if (!availablePngScales(width, height).includes(pngScale)) {
        throw new Error(describePngScaleLimit(width, height, pngScale));
      }
      await ensureUserFontsLoaded(userFonts);
      // 内联必须在栅格化之前：SVG-as-image 是受限文档，`/emblems/*.webp` 这类外链
      // 一律加载不到，校徽会静默从 PNG 里消失。
      const source = await inlineSvgImages(serializePosterSvg(svg, { transparentBackground: transparentExport, blockFontDisplay: true }));
      // PNG 走 blob：大倍率导出不再产生整包 base64 字符串，下载后由 downloadBlob 负责 revoke。
      const blob = await svgToPngBlob(source, {
        width: width * pngScale,
        height: height * pngScale,
        transparentBackground: transparentExport,
      });
      downloadBlob(blob, "我的毕业去向图.png");
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
    if (lastExportRef.current === "svg") void exportSvg();
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
    projectImportConfirmation: pendingProjectImport
      ? {
        fileName: pendingProjectImport.fileName,
        currentStudentCount: project.students.length,
        nextStudentCount: pendingProjectImport.pack.project.students.length,
        assetCount: pendingProjectImport.pack.assets.length,
        fontCount: pendingProjectImport.pack.fonts.length,
        templateCount: pendingProjectImport.pack.customTemplates.length,
        warnings: pendingProjectImport.pack.warnings ?? [],
      }
      : null,
    confirmProjectImport,
    cancelProjectImport,
  };
}
