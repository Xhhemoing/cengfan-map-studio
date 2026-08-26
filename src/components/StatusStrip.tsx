/**
 * 五阶段外壳底部的常驻状态条。
 *
 * 保存、模板、素材、导出的反馈都写进 App 的 `statusMessage`,但旧版检查器是它唯一的
 * 出口;五阶段外壳没有检查器,这些话此前落在地上没人看见。区域必须先于内容变化就存在
 * 读屏才会播报,所以两个 region 常驻挂载、不随消息挂载卸载,失败与成功分走
 * alert / status 两条通道,判定复用名单导入那份纯函数。
 * 子节点写成不带空白的单行:任何空白文本节点都会让 `.data-message:empty`
 * 的收起规则失效,露出空的绿/红框。
 */
import { isImportFailureMessage } from "../lib/import-message";

export interface StatusStripProps {
  message?: string;
}

export function StatusStrip({ message = "" }: StatusStripProps) {
  const failed = message.length > 0 && isImportFailureMessage(message);
  return (
    <div className="editor-status-strip">
      <div role="status" aria-live="polite" aria-atomic="true" className="panel-note data-message">{message && !failed ? <span className="data-message__line">{message}</span> : null}</div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="panel-note data-message data-message--alert">{failed ? <span className="data-message__line">{message}</span> : null}</div>
    </div>
  );
}
