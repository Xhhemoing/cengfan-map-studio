MODEL: gpt-5.6-sol-xhigh-fast

# R3-G2 H-slim 实施记录

## 结果

- 项目列表无项目且无错误时，空态显示「载入示例项目」按钮，使用既有 `secondary-button` 样式。
- 点击后调用 `store.put(createSampleProject())` 并刷新列表；该路径不依赖 `seededRef`，因此首次自动播种完成、用户再删除全部项目后仍可恢复示例。
- 未修改空态原有 `<p>` 文案、`stage-overview.ts`、`WorkbenchHeader.tsx`、`App.tsx` 或 `ProjectWorkbench.test.tsx`。

## failure → cause → fix → recheck

1. **Failure**：先新增回归测试并运行
   `npx vitest run src/components/ProjectWorkbench.reload-sample.test.tsx`，1 个测试失败；删除唯一示例项目后找不到 `aria-label="载入示例项目"` 的按钮。
2. **Cause**：`ProjectGrid` 空态只有说明文案，且 `ProjectWorkbench` 没有显式恢复示例的处理函数；首次播种后的 `seededRef.current` 已为 `true`，不会再次自动播种。
3. **Fix**：为 `ProjectGrid` 增加 `onLoadSample` 与空态按钮；为 `ProjectWorkbench` 增加独立的 `loadSampleProject`，写入 `createSampleProject()` 后调用 `refresh()`，并传给网格。
4. **Recheck**：
   - `npx vitest run src/components/ProjectWorkbench.reload-sample.test.tsx`：通过，1 file / 1 test。
   - `npx eslint src/components/workbench/ProjectGrid.tsx src/components/ProjectWorkbench.tsx src/components/ProjectWorkbench.reload-sample.test.tsx`：通过，无输出。

## 验收方式

打开工作台，删除全部项目并确认出现空态；点击「载入示例项目」，列表应重新显示「示例：2026届毕业去向」。
