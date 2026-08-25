/**
 * 跳转目标 id：工作台项目列表容器（ProjectGrid 的 section）。
 * 独立成模块供 ProjectWorkbench 的 SkipToStageLink 与 ProjectGrid 共用，
 * 且两个组件文件保持仅导出组件（react-refresh 约束），同 stage-target.ts。
 */
export const WORKBENCH_PROJECTS_TARGET_ID = "workbench-projects";
