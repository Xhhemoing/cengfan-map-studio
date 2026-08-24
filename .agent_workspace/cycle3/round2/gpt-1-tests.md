MODEL: gpt-5.6-sol-xhigh-fast

# C3R2-G1 交叉回归报告

## 新增测试

- `src/App.export-busy.test.ts`
- 读取 `src/App.tsx` 源码，定位同时包含 `ImageDown` 与「导出 PNG」的按钮。
- 断言至少存在两处，并逐一要求使用
  `disabled={posterExport.exportState === "exporting"}`；若任一按钮改回仅检查
  `exportingPng`，测试会失败。

## 命令与输出摘要

```sh
npx vitest run src/lib/import-message.test.ts src/components/DataWorkspace.test.tsx src/lib/export-filename.test.ts src/lib/usePosterExport.test.tsx src/lib/feedback-links.test.ts src/components/HelpFeedbackMenu.test.tsx src/App.test.tsx src/App.export-busy.test.ts server/styles.test.ts src/lib/project-package.test.ts src/components/workspaces/DeliveryWorkspace.test.tsx
```

- 退出码：0
- 测试文件：11 passed (11)
- 测试用例：260 passed (260)
- 耗时：36.03s
- 输出中有 3 条 jsdom `Not implemented: navigation to another Document` 提示，不影响通过结果。

```sh
npx tsc --noEmit -p tsconfig.app.json
```

- 退出码：0
- 输出：无 TypeScript 错误

```sh
npx eslint src/App.export-busy.test.ts src/lib/import-message.ts src/components/DataWorkspace.tsx src/lib/usePosterExport.ts src/lib/feedback-links.ts src/components/HelpFeedbackMenu.tsx
```

- 退出码：0
- 输出：无 ESLint 错误或警告

## 结论

指定交叉回归共通过 260 个用例，类型检查与目标文件 lint 均通过。
