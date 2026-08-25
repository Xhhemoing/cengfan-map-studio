/**
 * 「保存当前整体模板」这一步的接线。
 *
 * 取名与取范围都靠浏览器的 prompt/confirm:两句问话的措辞就是这个功能的全部说明书,
 * 所以它们和抓取、入库、回执文案放在一起,任何一句改动都能在同一处看见。
 */
import type { ProjectDocument } from "./project-document";
import { captureCustomTemplate, withCapturedTemplate } from "./template-capture";
import type { CustomTemplateRecord } from "./template-store";

export interface TemplateCaptureActionOptions {
  project: ProjectDocument;
  customTemplates: CustomTemplateRecord[];
  setCustomTemplates(next: CustomTemplateRecord[]): void;
  reportStatus(message: string): void;
}

export function createTemplateCaptureAction(options: TemplateCaptureActionOptions): () => void {
  return () => {
    const name = window.prompt("自定义模板名称", "我的地图版式");
    if (!name?.trim()) return;
    const scope = window.confirm("点击“确定”保存视觉样式；点击“取消”保存布局倾向（含卡片分组）")
      ? "visual"
      : "layout";
    const record = captureCustomTemplate({ name, scope, project: options.project });
    options.setCustomTemplates(withCapturedTemplate(options.customTemplates, record));
    options.reportStatus(`已保存模板：${record.name}`);
  };
}
