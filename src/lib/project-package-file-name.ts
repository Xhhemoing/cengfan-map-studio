import { buildExportFileName } from "./export-filename";
import type { ProjectListItem } from "./project-store";

/**
 * 工程包下载文件名。
 * 放在 lib 而不是 StorageNotice.tsx:组件文件里混入非组件导出会打断 Fast Refresh,
 * 而这个纯函数同时被工作台、编辑器路由和横幅三处使用。
 * 命名与编辑器导出共用 `buildExportFileName`,顺带拿到非法字符清洗与空名回退。
 */
export function projectPackageFileName(project: Pick<ProjectListItem, "name" | "updatedAt">): string {
  return buildExportFileName({
    projectName: project.name,
    kind: "project",
    date: project.updatedAt.slice(0, 10),
  });
}
