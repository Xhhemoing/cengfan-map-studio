# Round 1 结论简报 — verify merged code

**HEAD audited:** `origin/main` @ `388eafc` (PR #44) plus follow-up `70f95b9` on `cursor/verify-merged-code-e17a`.  
**Models:** `claude-fable-5-thinking-xhigh` ×2, `claude-opus-5-thinking-high-fast` ×2, `gpt-5.6-sol-xhigh-fast` ×2.

## 已实现 / 已确认有效

- **架构未回滚：** `App.tsx` 923 行，组合 `src/components/editor/*`；无 `studio-editor/`；无冲突标记；无 `.orig/.rej`。
- **KEEP 六路用户面均为 PRESENT：** 公开演示、画布 pan 缓存、社区模板/导入 live region/工程包文件名、名单→交付、印刷尺寸预设、r12-1 中右栏抽取。
- **静态图干净：** `tsc -b --noEmit` 0；1882 相对 import 均可解析。
- **CI on main：** typecheck / lint / test **success**（run 32807192512，约 4m45s）。
- **GitHub Pages workflow 失败（run 32807192510）不是合并损坏：** artifact 构建成功；`deploy-pages` 404 因为仓库未启用 Pages。属运维，非代码错误。
- **全量测试 @ 388eafc：** 351 files / **2411 pass / 2 skip / 0 fail**；lint 0 error / 5 warn。

## 遗留缺陷

1. **BLOCKER 已修（合入本隔离分支）：** UX 合并给 ProjectMenu 加了 PNG 的 `exportState` 灰显，但 SVG 入口未接线；generation guard 会让插队的 SVG/工程包吞掉在途 PNG 且卡住 `exportingPng`。Fix `70f95b9` + 3 tests（2414 pass 声称）。
2. **NITS：** `DataImportConsent` / `print-bleed` / `use-studio-preferences` 是有意摘取的死代码，未接线；不是回归。
3. **NITS：** 旧编辑器顶栏 `WorkflowStepper` 仍显示第六步「素材」，新阶段模型并进「内容」。
4. **NITS：** `scripts/perf-canvas-bench.ts` 的 Student vs PreparedBatchStudent 类型不匹配预存在、不在 tsconfig 内。
5. **NITS：** 若干 pre-merge 孤儿组件（AssetLibraryPanel 等），合并未制造。

## 性能瓶颈

- 无新的合并引入的运行时瓶颈证据。画布 pan 接缝测试存在。Pages 未启用故无线上静态站。

## 下轮攻坚重点

1. 复核 `70f95b9` 是否完整（SVG 灰显、PNG 不被 SVG 取消、PNG-supersede-PNG 仍只下一份）。
2. 不要接线 consent/bleed（超出「确认合并正确」范围），但确认它们不会被误当作已交付。
3. 在含 fix 的 HEAD 上重跑 typecheck/lint/CI 同款测试。
4. 文档对齐：Pages 失败写入验收说明；不把启用 Pages 当成代码修复。
