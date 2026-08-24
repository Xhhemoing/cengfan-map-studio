import { useState, type ChangeEvent } from "react";
import {
  describeTemplatePackError,
  downloadTemplatePack,
} from "../lib/template-exchange-actions";
import {
  MAX_TEMPLATE_PACK_BYTES,
  TEMPLATE_PACK_FILE_ACCEPT,
  formatTemplatePackBytes,
  readTemplatePackFile,
} from "../lib/template-package";
import type { CustomTemplateRecord } from "../lib/template-store";

/**
 * Template file exchange (`.cengfan-template`). Style and layout only: the roster and the guest
 * panel are removed on export and rejected on import.
 */
export function TemplateExchange({
  customTemplates,
  onImport,
  author,
}: {
  customTemplates: CustomTemplateRecord[];
  onImport: (record: CustomTemplateRecord) => void;
  /** Local nickname used as the signature line; never an account identity. */
  author?: string;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("");

  const selected = customTemplates.find((item) => item.id === selectedId) ?? customTemplates[0];

  const handleExport = () => {
    if (!selected) return;
    try {
      const result = downloadTemplatePack({ record: selected, author });
      setStatus(
        result.tooLargeToImport
          ? `已导出 ${result.filename}（${formatTemplatePackBytes(result.bytes)}），超过 ${formatTemplatePackBytes(MAX_TEMPLATE_PACK_BYTES)} 导入上限，对方可能打不开：请先换用更小的背景图。`
          : `已导出 ${result.filename}（${formatTemplatePackBytes(result.bytes)}）。`,
      );
    } catch (error) {
      setStatus(`导出失败：${describeTemplatePackError(error)}`);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = await readTemplatePackFile(file);
      onImport(imported.record);
      setStatus(
        imported.author
          ? `已导入模板：${imported.record.name}（作者：${imported.author}）。`
          : `已导入模板：${imported.record.name}。`,
      );
    } catch (error) {
      setStatus(`导入失败：${describeTemplatePackError(error)}`);
    }
  };

  return (
    <section className="template-exchange" aria-label="模板文件交换">
      <h4 className="template-exchange__title">模板文件交换</h4>
      <p className="template-exchange__note">
        模板文件只含版式与配色，不含任何学生名单，也不含嘉宾名单。
      </p>
      <div className="template-exchange__actions">
        {customTemplates.length > 0 && (
          <select
            className="template-exchange__select"
            aria-label="选择要导出的模板"
            value={selected?.id ?? ""}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {customTemplates.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="template-exchange__export"
          disabled={!selected}
          onClick={handleExport}
        >
          导出当前模板
        </button>
        <label className="template-exchange__import">
          导入模板文件
          <input
            type="file"
            accept={TEMPLATE_PACK_FILE_ACCEPT}
            aria-label="导入模板文件"
            onChange={handleImport}
          />
        </label>
      </div>
      {customTemplates.length === 0 && (
        <p className="template-exchange__hint">
          先用上方「保存当前整体模板」存一个模板，才能导出给别人。
        </p>
      )}
      <p className="template-exchange__status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}
