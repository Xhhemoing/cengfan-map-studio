import { Download, PackageOpen } from "lucide-react";
import { FileDropzone } from "./FileDropzone";
import { ActionButton, PanelSection } from "./StudioUi";

/** Canvas-bound uploads: raster images (with optional matting) and SVG elements. */
export function AssetPanelUploadSections({
  canvasMatting,
  onCanvasMattingChange,
  onUploadImage,
  onUploadSvg,
}: {
  canvasMatting: boolean;
  onCanvasMattingChange: (matting: boolean) => void;
  onUploadImage: (file: File | null) => void;
  onUploadSvg: (file: File | null) => void;
}) {
  return (
    <>
      <PanelSection title="上传画板图片" label="上传素材">
        <FileDropzone
          id="asset-global-upload"
          label="上传图片到画板"
          hint="PNG / JPG / WEBP / GIF · 点击或拖拽"
          accept="image/*"
          onFile={(file) => onUploadImage(file)}
        />
        <label className="asset-panel__matting" htmlFor="asset-canvas-matting">
          <input id="asset-canvas-matting" type="checkbox" checked={canvasMatting} onChange={(event) => onCanvasMattingChange(event.target.checked)} />
          上传时自动抠图
        </label>
      </PanelSection>

      <PanelSection title="SVG 画布元素" label="导入 SVG 到画布">
        <FileDropzone
          id="asset-svg-canvas-upload"
          label="导入 SVG 到画布"
          hint="SVG · 点击或拖拽"
          accept="image/svg+xml,.svg"
          onFile={(file) => onUploadSvg(file)}
        />
      </PanelSection>
    </>
  );
}

/** Local resource pack export/import, kept last as a low-frequency utility. */
export function AssetPanelResourcePack({
  onExportResourcePack,
  onImportResourcePack,
}: {
  onExportResourcePack?: () => void;
  onImportResourcePack?: (file: File) => void;
}) {
  return (
    <PanelSection title="本地资源包" label="资源包">
      <div className="asset-panel__pack-actions">
        <ActionButton onClick={() => onExportResourcePack?.()}>
          <Download size={16} />导出资源包
        </ActionButton>
        <FileDropzone
          id="asset-pack-import"
          label="导入资源包"
          hint="JSON 资源包 · 点击或拖拽"
          accept="application/json,.json"
          icon={<PackageOpen size={16} aria-hidden />}
          variant="compact"
          onFile={(file) => onImportResourcePack?.(file)}
        />
      </div>
      <p className="panel-note">导出包含本地上传的图片素材与自定义字体，可备份或迁移到其他设备。</p>
    </PanelSection>
  );
}
