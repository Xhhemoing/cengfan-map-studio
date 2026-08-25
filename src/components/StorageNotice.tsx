import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import type { ProjectStoreError } from "../lib/project-store";

const MEMORY_MODE_NOTICE = "本次编辑不会保存到本机，请及时导出工程备份";
const MEMORY_MODE_DETAIL = "浏览器本机存储不可用，内容只保留在当前标签页内存中。";

interface StorageNoticeProps {
  /** 最近一次写回失败;配额耗尽这类信息才是用户能动手解决的,优先于通用说明。 */
  recoverError?: ProjectStoreError | null;
  /** 导出入口,由路由决定放几个:工作台逐项目,编辑器至少放当前项目。传入的是 `<li>` 列表项。 */
  exportActions?: ReactNode;
}

/**
 * 存储降级横幅,工作台与编辑器两条路由共用。
 * 只用自己的 `workbench-storage-notice-*` 类:`.workbench-resume` 带 hover 高亮与
 * `:active { transform: scale(.985) }`,状态播报套上去会被当成可点卡片。
 */
export function StorageNotice({ recoverError, exportActions }: StorageNoticeProps) {
  return (
    <section className="workbench-storage-notice" role="status" data-store-health="memory">
      <span className="workbench-storage-notice-icon" aria-hidden="true"><AlertTriangle size={22} /></span>
      <div className="workbench-storage-notice-body">
        <strong>{MEMORY_MODE_NOTICE}</strong>
        <small>{recoverError ? recoverError.message : MEMORY_MODE_DETAIL}</small>
        {exportActions && (
          <ul className="workbench-storage-notice-list" aria-label="逐个导出工程备份">
            {exportActions}
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * 一个按钮只导出一个工程包:Chromium 每个用户手势只放行一次程序化下载,
 * 循环下载从第 2 份起会被静默拦截,用户以为备份完整、实际只拿到第一个文件。
 */
export function StorageNoticeExportAction({
  projectId,
  ariaLabel,
  children,
  onExport,
}: {
  projectId: string;
  ariaLabel: string;
  /** 按钮上的可见文案:工作台放项目名与人数,编辑器放当前项目。 */
  children: ReactNode;
  onExport: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="workbench-storage-notice-export"
        data-export-project-id={projectId}
        aria-label={ariaLabel}
        onClick={onExport}
      >
        {children}
      </button>
    </li>
  );
}

/** 导出失败也要留在横幅里:按钮点了没反应,用户会以为备份已经落盘。 */
export function StorageNoticeActionError({ message }: { message: string }) {
  return <li className="workbench-storage-notice-error" role="alert">{message}</li>;
}
