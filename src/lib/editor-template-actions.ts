/**
 * 整体模板在编辑器里的全部接线:切换、保存、导入,以及导出签名用的本机昵称。
 *
 * 全局设置整屏与聚焦阶段右栏要的是同一组回调,谁都不该各接一份——两处文案一旦
 * 分叉,用户就会在两个入口看到不一样的上限提示。App 只把状态与已有动作交出来。
 */
import { loadDisplayName } from "./collaboration-identity";
import { createTemplateCaptureAction } from "./editor-template-capture-action";
import type { MapTemplateId } from "./project-data";
import type { ProjectDocument } from "./project-document";
import { createSystemTemplate } from "./template-document";
import { mergeImportedTemplate } from "./template-exchange-actions";
import type { CustomTemplateRecord } from "./template-store";

export interface EditorTemplateActionsOptions {
  project: ProjectDocument;
  currentTemplateId: string;
  customTemplates: CustomTemplateRecord[];
  setCustomTemplates(next: CustomTemplateRecord[]): void;
  applySystemTemplate(id: MapTemplateId): void;
  applyCustomTemplateRecord(record: CustomTemplateRecord): void;
  reportStatus(message: string): void;
}

export interface EditorTemplateActions {
  currentTemplateId: string;
  customTemplates: CustomTemplateRecord[];
  templateAuthor: string;
  onApplyTemplate(id: MapTemplateId): void;
  onApplyCustomTemplate(record: CustomTemplateRecord): void;
  onSaveTemplate(): void;
  onImportTemplateRecord(record: CustomTemplateRecord): void;
}

export function createEditorTemplateActions(options: EditorTemplateActionsOptions): EditorTemplateActions {
  return {
    currentTemplateId: options.currentTemplateId,
    customTemplates: options.customTemplates,
    templateAuthor: loadDisplayName(),
    onApplyTemplate: options.applySystemTemplate,
    onApplyCustomTemplate: options.applyCustomTemplateRecord,
    onSaveTemplate: createTemplateCaptureAction(options),
    onImportTemplateRecord: (record) => {
      const { next, dropped } = mergeImportedTemplate(options.customTemplates, record);
      options.setCustomTemplates(next);
      options.reportStatus(dropped > 0
        ? `已导入模板：${record.name}（已达 20 个上限，替换了最旧的模板）`
        : `已导入模板：${record.name}`);
    },
  };
}

/** 系统模板清单是静态的:每次渲染重算只是白白构造 5 份模板文档。 */
export const SYSTEM_TEMPLATE_OPTIONS = (["original", "cartoon", "grain", "q", "scenery"] as const)
  .map((templateId) => ({ id: templateId, name: createSystemTemplate(templateId).name }));

/**
 * `TemplatePicker` 要的是 id→名称的窄选项,应用回调却要完整记录。
 * 两处外壳都得做同一次 id→记录回查,回查写在这里,外壳只负责摆位置。
 */
export function templatePickerProps(actions: EditorTemplateActions) {
  return {
    templates: SYSTEM_TEMPLATE_OPTIONS,
    currentTemplateId: actions.currentTemplateId,
    customTemplates: actions.customTemplates.map(({ id, name, scope }) => ({ id, name, scope })),
    customTemplateRecords: actions.customTemplates,
    templateAuthor: actions.templateAuthor,
    onApplyTemplate: actions.onApplyTemplate,
    onApplyCustomTemplate: (record: { id: string }) => {
      const full = actions.customTemplates.find((item) => item.id === record.id);
      if (full) actions.onApplyCustomTemplate(full);
    },
    onSaveTemplate: actions.onSaveTemplate,
    onImportTemplateRecord: actions.onImportTemplateRecord,
  };
}
