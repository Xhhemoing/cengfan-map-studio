/**
 * 名单导入的两个常驻 live region。区域必须先于内容变化存在,读屏才会播报,
 * 所以它们不随消息挂载/卸载;成功与失败分走 status / alert 两条通道。
 * 子节点写成不带空白的单行:任何空白文本节点都会让 `.data-message:empty`
 * 的收起规则失效,露出空的绿/红框。
 */
import { isImportFailureMessage } from "../lib/import-message";

export interface DataMessageRegionsProps {
  message: string;
  replaceConfirmation: { currentCount: number; nextCount: number } | null;
}

export function DataMessageRegions({ message, replaceConfirmation }: DataMessageRegionsProps) {
  const failed = Boolean(message) && isImportFailureMessage(message);
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="panel-note data-message">{replaceConfirmation ? <span className="data-message__line">替换摘要：当前 {replaceConfirmation.currentCount} 条，新 {replaceConfirmation.nextCount} 条</span> : null}{message && !failed ? <span className="data-message__line">{message}</span> : null}</div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="panel-note data-message data-message--alert">{failed ? <span className="data-message__line">{message}</span> : null}</div>
    </>
  );
}
