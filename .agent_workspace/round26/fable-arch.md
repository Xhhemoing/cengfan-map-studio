MODEL_SLUG: claude-fable-5-thinking-xhigh

# Round 26 — fable-arch: AssetPanelLibrary 图标 a11y 补齐

## 结论

`src/components/asset-panel-library.tsx` 中三处 IconButton 的 Lucide 图标缺少 `aria-hidden`，已按其他面板的写法补齐，并新增聚焦测试固定该行为。缺口是真实存在的（非已修复），未跳过。

## 文件改动

- `src/components/asset-panel-library.tsx`（修改，仍为 136 行，远低于 400 行上限）：
  - 省份贴图删除按钮：`icon={<Trash2 size={14} />}` → `icon={<Trash2 size={14} aria-hidden />}`
  - 通用素材抠图按钮：`icon={<Scissors size={14} />}` → `icon={<Scissors size={14} aria-hidden />}`
  - 通用素材删除按钮：`icon={<Trash2 size={14} />}` → `icon={<Trash2 size={14} aria-hidden />}`
- `src/components/asset-panel-library.test.tsx`（新建）：
  - 沿用 `AssetLibraryPanel.test.tsx` / `data-workspace-student-table.test.tsx` 的 createRoot + flushSync + afterEach unmount 模式。
  - Fixture 最小化：一个用户省份贴图（浙江贴图，`kind: "province-texture"`，`provinceIds: ["浙江省"]`）+ 一个装饰素材（校门插画，`kind: "decoration"`，非 SVG data URL 以触发抠图按钮显示）。不含学生 PII。
  - 断言：
    1. 两个删除按钮保留可访问名称（`aria-label="删除素材 …"`）且内部 svg `aria-hidden="true"`；
    2. 抠图按钮显示时其 Scissors svg 同样 `aria-hidden="true"`；
    3. `mattingApplied: true` 时抠图按钮不渲染（守住显示条件，删除按钮仍在）。

未触碰 `AssetPanel.tsx`、`StudioUi.tsx` 或其他文件。

## 测试与证据链

- `npx vitest run src/components/asset-panel-library.test.tsx` → **3 passed / 3**（Vitest v4.1.10，Duration 815ms），首次运行即通过，无 failure→cause→fix 循环需要记录。
- `npx eslint` 对两个触碰文件 → exit 0，无告警。
- 备注：虽然 `StudioUi.tsx` 的 `decorativeIcon` 会兜底克隆 `aria-hidden`，但按仓库约定调用点仍显式书写，测试将该属性钉死在渲染输出上（断言的是 DOM 中 svg 的 `aria-hidden="true"`，两层保障任一失效都会被捕获）。

## 跳过项

无。未运行全量 `npm test`（按指示仅跑目标测试文件）；未做 git commit/push（按规则禁止）。
