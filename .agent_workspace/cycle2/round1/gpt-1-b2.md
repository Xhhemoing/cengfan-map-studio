MODEL: gpt-5.6-sol-xhigh-fast

# B2 实施报告

- `ContentLayoutRail` 新增可选模板参数，在当前对象检查器之后以折叠的「整体模板与交换」区域渲染 `TemplatePicker` 和 `TemplateExchange`。
- `App.tsx` 的内容与排版阶段复用了全局设置现有的内置模板、自定义模板应用、保存、导入合并和本地作者昵称逻辑。
- 新增组件测试，覆盖主路径中的模板区域、文件交换入口以及内置模板、自定义模板和保存操作回调。
- 未修改禁止文件，未添加价格字段，未提交或推送。

## 验收证据

- `npx vitest run src/components/workspaces/ContentLayoutWorkspace.test.tsx`：1 个测试文件、4 个测试全部通过。
- `npx eslint src/components/workspaces/ContentLayoutWorkspace.tsx src/components/workspaces/ContentLayoutWorkspace.test.tsx src/App.tsx`：通过。
- `npx tsc -b`：通过。
